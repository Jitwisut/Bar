import { NextRequest, NextResponse } from "next/server";
import {
  addPhoto,
  listPhotos,
  clearPhotos,
  latestSeq,
  getQueueDepth,
} from "@/lib/store";
import { getPublicSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Polled by the TV every 3s. `?since=<seq>` returns only newer photos.
export async function GET(req: NextRequest) {
  const sinceParam = Number(req.nextUrl.searchParams.get("since") ?? "0");
  const since = Number.isFinite(sinceParam) ? sinceParam : 0;
  const photos = await listPhotos(since);
  return NextResponse.json(
    {
      photos,
      latestSeq: await latestSeq(),
      queue: await getQueueDepth(),
    },
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

  const settings = await getPublicSettings();
  const maxBytes = settings.maxUploadMB * 1024 * 1024;

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "กรุณาแนบรูปภาพ" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `ไฟล์ใหญ่เกินไป (สูงสุด ${settings.maxUploadMB}MB)` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.type.split("/")[1] || "jpg").toLowerCase();
  const name = String(form.get("name") ?? "");
  const msg = String(form.get("msg") ?? "");

  // If payment is on and needs staff approval, the photo waits as "pending".
  const status =
    settings.payment.enabled && settings.payment.requireApproval
      ? "pending"
      : "approved";

  // Goes through the write queue — safe under bursts of simultaneous uploads.
  const { photo, queuedAhead } = await addPhoto({
    buffer,
    ext,
    name,
    msg,
    status,
    nameMaxLen: settings.nameMaxLen,
    msgMaxLen: settings.msgMaxLen,
  });
  return NextResponse.json({ photo, queuedAhead, status });
}

// Clear the wall (handy for resetting between events).
export async function DELETE() {
  await clearPhotos();
  return NextResponse.json({ ok: true });
}
