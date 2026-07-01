import { NextRequest, NextResponse } from "next/server";
import { listPending, approvePhoto, rejectPhoto } from "@/lib/store";
import { requireAdmin } from "@/lib/adminSession";

export const dynamic = "force-dynamic";

// GET → pending photos awaiting approval
export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { pending: await listPending() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST { id, action: "approve" | "reject" }
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: string;
  };
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const ok =
    body.action === "approve"
      ? await approvePhoto(id)
      : body.action === "reject"
        ? await rejectPhoto(id)
        : null;

  if (ok === null) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }
  return NextResponse.json({ ok });
}
