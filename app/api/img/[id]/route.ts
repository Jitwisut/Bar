import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import { getImageFile } from "@/lib/store";

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
  const file = await getImageFile(id);
  if (!file) return new Response("Not found", { status: 404 });

  try {
    const data = await fs.readFile(file.path);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": MIME[file.ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
