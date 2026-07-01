"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUploadQr } from "@/lib/useUploadQr";
import { usePhotos } from "@/lib/usePhotos";
import { useSettings } from "@/lib/useSettings";
import { ArrowLeftIcon, InstagramIcon } from "@/components/icons";
import type { Photo } from "@/lib/client";
import styles from "./slideshow.module.css";

const DELETE_AFTER_DISPLAY_SEC = 5 * 60;

function markDisplayed(
  id: string,
  deleteAfterSec?: number,
  mode: "started" | "finished" = "finished"
) {
  fetch("/api/photos/displayed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, deleteAfterSec, mode }),
  }).catch(() => {});
}

export default function Slideshow() {
  const { photos, status } = usePhotos();
  const { src: qr } = useUploadQr();
  const { settings } = useSettings();
  const SHOW_MS = settings.slideshowDurationSec * 1000;

  // photo id currently on screen (null = idle)
  const [currentId, setCurrentId] = useState<string | null>(null);
  // ids waiting to be shown, in arrival order
  const [queue, setQueue] = useState<string[]>([]);
  // set of ids we've already enqueued or shown — prevents re-adding on each poll
  const seenIds = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  // ── 1. Enqueue new arrivals ──────────────────────────────────────────────
  useEffect(() => {
    if (!seededRef.current) {
      if (status !== "live") return;
      const fresh = photos.filter((p) => p.ts > mountedAtRef.current);
      photos.forEach((p) => seenIds.current.add(p.id));
      seededRef.current = true;
      if (fresh.length > 0) {
        setQueue((q) => [...q, ...fresh.map((p) => p.id).reverse()]);
      }
      return;
    }

    const fresh = photos.filter((p) => !seenIds.current.has(p.id));
    if (fresh.length === 0) return;
    fresh.forEach((p) => seenIds.current.add(p.id));
    // newest-first from usePhotos, so reverse to queue oldest-first (FIFO)
    setQueue((q) => [...q, ...fresh.map((p) => p.id).reverse()]);
  }, [photos, status]);

  // ── 2. Dequeue when screen is idle ───────────────────────────────────────
  useEffect(() => {
    if (currentId !== null) return; // something is showing — wait
    if (queue.length === 0) return; // nothing waiting
    const [next, ...rest] = queue;
    setCurrentId(next);
    setQueue(rest);
    markDisplayed(
      next,
      Math.ceil(SHOW_MS / 1000) + DELETE_AFTER_DISPLAY_SEC,
      "started"
    );
  }, [currentId, queue, SHOW_MS]);

  // ── 3. Auto-advance: hide after SHOW_MS → triggers dequeue effect ────────
  useEffect(() => {
    if (!currentId) return;
    const id = currentId;
    const t = setTimeout(() => {
      markDisplayed(id, DELETE_AFTER_DISPLAY_SEC, "finished");
      setCurrentId(null);
    }, SHOW_MS);
    return () => clearTimeout(t);
  }, [currentId, SHOW_MS]);

  // Resolve the current photo object for rendering
  const photosById = new Map<string, Photo>(photos.map((p) => [p.id, p]));
  const current = currentId ? (photosById.get(currentId) ?? null) : null;

  const queueLen = queue.length;

  return (
    <div className={styles.stage}>
      <div className="scanlines" aria-hidden />
      <Link href="/tv" className={styles.back}>
        <ArrowLeftIcon />
        กลับกำแพงรูป
      </Link>

      {current ? (
        <>
          {/* countdown bar — key forces restart on each new photo */}
          <div
            key={current.id}
            className={styles.countdown}
            style={{ animationDuration: `${SHOW_MS}ms` }}
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
