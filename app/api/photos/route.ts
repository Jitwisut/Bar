import { NextRequest, NextResponse } from "next/server";
import {
  addPhoto,
  listPhotos,
  clearPhotos,
  latestSeq,
  getQueueDepth,
} from "@/lib/store";
import { getPublicSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// Polled by the TV every 3s. The server owns display windows so all screens
// converge on the same active photo instead of consuming separate local queues.
export async function GET(req: NextRequest) {
  const settings = await getPublicSettings();
  const displaySecParam = Number(
    req.nextUrl.searchParams.get("displaySec") ?? settings.tvDurationSec
  );
  const deleteAfterSecRaw = req.nextUrl.searchParams.get("deleteAfterSec");
  const deleteAfterSecParam =
    deleteAfterSecRaw === null ? undefined : Number(deleteAfterSecRaw);
  const displaySec = Number.isFinite(displaySecParam)
    ? displaySecParam
    : settings.tvDurationSec;
  const deleteAfterSec = Number.isFinite(deleteAfterSecParam)
    ? deleteAfterSecParam
    : undefined;
  const photos = await listPhotos(0, { displaySec, deleteAfterSec });
  return NextResponse.json(
    {
      photos,
      latestSeq: await latestSeq(),
      queue: await getQueueDepth(),
      serverNow: Date.now(),
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
  if (settings.uploadsPaused) {
    return NextResponse.json(
      { error: "ตอนนี้ร้านปิดรับรูปชั่วคราว ลองใหม่อีกครั้งภายหลังนะ" },
      { status: 403 }
    );
  }
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

  // The photo waits as "pending" when staff must screen it first — either the
  // paid flow requires approval, or the owner turned on moderation for all.
  const status =
    (settings.payment.enabled && settings.payment.requireApproval) ||
    settings.moderateAll
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

// Clear the wall (handy for resetting between events). Admin only.
export async function DELETE(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await clearPhotos();
  return NextResponse.json({ ok: true });
}
