import { NextRequest, NextResponse } from "next/server";
import {
  listPending,
  listPhotos,
  approvePhoto,
  rejectPhoto,
  deletePhoto,
  clearPhotos,
  getTodayStats,
} from "@/lib/store";
import { requireAdmin } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// GET → pending queue + photos currently on the wall + today's counters
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [pending, live, stats] = await Promise.all([
    listPending(),
    // schedule:false — reading the admin dashboard must not start a photo's
    // display window; only the TV pages drive scheduling.
    listPhotos(0, { schedule: false }),
    getTodayStats(),
  ]);
  return NextResponse.json(
    { pending, live, stats, serverNow: Date.now() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST { action: "approve" | "reject" | "delete", id } or { action: "clear" }
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: string;
  };

  if (body.action === "clear") {
    await clearPhotos();
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const ok =
    body.action === "approve"
      ? await approvePhoto(id)
      : body.action === "reject"
        ? await rejectPhoto(id)
        : body.action === "delete"
          ? await deletePhoto(id)
          : null;

  if (ok === null) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  return NextResponse.json({ ok });
}
