"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { makeQrDataUrl, uploadUrl } from "@/lib/client";
import { usePhotos } from "@/lib/usePhotos";
import { useSettings } from "@/lib/useSettings";
import type { Photo } from "@/lib/client";
import { BoltIcon, InstagramIcon, SlideshowIcon } from "@/components/icons";
import { CountdownBar } from "@/components/CountdownBar";
import styles from "./tv.module.css";

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

export default function TvWall() {
  const { settings } = useSettings();
  const { photos, status, serverOffsetMs } = usePhotos({
    displaySec: settings.tvDurationSec,
    deleteAfterSec: DELETE_AFTER_DISPLAY_SEC,
  });
  const [qr, setQr] = useState("");
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    makeQrDataUrl(uploadUrl()).then(setQr).catch(() => {});
  }, []);

  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, []);

  const now = clock + serverOffsetMs;
  const featured = activePhoto(photos, now);

  const live = status === "live";
  const queueLen = photos.filter((p) => !p.displayStartedAt).length;

  const SHOW_MS =
    featured?.displayStartedAt && featured?.displayUntil
      ? Math.max(1000, featured.displayUntil - featured.displayStartedAt)
      : settings.tvDurationSec * 1000;
  const elapsed = featured?.displayStartedAt
    ? Math.min(SHOW_MS, Math.max(0, now - featured.displayStartedAt))
    : 0;

  return (
    <div className={styles.stage}>
      <div className={styles.bgGlow} aria-hidden />
      <div className="scanlines" aria-hidden />

      {/* ── Left half: big 1:1 photo (crop cover) ───────────────────────── */}
      <div className={styles.photoHalf}>
        {featured ? (
          <div className={styles.photoSquare}>
            {/* countdown bar — matches the photo's display window, resumes on refresh */}
            <CountdownBar
              key={`bar-${featured.id}`}
              durationMs={SHOW_MS}
              elapsedMs={elapsed}
              className={styles.countdown}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`blur-${featured.id}`}
              className={styles.featuredBlur}
              src={`/api/img/${featured.id}`}
              alt=""
              aria-hidden
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={`img-${featured.id}`}
              className={styles.featuredImg}
              src={`/api/img/${featured.id}`}
              alt={featured.name}
            />
            <div className={styles.hudTopLeft}>
              SYS.WARP.ACTIVE // {featured.id.slice(0, 4).toUpperCase()}
            </div>
            <div className={styles.hudBars}>
              <span style={{ height: "40%", opacity: 0.4 }} />
              <span style={{ height: "80%", opacity: 0.8 }} />
              <span style={{ height: "55%", opacity: 0.6 }} />
            </div>
          </div>
        ) : (
          <div className={styles.photoSquare}>
            <div className={styles.featuredEmpty}>
              <BoltIcon className={styles.emptyBolt} />
              <div className={styles.emptyTitle}>{settings.idleTitle}</div>
              <div className={styles.emptySub}>{settings.idleSub}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right half: caption + IG + warp QR ──────────────────────────── */}
      <aside className={styles.infoHalf}>
        <header className={styles.statusBar}>
          <div className={styles.brand}>
            <BoltIcon className={styles.brandBolt} />
            <h1 className={styles.brandName}>{settings.brandName}</h1>
          </div>
          <div className={styles.liveTag}>
            <span className={`${styles.liveDot} ${live ? "" : styles.off}`} />
            <span>{queueLen > 0 ? `คิว ${queueLen} รูป` : "LIVE / สด"}</span>
          </div>
        </header>

        <div className={styles.captionZone}>
          {featured ? (
            <>
              <div className={styles.profile}>
                <span className={styles.avatar}>
                  <InstagramIcon className={styles.avatarIcon} />
                </span>
                <div>
                  <div className={styles.profileName}>{featured.name}</div>
                  <div className={styles.profileMeta}>เพิ่งส่งขึ้นจอ</div>
                </div>
              </div>
              {featured.msg ? (
                <h2 className={styles.message}>{featured.msg}</h2>
              ) : (
                <h2 className={styles.messageMuted}>ส่งรูปขึ้นจอ 🎉</h2>
              )}
            </>
          ) : (
            <div className={styles.captionIdle}>
              รอรูปจากลูกค้า — สแกน QR ด้านล่างเพื่อส่งรูปขึ้นจอ
            </div>
          )}
        </div>

        <div className={styles.warpRow}>
          <div className={styles.qrPlate}>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.qrImg} src={qr} alt="QR ส่งรูป" />
            )}
            <span className={styles.qrScan} aria-hidden />
          </div>
          <div className={styles.warpText}>
            <div className={styles.warpTitle}>{settings.qrHeading}</div>
            <div className={styles.warpSub}>{settings.qrSub}</div>
            <div className={styles.warpStats}>
              <span className={styles.statValueCyan}>{photos.length}</span>
              <span className={styles.statLabel}>รูปทั้งหมด</span>
              <Link href="/tv/slideshow" className={styles.slideLink}>
                <SlideshowIcon className={styles.slideIcon} />
                สไลด์โชว์
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
