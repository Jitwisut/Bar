import { NextRequest, NextResponse } from "next/server";
import { isPinSet, setPin, verifyPin } from "@/lib/settings";
import {
  ADMIN_COOKIE,
  createSession,
  destroySession,
  isValidSession,
} from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// GET → am I logged in? / has a PIN been set yet?
export async function GET(req: NextRequest) {
  const authed = isValidSession(req.cookies.get(ADMIN_COOKIE)?.value);
  const pinSet = await isPinSet();
  return NextResponse.json({ authed, pinSet });
}

// POST { pin } → login. If no PIN exists yet, this first call *sets* it.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const pin = String(body.pin ?? "");
  if (!/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN ต้องเป็นตัวเลข 4–6 หลัก" }, { status: 400 });
  }

  const alreadySet = await isPinSet();
  if (!alreadySet) {
    await setPin(pin); // first-run: establish the PIN
  } else if (!(await verifyPin(pin))) {
    return NextResponse.json({ error: "PIN ไม่ถูกต้อง" }, { status: 401 });
  }

  const { token, maxAge } = createSession();
  const res = NextResponse.json({ ok: true, firstTime: !alreadySet });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}

// DELETE → logout
export async function DELETE(req: NextRequest) {
  destroySession(req.cookies.get(ADMIN_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
