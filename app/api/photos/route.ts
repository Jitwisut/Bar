import { NextRequest, NextResponse } from "next/server";
import {
  addPhoto,
  listPhotos,
  clearPhotos,
  latestSeq,
  getQueueDepth,
} from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

// Polled by the TV every 3s. `?since=<seq>` returns only newer photos.
export async function GET(req: NextRequest) {
  const sinceParam = Number(req.nextUrl.searchParams.get("since") ?? "0");
  const since = Number.isFinite(sinceParam) ? sinceParam : 0;
  const photos = listPhotos(since);
  return NextResponse.json(
    { photos, latestSeq: latestSeq(), queue: getQueueDepth() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "กรุณาแนบรูปภาพ" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "ไฟล์ใหญ่เกินไป (สูงสุด 15MB)" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.type.split("/")[1] || "jpg").toLowerCase();
  const name = String(form.get("name") ?? "");
  const msg = String(form.get("msg") ?? "");

  // Goes through the write queue — safe under bursts of simultaneous uploads.
  const { photo, queuedAhead } = await addPhoto({ buffer, ext, name, msg });
  return NextResponse.json({ photo, queuedAhead });
}

// Clear the wall (handy for resetting between events).
export async function DELETE() {
  await clearPhotos();
  return NextResponse.json({ ok: true });
}
