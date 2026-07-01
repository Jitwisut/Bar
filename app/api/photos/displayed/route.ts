import { NextRequest, NextResponse } from "next/server";
import { markPhotoDisplayed } from "@/lib/store";

export const dynamic = "force-dynamic";

// Compatibility endpoint for already-open TV tabs. New TV pages let /api/photos
// assign the central display window, but this can still tighten the cleanup TTL.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    deleteAfterSec?: number;
    mode?: "started" | "finished";
  };
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const ok = await markPhotoDisplayed(
    id,
    body.deleteAfterSec,
    body.mode !== "started"
  );
  return NextResponse.json({ ok });
}
