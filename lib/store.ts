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

export async function getQueueDepth(): Promise<number> {
  if (hasRedis()) return 0;
  return getState().queue.pending;
}

/** Photos shown on the TV — only approved ones. */
export async function listPhotos(sinceSeq = 0): Promise<Photo[]> {
  if (hasRedis()) {
    const min = sinceSeq > 0 ? sinceSeq + 1 : "-inf";
    const ids = await redisCommand<string[]>(["ZRANGEBYSCORE", approvedKey, min, "+inf"]);
    return redisMetas(ids ?? [], approvedKey);
  }

  const s = getState();
  const approved = s.photos.filter((p) => p.status === "approved");
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
    return true;
  }).done;
}

/** Mark a shown photo as done; it will be deleted after PHOTO_DISPLAY_DELETE_SEC. */
export async function markPhotoDisplayed(id: string): Promise<boolean> {
  if (hasRedis()) {
    const removed = await redisCommand<number>(["ZREM", approvedKey, id]);
    await Promise.all([
      redisCommand(["EXPIRE", metaKey(id), DISPLAY_DELETE_SEC]),
      redisCommand(["EXPIRE", imageKey(id), DISPLAY_DELETE_SEC]),
    ]);
    return (removed ?? 0) > 0;
  }

  const s = getState();
  if (!s.photos.some((p) => p.id === id)) return false;
  setTimeout(() => {
    const idx = s.photos.findIndex((p) => p.id === id);
    if (idx !== -1) s.photos.splice(idx, 1);
    s.buffers.delete(id);
  }, DISPLAY_DELETE_SEC * 1000);
  return true;
}

/** Reject/delete a photo (used for pending rejection). */
export async function rejectPhoto(id: string): Promise<boolean> {
  if (hasRedis()) {
    const removed = await redisCommand<number>(["ZREM", pendingKey, id]);
    await Promise.all([
      redisCommand(["ZREM", approvedKey, id]),
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
    await redisCommand(["DEL", approvedKey, pendingKey, seqKey, ...keys]);
    return;
  }

  const s = getState();
  await s.queue.add(async () => {
    s.photos = [];
    s.buffers.clear();
    s.seq = 0;
  }).done;
}
