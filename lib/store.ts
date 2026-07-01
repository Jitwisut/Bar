import crypto from "crypto";
import { hasRedis, redisCommand } from "./redis";

export type PhotoStatus = "approved" | "pending";

export type Photo = {
  id: string;
  seq: number;
  name: string;
  msg: string;
  ext: string;
  ts: number;
  tint: string;
  status: PhotoStatus;
  displayStartedAt?: number;
  displayUntil?: number;
  deleteAt?: number;
};

const TINTS = [
  "#3a1a5c", "#7a1f5a", "#1f5a6e", "#5c2a1a",
  "#46225e", "#283a6e", "#6e1f4a", "#22526e",
];

const PHOTO_PREFIX = process.env.PHOTO_REDIS_PREFIX ?? "bar:photos";
const PHOTO_TTL_SEC = clampEnvInt("PHOTO_TTL_SEC", 24 * 60 * 60, 60, 30 * 24 * 60 * 60);
const DISPLAY_DELETE_SEC = clampEnvInt("PHOTO_DISPLAY_DELETE_SEC", 5 * 60, 30, 24 * 60 * 60);

function clampEnvInt(name: string, fallback: number, min: number, max: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

function key(name: string) {
  return `${PHOTO_PREFIX}:${name}`;
}

const seqKey = key("seq");
const approvedKey = key("approved");
const pendingKey = key("pending");
const activeKey = key("active");
const cleanupKey = key("cleanup");
const scheduleLockKey = key("schedule-lock");
const metaKey = (id: string) => key(`meta:${id}`);
const imageKey = (id: string) => key(`image:${id}`);

class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve();
  pending = 0;

  add<T>(task: () => Promise<T>): { ahead: number; done: Promise<T> } {
    const ahead = this.pending;
    this.pending++;
    const done = this.tail.then(task, task);
    this.tail = done.then(() => {}, () => {});
    done.finally(() => { this.pending--; });
    return { ahead, done };
  }
}

type State = {
  photos: Photo[];
  buffers: Map<string, { buf: Buffer; ext: string }>;
  seq: number;
  queue: WriteQueue;
};

const g = globalThis as unknown as { __neonStore?: State };

function getState(): State {
  if (!g.__neonStore) {
    g.__neonStore = { photos: [], buffers: new Map(), seq: 0, queue: new WriteQueue() };
  }
  return g.__neonStore;
}

function sanitizeExt(ext: string) {
  return (ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg").replace("jpeg", "jpg");
}

function parsePhoto(raw: string | null): Photo | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Photo;
    return p?.id ? p : null;
  } catch {
    return null;
  }
}

async function redisMetas(ids: string[], zsetForCleanup?: string): Promise<Photo[]> {
  if (ids.length === 0) return [];
  const raw = await redisCommand<Array<string | null>>(["MGET", ...ids.map(metaKey)]);
  const missing: string[] = [];
  const photos = (raw ?? [])
    .map((item, i) => {
      const photo = parsePhoto(item);
      if (!photo) missing.push(ids[i]);
      return photo;
    })
    .filter((p): p is Photo => Boolean(p));

  if (zsetForCleanup && missing.length > 0) {
    await redisCommand(["ZREM", zsetForCleanup, ...missing]);
  }
  return photos;
}

function clampDisplaySec(value: unknown, fallback = 40) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(10 * 60, Math.max(3, Math.round(n)));
}

function clampDeleteAfterSec(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DISPLAY_DELETE_SEC;
  return Math.min(24 * 60 * 60, Math.max(30, Math.round(n)));
}

function secondsUntil(ts: number, now = Date.now()) {
  return Math.max(30, Math.ceil((ts - now) / 1000));
}

function isVisiblePhoto(photo: Photo, now = Date.now()) {
  if (photo.status !== "approved") return false;
  if (photo.deleteAt && photo.deleteAt <= now) return false;
  if (photo.displayUntil && photo.displayUntil <= now) return false;
  return true;
}

function isActivePhoto(photo: Photo, now = Date.now()) {
  return Boolean(
    photo.status === "approved" &&
      photo.displayStartedAt &&
      photo.displayStartedAt <= now &&
      photo.displayUntil &&
      photo.displayUntil > now
  );
}

async function cleanupRedisDisplayed(now = Date.now()) {
  const ids = await redisCommand<string[]>([
    "ZRANGEBYSCORE",
    cleanupKey,
    "-inf",
    now,
    "LIMIT",
    0,
    100,
  ]);
  if (!ids?.length) return;

  const activeId = await redisCommand<string>(["GET", activeKey]);
  const keys = ids.flatMap((id) => [metaKey(id), imageKey(id)]);
  await Promise.all([
    redisCommand(["ZREM", cleanupKey, ...ids]),
    redisCommand(["ZREM", approvedKey, ...ids]),
    redisCommand(["ZREM", pendingKey, ...ids]),
    activeId && ids.includes(activeId)
      ? redisCommand(["DEL", activeKey])
      : Promise.resolve(null),
    keys.length ? redisCommand(["DEL", ...keys]) : Promise.resolve(null),
  ]);
}

async function saveRedisDisplayedPhoto(photo: Photo, now = Date.now()) {
  const ttl = secondsUntil(photo.deleteAt ?? now + PHOTO_TTL_SEC * 1000, now);
  await Promise.all([
    redisCommand(["SETEX", metaKey(photo.id), ttl, JSON.stringify(photo)]),
    redisCommand(["EXPIRE", imageKey(photo.id), ttl]),
    photo.deleteAt
      ? redisCommand(["ZADD", cleanupKey, photo.deleteAt, photo.id])
      : Promise.resolve(null),
  ]);
}

async function readRedisPhoto(id: string): Promise<Photo | null> {
  return parsePhoto(await redisCommand<string>(["GET", metaKey(id)]));
}

async function currentRedisActive(now = Date.now()): Promise<string | null> {
  const id = await redisCommand<string>(["GET", activeKey]);
  if (!id) return null;
  const photo = await readRedisPhoto(id);
  if (photo && isActivePhoto(photo, now)) return id;
  if (photo?.displayUntil && photo.displayUntil <= now) {
    await redisCommand(["ZREM", approvedKey, id]);
  }
  await redisCommand(["DEL", activeKey]);
  return null;
}

async function startNextRedisPhoto(
  displaySec: number,
  deleteAfterSec: number,
  now = Date.now()
) {
  if (await currentRedisActive(now)) return;

  const token = crypto.randomUUID();
  const locked = await redisCommand<string>([
    "SET",
    scheduleLockKey,
    token,
    "NX",
    "PX",
    2000,
  ]);
  if (locked !== "OK") return;

  try {
    if (await currentRedisActive(now)) return;

    const ids = await redisCommand<string[]>(["ZRANGE", approvedKey, 0, 500]);
    for (const id of ids ?? []) {
      const photo = await readRedisPhoto(id);
      if (!photo) {
        await redisCommand(["ZREM", approvedKey, id]);
        continue;
      }
      if (photo.displayUntil && photo.displayUntil <= now) {
        await redisCommand(["ZREM", approvedKey, id]);
        continue;
      }
      if (!isVisiblePhoto(photo, now)) continue;
      if (isActivePhoto(photo, now)) {
        await redisCommand([
          "SET",
          activeKey,
          id,
          "PX",
          Math.max(1000, (photo.displayUntil ?? now) - now),
        ]);
        return;
      }
      if (photo.displayStartedAt) continue;

      const seq = Number(await redisCommand<number>(["INCR", seqKey])) || photo.seq;
      photo.seq = seq;
      photo.displayStartedAt = now;
      photo.displayUntil = now + displaySec * 1000;
      photo.deleteAt = photo.displayUntil + deleteAfterSec * 1000;
      await Promise.all([
        saveRedisDisplayedPhoto(photo, now),
        redisCommand([
          "SET",
          activeKey,
          id,
          "PX",
          Math.max(1000, photo.displayUntil - now),
        ]),
      ]);
      return;
    }
  } finally {
    const currentToken = await redisCommand<string>(["GET", scheduleLockKey]);
    if (currentToken === token) await redisCommand(["DEL", scheduleLockKey]);
  }
}

function cleanupMemoryDisplayed(now = Date.now()) {
  const s = getState();
  const keep: Photo[] = [];
  for (const photo of s.photos) {
    if (photo.deleteAt && photo.deleteAt <= now) {
      s.buffers.delete(photo.id);
    } else {
      keep.push(photo);
    }
  }
  s.photos = keep;
}

function startNextMemoryPhoto(displaySec: number, deleteAfterSec: number, now = Date.now()) {
  const s = getState();
  if (s.photos.some((p) => isActivePhoto(p, now))) return;
  const photo = s.photos.find((p) => isVisiblePhoto(p, now) && !p.displayStartedAt);
  if (!photo) return;
  photo.seq = ++s.seq;
  photo.displayStartedAt = now;
  photo.displayUntil = now + displaySec * 1000;
  photo.deleteAt = photo.displayUntil + deleteAfterSec * 1000;
}

export async function getQueueDepth(): Promise<number> {
  if (hasRedis()) return 0;
  return getState().queue.pending;
}

/** Photos shown on the TV — only approved ones. */
export async function listPhotos(
  sinceSeq = 0,
  options: { displaySec?: unknown; deleteAfterSec?: unknown; schedule?: boolean } = {}
): Promise<Photo[]> {
  const now = Date.now();
  const displaySec = clampDisplaySec(options.displaySec);
  const deleteAfterSec = clampDeleteAfterSec(options.deleteAfterSec);

  if (hasRedis()) {
    await cleanupRedisDisplayed(now);
    if (options.schedule !== false) {
      await startNextRedisPhoto(displaySec, deleteAfterSec, now);
    }
    const ids = await redisCommand<string[]>(["ZRANGE", approvedKey, 0, -1]);
    const photos = await redisMetas(ids ?? [], approvedKey);
    return photos.filter((p) => isVisiblePhoto(p, now));
  }

  cleanupMemoryDisplayed(now);
  if (options.schedule !== false) {
    startNextMemoryPhoto(displaySec, deleteAfterSec, now);
  }
  const s = getState();
  const approved = s.photos.filter((p) => isVisiblePhoto(p, now));
  return sinceSeq > 0 ? approved.filter((p) => p.seq > sinceSeq) : approved;
}

/** Pending photos awaiting staff approval (admin only), newest first. */
export async function listPending(): Promise<Photo[]> {
  if (hasRedis()) {
    const ids = await redisCommand<string[]>(["ZREVRANGE", pendingKey, 0, -1]);
    return redisMetas(ids ?? [], pendingKey);
  }

  return getState().photos.filter((p) => p.status === "pending").reverse();
}

export async function pendingCount(): Promise<number> {
  if (hasRedis()) {
    return (await redisCommand<number>(["ZCARD", pendingKey])) ?? 0;
  }
  return getState().photos.filter((p) => p.status === "pending").length;
}

export async function latestSeq(): Promise<number> {
  if (hasRedis()) {
    const seq = await redisCommand<string | number>(["GET", seqKey]);
    return Number(seq ?? 0);
  }
  return getState().seq;
}

export async function addPhoto(input: {
  buffer: Buffer;
  ext: string;
  name: string;
  msg: string;
  status?: PhotoStatus;
  nameMaxLen?: number;
  msgMaxLen?: number;
}): Promise<{ photo: Photo; queuedAhead: number }> {
  if (hasRedis()) {
    const id = crypto.randomUUID();
    const ext = sanitizeExt(input.ext);
    const seq = Number(await redisCommand<number>(["INCR", seqKey])) || Date.now();
    const status = input.status ?? "approved";
    const photo: Photo = {
      id, ext, seq,
      name: (input.name || "").trim().slice(0, input.nameMaxLen ?? 40) || "ไม่ระบุชื่อ",
      msg: (input.msg || "").trim().slice(0, input.msgMaxLen ?? 120),
      ts: Date.now(),
      tint: TINTS[seq % TINTS.length],
      status,
    };

    await Promise.all([
      redisCommand(["SETEX", metaKey(id), PHOTO_TTL_SEC, JSON.stringify(photo)]),
      redisCommand(["SETEX", imageKey(id), PHOTO_TTL_SEC, input.buffer.toString("base64")]),
      redisCommand(["ZADD", status === "pending" ? pendingKey : approvedKey, seq, id]),
    ]);
    return { photo, queuedAhead: 0 };
  }

  const s = getState();
  const { ahead, done } = s.queue.add(async () => {
    const id = crypto.randomUUID();
    const ext = sanitizeExt(input.ext);
    const photo: Photo = {
      id, ext,
      seq: ++s.seq,
      name: (input.name || "").trim().slice(0, input.nameMaxLen ?? 40) || "ไม่ระบุชื่อ",
      msg: (input.msg || "").trim().slice(0, input.msgMaxLen ?? 120),
      ts: Date.now(),
      tint: TINTS[s.photos.length % TINTS.length],
      status: input.status ?? "approved",
    };

    s.buffers.set(id, { buf: input.buffer, ext });
    s.photos.push(photo);
    return photo;
  });

  const photo = await done;
  return { photo, queuedAhead: ahead };
}

export async function getImageBuffer(id: string): Promise<{ buf: Buffer; ext: string } | null> {
  if (hasRedis()) {
    const raw = await redisCommand<Array<string | null>>(["MGET", metaKey(id), imageKey(id)]);
    const [metaRaw, imageRaw] = raw ?? [];
    const photo = parsePhoto(metaRaw);
    if (!photo || !imageRaw) return null;
    return { buf: Buffer.from(imageRaw, "base64"), ext: photo.ext };
  }

  return getState().buffers.get(id) ?? null;
}

/** Approve a pending photo → give it a fresh seq so pollers pick it up as new. */
export async function approvePhoto(id: string): Promise<boolean> {
  if (hasRedis()) {
    const metaRaw = await redisCommand<string>(["GET", metaKey(id)]);
    const p = parsePhoto(metaRaw);
    if (!p || p.status !== "pending") return false;

    const seq = Number(await redisCommand<number>(["INCR", seqKey])) || Date.now();
    p.status = "approved";
    p.seq = seq;
    p.ts = Date.now();
    delete p.displayStartedAt;
    delete p.displayUntil;
    delete p.deleteAt;

    await Promise.all([
      redisCommand(["SETEX", metaKey(id), PHOTO_TTL_SEC, JSON.stringify(p)]),
      redisCommand(["EXPIRE", imageKey(id), PHOTO_TTL_SEC]),
      redisCommand(["ZREM", pendingKey, id]),
      redisCommand(["ZADD", approvedKey, seq, id]),
    ]);
    return true;
  }

  const s = getState();
  return s.queue.add(async () => {
    const p = s.photos.find((x) => x.id === id && x.status === "pending");
    if (!p) return false;
    p.status = "approved";
    p.seq = ++s.seq;
    p.ts = Date.now();
    delete p.displayStartedAt;
    delete p.displayUntil;
    delete p.deleteAt;
    return true;
  }).done;
}

/** Schedule a shown photo for deletion; optionally remove it from the approved feed. */
export async function markPhotoDisplayed(
  id: string,
  deleteAfterSec: unknown = DISPLAY_DELETE_SEC,
  removeFromFeed = true
): Promise<boolean> {
  const ttl = clampDeleteAfterSec(deleteAfterSec);

  if (hasRedis()) {
    const photo = await readRedisPhoto(id);
    if (!photo) return false;
    const now = Date.now();
    const base = removeFromFeed ? Math.max(now, photo.displayUntil ?? now) : now;
    const deleteAt = base + ttl * 1000;
    photo.deleteAt = photo.deleteAt ? Math.min(photo.deleteAt, deleteAt) : deleteAt;
    await saveRedisDisplayedPhoto(photo, now);
    return true;
  }

  const s = getState();
  const photo = s.photos.find((p) => p.id === id);
  if (!photo) return false;
  const now = Date.now();
  const base = removeFromFeed ? Math.max(now, photo.displayUntil ?? now) : now;
  const deleteAt = base + ttl * 1000;
  photo.deleteAt = photo.deleteAt ? Math.min(photo.deleteAt, deleteAt) : deleteAt;
  return true;
}

/** Reject/delete a photo (used for pending rejection). */
export async function rejectPhoto(id: string): Promise<boolean> {
  if (hasRedis()) {
    const removed = await redisCommand<number>(["ZREM", pendingKey, id]);
    await Promise.all([
      redisCommand(["ZREM", approvedKey, id]),
      redisCommand(["ZREM", cleanupKey, id]),
      redisCommand(["DEL", metaKey(id), imageKey(id)]),
    ]);
    return (removed ?? 0) > 0;
  }

  const s = getState();
  return s.queue.add(async () => {
    const idx = s.photos.findIndex((x) => x.id === id);
    if (idx === -1) return false;
    s.photos.splice(idx, 1);
    s.buffers.delete(id);
    return true;
  }).done;
}

export async function clearPhotos(): Promise<void> {
  if (hasRedis()) {
    const [approvedIds, pendingIds] = await Promise.all([
      redisCommand<string[]>(["ZRANGE", approvedKey, 0, -1]),
      redisCommand<string[]>(["ZRANGE", pendingKey, 0, -1]),
    ]);
    const ids = Array.from(new Set([...(approvedIds ?? []), ...(pendingIds ?? [])]));
    const keys = ids.flatMap((id) => [metaKey(id), imageKey(id)]);
    await redisCommand([
      "DEL",
      approvedKey,
      pendingKey,
      cleanupKey,
      activeKey,
      scheduleLockKey,
      seqKey,
      ...keys,
    ]);
    return;
  }

  const s = getState();
  await s.queue.add(async () => {
    s.photos = [];
    s.buffers.clear();
    s.seq = 0;
  }).done;
}
