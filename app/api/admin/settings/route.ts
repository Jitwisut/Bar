import { NextRequest, NextResponse } from "next/server";
import { getStoredSettings, savePublicSettings, setPin } from "@/lib/settings";
import { requireAdmin } from "@/lib/adminSession";
import type { PublicSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// GET → full editable settings (admin only; still excludes pin hash via toPublic-like shape)
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const d = await getStoredSettings();
  const { pinHash: _h, pinSalt: _s, ...pub } = d;
  void _h;
  void _s;
  return NextResponse.json({ settings: pub }, { headers: { "Cache-Control": "no-store" } });
}

// POST → save a settings patch, and optionally change the PIN.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    settings?: Partial<PublicSettings>;
    newPin?: string;
  };

  if (body.newPin !== undefined) {
    if (!/^\d{4,6}$/.test(body.newPin)) {
      return NextResponse.json({ error: "PIN ต้องเป็นตัวเลข 4–6 หลัก" }, { status: 400 });
    }
    await setPin(body.newPin);
  }

  const settings = await savePublicSettings(body.settings ?? {});
  return NextResponse.json({ ok: true, settings });
}
