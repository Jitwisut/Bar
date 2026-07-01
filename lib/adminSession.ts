import crypto from "crypto";
import { NextRequest } from "next/server";

export const ADMIN_COOKIE = "admin_session";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

type Sessions = Map<string, number>; // token → expiry epoch ms

const g = globalThis as unknown as { __neonAdminSessions?: Sessions };

function sessions(): Sessions {
  if (!g.__neonAdminSessions) g.__neonAdminSessions = new Map();
  return g.__neonAdminSessions;
}

export function createSession(): { token: string; maxAge: number } {
  const token = crypto.randomBytes(24).toString("hex");
  sessions().set(token, Date.now() + TTL_MS);
  return { token, maxAge: Math.floor(TTL_MS / 1000) };
}

export function isValidSession(token: string | undefined): boolean {
  if (!token) return false;
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
