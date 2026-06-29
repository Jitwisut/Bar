import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export type Photo = {
  id: string;
  seq: number; // monotonic, used for incremental polling
  name: string;
  msg: string;
  ext: string;
  ts: number;
  tint: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const META_FILE = path.join(DATA_DIR, "photos.json");

// Caption background tints, reused from the original design palette.
const TINTS = [
  "#3a1a5c",
  "#7a1f5a",
  "#1f5a6e",
  "#5c2a1a",
  "#46225e",
  "#283a6e",
  "#6e1f4a",
  "#22526e",
];

/**
 * Serialises async tasks so only one runs at a time. Every photo upload mutates
 * the shared photos.json (read-modify-write), so concurrent POSTs would race and
 * lose data. The queue lines them up — handling bursts safely — and reports how
 * many were already waiting when a task was enqueued.
 */
class WriteQueue {
  private tail: Promise<unknown> = Promise.resolve();
  pending = 0;

  add<T>(task: () => Promise<T>): { ahead: number; done: Promise<T> } {
    const ahead = this.pending;
    this.pending++;
    const done = this.tail.then(task, task);
    // Keep the chain alive even if a task rejects, and decrement when settled.
    this.tail = done.then(
      () => {},
      () => {}
    );
    done.finally(() => {
      this.pending--;
    });
    return { ahead, done };
  }
}

type State = {
  photos: Photo[];
  seq: number;
  loaded: boolean;
  queue: WriteQueue;
};

// Single shared instance across requests + dev HMR.
const g = globalThis as unknown as { __neonStore?: State };

function getState(): State {
  if (!g.__neonStore) {
    g.__neonStore = { photos: [], seq: 0, loaded: false, queue: new WriteQueue() };
  }
  return g.__neonStore;
}

async function ensureLoaded(): Promise<State> {
  const s = getState();
  if (s.loaded) return s;
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(META_FILE, "utf8");
    const parsed = JSON.parse(raw) as Photo[];
    // Backfill seq for any legacy records, then continue the counter.
    s.photos = parsed.map((p, i) => ({ ...p, seq: p.seq ?? i + 1 }));
    s.seq = s.photos.reduce((m, p) => Math.max(m, p.seq), 0);
  } catch {
    s.photos = [];
    s.seq = 0;
  }
  s.loaded = true;
  return s;
}

async function persist(s: State) {
  await fs.writeFile(META_FILE, JSON.stringify(s.photos, null, 2));
}

export function getQueueDepth(): number {
  return getState().queue.pending;
}

export async function listPhotos(sinceSeq = 0): Promise<Photo[]> {
  const s = await ensureLoaded();
  return sinceSeq > 0 ? s.photos.filter((p) => p.seq > sinceSeq) : s.photos;
}

export function latestSeq(): number {
  return getState().seq;
}

export async function addPhoto(input: {
  buffer: Buffer;
  ext: string;
  name: string;
  msg: string;
}): Promise<{ photo: Photo; queuedAhead: number }> {
  const s = await ensureLoaded();

  const { ahead, done } = s.queue.add(async () => {
    const id = crypto.randomUUID();
    const ext = (
      input.ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg"
    ).replace("jpeg", "jpg");

    await fs.writeFile(path.join(UPLOAD_DIR, `${id}.${ext}`), input.buffer);

    const photo: Photo = {
      id,
      ext,
      seq: ++s.seq,
      name: (input.name || "").trim().slice(0, 40) || "ไม่ระบุชื่อ",
      msg: (input.msg || "").trim().slice(0, 120),
      ts: Date.now(),
      tint: TINTS[s.photos.length % TINTS.length],
    };

    s.photos.push(photo);
    await persist(s);
    return photo;
  });

  const photo = await done;
  return { photo, queuedAhead: ahead };
}

export async function getImageFile(
  id: string
): Promise<{ path: string; ext: string } | null> {
  const s = await ensureLoaded();
  const p = s.photos.find((x) => x.id === id);
  if (!p) return null;
  return { path: path.join(UPLOAD_DIR, `${p.id}.${p.ext}`), ext: p.ext };
}

export async function clearPhotos(): Promise<void> {
  const s = await ensureLoaded();
  await s.queue.add(async () => {
    s.photos = [];
    s.seq = 0; // reset so pollers detect the wipe (latestSeq drops)
    await persist(s);
    try {
      const files = await fs.readdir(UPLOAD_DIR);
      await Promise.all(
        files.map((f) => fs.rm(path.join(UPLOAD_DIR, f)).catch(() => {}))
      );
    } catch {
      /* ignore */
    }
  }).done;
}
