import { NextRequest } from "next/server";
import { getImageBuffer } from "@/lib/store";

export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const entry = await getImageBuffer(id);
  if (!entry) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(entry.buf), {
    headers: {
      "Content-Type": MIME[entry.ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
