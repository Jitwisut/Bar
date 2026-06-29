import crypto from "crypto";

export type Photo = {
  id: string;
  seq: number;
  name: string;
  msg: string;
  ext: string;
  ts: number;
  tint: string;
};

const TINTS = [
  "#3a1a5c", "#7a1f5a", "#1f5a6e", "#5c2a1a",
  "#46225e", "#283a6e", "#6e1f4a", "#22526e",
];

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

export function getQueueDepth(): number {
  return getState().queue.pending;
}

export function listPhotos(sinceSeq = 0): Photo[] {
  const s = getState();
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
  const s = getState();

  const { ahead, done } = s.queue.add(async () => {
    const id = crypto.randomUUID();
    const ext = (input.ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg").replace("jpeg", "jpg");

    const photo: Photo = {
      id, ext,
      seq: ++s.seq,
      name: (input.name || "").trim().slice(0, 40) || "ไม่ระบุชื่อ",
      msg: (input.msg || "").trim().slice(0, 120),
      ts: Date.now(),
      tint: TINTS[s.photos.length % TINTS.length],
    };

    s.buffers.set(id, { buf: input.buffer, ext });
    s.photos.push(photo);
    return photo;
  });

  const photo = await done;
  return { photo, queuedAhead: ahead };
}

export function getImageBuffer(id: string): { buf: Buffer; ext: string } | null {
  return getState().buffers.get(id) ?? null;
}

export async function clearPhotos(): Promise<void> {
  const s = getState();
  await s.queue.add(async () => {
    s.photos = [];
    s.buffers.clear();
    s.seq = 0;
  }).done;
}
