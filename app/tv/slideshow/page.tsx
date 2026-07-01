"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUploadQr } from "@/lib/useUploadQr";
import { usePhotos } from "@/lib/usePhotos";
import { useSettings } from "@/lib/useSettings";
import { ArrowLeftIcon, InstagramIcon } from "@/components/icons";
import { CountdownBar } from "@/components/CountdownBar";
import type { Photo } from "@/lib/client";
import styles from "./slideshow.module.css";

const DELETE_AFTER_DISPLAY_SEC = 5 * 60;

function activePhoto(photos: Photo[], now: number) {
  return (
    photos.find(
      (p) =>
        p.displayStartedAt &&
        p.displayStartedAt <= now &&
        p.displayUntil &&
        p.displayUntil > now
    ) ?? null
  );
}

export default function Slideshow() {
  const { src: qr } = useUploadQr();
  const { settings } = useSettings();
  const { photos, serverOffsetMs } = usePhotos({
    displaySec: settings.slideshowDurationSec,
    deleteAfterSec: DELETE_AFTER_DISPLAY_SEC,
  });
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, []);

  const now = clock + serverOffsetMs;
  const current = activePhoto(photos, now);
  const queueLen = photos.filter((p) => !p.displayStartedAt).length;
  const SHOW_MS =
    current?.displayStartedAt && current?.displayUntil
      ? Math.max(1000, current.displayUntil - current.displayStartedAt)
      : settings.slideshowDurationSec * 1000;
  const elapsed = current?.displayStartedAt
    ? Math.min(SHOW_MS, Math.max(0, now - current.displayStartedAt))
    : 0;

  return (
    <div className={styles.stage}>
      <div className="scanlines" aria-hidden />
      <Link href="/tv" className={styles.back}>
        <ArrowLeftIcon />
        กลับกำแพงรูป
      </Link>

      {current ? (
        <>
          {/* countdown bar — matches the photo's display window, resumes on refresh */}
          <CountdownBar
            key={current.id}
            durationMs={SHOW_MS}
            elapsedMs={elapsed}
            className={styles.countdown}
          />

          <div className={styles.frame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={current.id} src={`/api/img/${current.id}`} alt={current.name} />
          </div>

          <div className={styles.top}>
            <div className={`${styles.logo} accA`}>{settings.brandName}</div>
            <div className={styles.live}>
              <span className={styles.dot} />
              ล่าสุด · ส่งรูปขึ้นจอ
              {queueLen > 0 && (
                <span className={styles.queueBadge}>+{queueLen} รอ</span>
              )}
            </div>
          </div>

          {(current.name || current.msg) && (
            <div className={styles.cap}>
              {current.name && (
                <div className={styles.cname}>
                  <InstagramIcon className={styles.igIcon} />
                  {current.name}
                </div>
              )}
              {current.msg && <div className={styles.cmsg}>{current.msg}</div>}
            </div>
          )}

          {qr && (
            <div className={styles.qr}>
              <div className={styles.qrPlate}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR ส่งรูป" />
              </div>
              <div>
                <div className={styles.qrHead}>สแกนส่งรูป</div>
                <div className={styles.qrSub}>ขึ้นจอนี้ทันที</div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className={styles.empty}>
          <div className={`${styles.emptyBrand} accA`}>{settings.brandName}</div>
          {qr && (
            <div className={styles.emptyPlate}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR ส่งรูป" />
            </div>
          )}
          <div className={styles.emptyH}>{settings.qrSub}</div>
          <div className={styles.emptySub}>{settings.idleSub}</div>
        </div>
      )}
    </div>
  );
}
