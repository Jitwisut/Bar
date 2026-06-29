"use client";

import { useEffect, useState } from "react";
import { makeQrDataUrl, uploadUrl } from "./client";

/** Returns the QR image data-URL + the upload URL it encodes (LAN-aware). */
export function useUploadQr() {
  const [src, setSrc] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const u = uploadUrl();
    setUrl(u);
    makeQrDataUrl(u).then(setSrc).catch(() => setSrc(""));
  }, []);

  return { src, url };
}
