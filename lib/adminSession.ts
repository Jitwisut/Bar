import crypto from "crypto";
import { NextRequest } from "next/server";

export const ADMIN_COOKIE = "admin_session";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

type Sessions = Map<string, number>; // legacy token -> expiry epoch ms

const g = globalThis as unknown as {
  __neonAdminSessions?: Sessions;
  __neonAdminSessionSecret?: string;
};

function sessions(): Sessions {
  if (!g.__neonAdminSessions) g.__neonAdminSessions = new Map();
  return g.__neonAdminSessions;
}

let warnedEphemeralSecret = false;

function sessionSecret(): string {
  const configured =
    process.env.ADMIN_SESSION_SECRET ??
    process.env.AUTH_SECRET ??
    process.env.NEXTAUTH_SECRET;
  if (configured) return configured;

  if (!g.__neonAdminSessionSecret) {
    g.__neonAdminSessionSecret = crypto.randomBytes(32).toString("hex");
  }

  if (process.env.VERCEL && !warnedEphemeralSecret) {
    warnedEphemeralSecret = true;
    console.warn(
      "ADMIN_SESSION_SECRET is not set. Admin sessions may expire on Vercel cold starts."
    );
  }
  return g.__neonAdminSessionSecret;
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");
}

function hasValidSignature(payload: string, signature: string): boolean {
  const expected = sign(payload);
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createSession(): { token: string; maxAge: number } {
  const exp = Date.now() + TTL_MS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${exp}.${nonce}`;
  const token = `${payload}.${sign(payload)}`;
  return { token, maxAge: Math.floor(TTL_MS / 1000) };
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length === 3) {
    const [expRaw, nonce, signature] = parts;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || !nonce || !signature) return false;
    if (Date.now() > exp) return false;
    return hasValidSignature(`${expRaw}.${nonce}`, signature);
  }

  // Backward compatibility for sessions minted before signed cookies existed.
  const exp = sessions().get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions().delete(token);
    return false;
  }
  return true;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions().delete(token);
}

/** Guard for admin API routes. Returns true if the request is authenticated. */
export function requireAdmin(req: NextRequest): boolean {
  return isValidSession(req.cookies.get(ADMIN_COOKIE)?.value);
}
