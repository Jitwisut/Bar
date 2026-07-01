import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

export type PaymentSettings = {
  enabled: boolean;
  amountBaht: number;
  promptPayId: string; // phone number or national ID
  requireApproval: boolean; // true = staff must approve; false = trust "paid"
};

/** Values shown to customers / on the TV — safe to expose publicly. */
export type PublicSettings = {
  brandName: string;
  tagline: string;
  idleTitle: string;
  idleSub: string;
  qrHeading: string;
  qrSub: string;
  tvDurationSec: number;
  slideshowDurationSec: number;
  nameMaxLen: number;
  msgMaxLen: number;
  maxUploadMB: number;
  captions: string[];
  payment: PaymentSettings;
};

/** Full record persisted to disk — includes the secret PIN hash. */
type StoredSettings = PublicSettings & {
  pinHash: string | null;
  pinSalt: string | null;
};

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "settings.json");

// Defaults mirror the values currently hardcoded across the app, so behaviour
// is identical until the owner changes something.
const DEFAULTS: StoredSettings = {
  brandName: "NEON BAR",
  tagline: "สแกน QR ส่งรูปขึ้นจอทีวีที่ร้านแบบเรียลไทม์",
  idleTitle: "รอรูปขึ้นจอ",
  idleSub: "สแกน QR เพื่อส่งรูป",
  qrHeading: "OPEN A WARP",
  qrSub: "สแกนเพื่อส่งรูปขึ้นจอ",
  tvDurationSec: 40,
  slideshowDurationSec: 60,
  nameMaxLen: 40,
  msgMaxLen: 120,
  maxUploadMB: 15,
  captions: [
    "เมาไม่มาก แค่เพื่อนต้องลากไปส่ง",
    "เหล้าไม่แรง…แต่ใจเต้นแรงมาก",
    "ดื่มไม่บ่อย แค่ลอยทุกเช้า",
    "เมาแบบมีชั้นเชิง…เดินเซแบบมีสไตล์",
    "เมาแล้วพูดไม่เพราะ แต่น่ารักอะเนอะเลยไม่ถือ",
    "เมาเหล้าก็เสียหลัก เมารักก็เสียเงิน",
    "เห็นเธอเทไม่ยั้ง เราเลยไม่รั้งเธอไว้",
    "เปย์กันอย่างนี้นาน นานนะเธอ",
    "ไม่รู้ทำไมอยากเมาทีไร คิดถึงแกทุกที",
    "ปาร์ตี้ในคืนวันเสาร์ กับความเหงาในเช้าวันอาทิตย์",
    "วันนี้ไม่เน้นเมา เน้นเอาใจเธอมากกว่า",
    "แก้วนี้ยังว่าง คนข้างๆ ก็เหมือนกัน",
    "ปาร์ตี้เบา ๆ แต่ตัวเราไม่เบาแล้วนะ",
    "คืนนี้ไม่มีหลง แต่ลงรถผิดสถานี",
    "ปาร์ตี้แบบมีเธอ ก็เผลอใจง่ายเป็นพิเศษ",
    "กลางวันทำงาน กลางคืนทำมึน",
    "ถ้าเมาแล้วเดินหลง ให้เราไปส่งป่ะ",
    "เหล้าทำลายตับ แต่เธอทำลายใจ",
    "คืนนี้ไม่ชอบคนหรู แต่ขอคนที่ดูจริงใจ",
    "กลางคืนแค่ลั้นลา พอเช้ามาแทบตาย",
    "ไม่มีหรอกคนลูบหัว ส่วนมากมีแต่คนลูบหลัง",
    "ถ้าเขาจะรัก กลับบ้านเช้าเขาก็รัก",
    "ตับแข็งเรื่องเล็ก หมดเป๊กเรื่องใหญ่",
    "อยากชวนเธอไปร้านนั่งชิล ไปนั่งเล่นกันแบบฟีลแฟน",
    "เวลาเมา คำว่าเบาก็ไม่มีในโลก",
    "โครตเหนื่อย โครตเพลีย ขอเบียร์สักแก้ว",
    "อุบัติเหตุที่ชอบที่สุดคือ ชนแก้ว",
    "ถ้าเรารวย เราจะซื้อเบียร์ไปสู่ขอเธอ",
    "ได้หมดถ้าสดชื่น ถ้าไม่ลื่นก็เดินไหว",
    "กินเหล้าอาจจะเมา... แต่ถ้ากินเรา รับรองว่าติดใจ",
    "เมาแล้วเดินเซ... ให้เปย์ไปส่งที่ห้องไหมคะ?",
    "แก้วนี้โซจู ส่วนยูอ่ะโซฮอต... คืนนี้ขออนุอดพากลับนะ",
    "เหล้าไม่เมา... แต่คนข้างๆ ทำไมใจสั่นจัง",
    "คืนนี้เพื่อนไม่ว่าง... ขออนุญาตให้เธอเป็นคนพากลับแทนนะ",
  ],
  payment: {
    enabled: false,
    amountBaht: 20,
    promptPayId: "",
    requireApproval: true,
  },
  pinHash: null,
  pinSalt: null,
};

type State = {
  data: StoredSettings;
  loaded: boolean;
  writing: Promise<unknown>;
};

const g = globalThis as unknown as { __neonSettings?: State };

function getState(): State {
  if (!g.__neonSettings) {
    g.__neonSettings = {
      data: structuredClone(DEFAULTS),
      loaded: false,
      writing: Promise.resolve(),
    };
  }
  return g.__neonSettings;
}

async function ensureLoaded(): Promise<State> {
  const s = getState();
  if (s.loaded) return s;
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    // Deep-merge onto defaults so new fields added later still have a value.
    s.data = {
      ...DEFAULTS,
      ...parsed,
      payment: { ...DEFAULTS.payment, ...(parsed.payment ?? {}) },
      captions: Array.isArray(parsed.captions)
        ? parsed.captions
        : DEFAULTS.captions,
    };
  } catch {
    s.data = structuredClone(DEFAULTS);
  }
  s.loaded = true;
  return s;
}

function toPublic(d: StoredSettings): PublicSettings {
  // Explicitly whitelist — never leak pinHash/pinSalt.
  const { pinHash: _h, pinSalt: _s, ...pub } = d;
  void _h;
  void _s;
  return pub;
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const s = await ensureLoaded();
  return toPublic(s.data);
}

/** Server-only: full record including secret fields. */
export async function getStoredSettings(): Promise<StoredSettings> {
  const s = await ensureLoaded();
  return s.data;
}

export async function isPinSet(): Promise<boolean> {
  const s = await ensureLoaded();
  return Boolean(s.data.pinHash && s.data.pinSalt);
}

async function persist(s: State) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(s.data, null, 2));
}

/** Serialise writes to avoid clobbering settings.json under concurrency. */
function enqueueWrite(s: State, mutate: () => void): Promise<void> {
  const next = s.writing.then(async () => {
    mutate();
    await persist(s);
  });
  // keep the chain alive even if a write rejects
  s.writing = next.then(
    () => {},
    () => {}
  );
  return next;
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Merge a public-settings patch, validating numeric bounds. */
export async function savePublicSettings(
  patch: Partial<PublicSettings>
): Promise<PublicSettings> {
  const s = await ensureLoaded();
  await enqueueWrite(s, () => {
    const d = s.data;
    if (typeof patch.brandName === "string")
      d.brandName = patch.brandName.trim().slice(0, 40) || DEFAULTS.brandName;
    if (typeof patch.tagline === "string") d.tagline = patch.tagline.slice(0, 160);
    if (typeof patch.idleTitle === "string") d.idleTitle = patch.idleTitle.slice(0, 60);
    if (typeof patch.idleSub === "string") d.idleSub = patch.idleSub.slice(0, 80);
    if (typeof patch.qrHeading === "string") d.qrHeading = patch.qrHeading.slice(0, 40);
    if (typeof patch.qrSub === "string") d.qrSub = patch.qrSub.slice(0, 60);
    if (patch.tvDurationSec !== undefined)
      d.tvDurationSec = clampInt(patch.tvDurationSec, 5, 600, d.tvDurationSec);
    if (patch.slideshowDurationSec !== undefined)
      d.slideshowDurationSec = clampInt(patch.slideshowDurationSec, 3, 600, d.slideshowDurationSec);
    if (patch.nameMaxLen !== undefined)
      d.nameMaxLen = clampInt(patch.nameMaxLen, 10, 100, d.nameMaxLen);
    if (patch.msgMaxLen !== undefined)
      d.msgMaxLen = clampInt(patch.msgMaxLen, 20, 300, d.msgMaxLen);
    if (patch.maxUploadMB !== undefined)
      d.maxUploadMB = clampInt(patch.maxUploadMB, 1, 50, d.maxUploadMB);
    if (Array.isArray(patch.captions))
      d.captions = patch.captions
        .map((c) => String(c).trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 200);
    if (patch.payment) {
      const p = patch.payment;
      if (typeof p.enabled === "boolean") d.payment.enabled = p.enabled;
      if (p.amountBaht !== undefined)
        d.payment.amountBaht = clampInt(p.amountBaht, 0, 100000, d.payment.amountBaht);
      if (typeof p.promptPayId === "string")
        d.payment.promptPayId = p.promptPayId.replace(/[^0-9]/g, "").slice(0, 15);
      if (typeof p.requireApproval === "boolean")
        d.payment.requireApproval = p.requireApproval;
    }
  });
  return toPublic(s.data);
}

// ── PIN ────────────────────────────────────────────────────────────────────
function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString("hex");
}

export async function setPin(pin: string): Promise<void> {
  const s = await ensureLoaded();
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPin(pin, salt);
  await enqueueWrite(s, () => {
    s.data.pinSalt = salt;
    s.data.pinHash = hash;
  });
}

export async function verifyPin(pin: string): Promise<boolean> {
  const s = await ensureLoaded();
  if (!s.data.pinHash || !s.data.pinSalt) return false;
  const candidate = hashPin(pin, s.data.pinSalt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(s.data.pinHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
