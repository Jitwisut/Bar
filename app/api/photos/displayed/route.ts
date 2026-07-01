import { NextRequest, NextResponse } from "next/server";
import { markPhotoDisplayed } from "@/lib/store";

export const dynamic = "force-dynamic";

// TV/slideshow calls this when a photo has finished showing.
// The image and metadata are then deleted 5 minutes later by Redis TTL.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const ok = await markPhotoDisplayed(id);
  return NextResponse.json({ ok });
}
