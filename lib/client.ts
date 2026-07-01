"use client";

import QRCode from "qrcode";

export type Photo = {
  id: string;
  seq: number;
  name: string;
  msg: string;
  ext: string;
  ts: number;
  tint: string;
  status?: "approved" | "pending";
  displayStartedAt?: number;
  displayUntil?: number;
  deleteAt?: number;
};

/** The base URL a phone should open to upload. Auto-adapts to the LAN host the
 *  TV page is served from, unless NEXT_PUBLIC_BASE_URL is set (real domain). */
export function uploadUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/u`;
}

export async function makeQrDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    margin: 1,
    width: 480,
    color: { dark: "#15132bff", light: "#ffffffff" },
  });
}

/**
 * Normalize any browser-decodable image to a downscaled JPEG.
 * This shrinks multi-MB phone photos and converts iPhone HEIC (which Safari can
 * decode to canvas) into a JPEG that every TV browser can render.
 */
export async function imageToJpeg(
  file: File,
  maxDim = 1600,
  quality = 0.85
): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ไม่สามารถประมวลผลรูปได้");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("แปลงรูปไม่สำเร็จ")),
      "image/jpeg",
      quality
    );
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // Prefer createImageBitmap (fast, handles orientation in modern browsers).
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("เปิดไฟล์รูปนี้ไม่ได้ ลองเลือกรูปอื่น"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
