import { NextResponse } from "next/server";
import { getPublicSettings, isPinSet } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Public settings consumed by every customer-facing page. Never includes the PIN.
export async function GET() {
  const settings = await getPublicSettings();
  const pinSet = await isPinSet();
  return NextResponse.json(
    { settings, pinSet },
    { headers: { "Cache-Control": "no-store" } }
  );
}
