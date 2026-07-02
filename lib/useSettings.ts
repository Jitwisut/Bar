"use client";

import { useEffect, useState } from "react";
import type { PublicSettings } from "./settings";

// Client-side defaults — used until the fetch resolves so layout doesn't jump.
// Mirrors server DEFAULTS for the fields the UI reads immediately.
export const CLIENT_DEFAULTS: PublicSettings = {
  brandName: "NEON BAR",
  tagline: "สแกน QR ส่งรูปขึ้นจอทีวีที่ร้านแบบเรียลไทม์",
  idleTitle: "รอรูปขึ้นจอ",
  idleSub: "สแกน QR เพื่อส่งรูป",
  qrHeading: "OPEN A WARP",
  qrSub: "สแกนเพื่อส่งรูปขึ้นจอ",
  tvDurationSec: 40,
  slideshowDurationSec: 60,
  nameMaxLen: 40,
  msgMaxLen: 120,
  maxUploadMB: 15,
  captions: [],
  payment: { enabled: false, amountBaht: 20, promptPayId: "", requireApproval: true },
  uploadsPaused: false,
  moderateAll: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<PublicSettings>(CLIENT_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { settings: PublicSettings }) => {
        if (alive && d?.settings) setSettings(d.settings);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { settings, loaded };
}
