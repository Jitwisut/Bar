"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeQrDataUrl, uploadUrl } from "@/lib/client";
import { usePhotos } from "@/lib/usePhotos";
import type { Photo } from "@/lib/client";
import { BoltIcon, InstagramIcon, SlideshowIcon } from "@/components/icons";
import styles from "./tv.module.css";

const SHOW_MS = 40000; // how long a photo stays on the featured screen
const STORE_KEY = "tv_featured_v1"; // persists { id, at } across refresh

export default function TvWall() {
  const { photos, status } = usePhotos();
  const [qr, setQr] = useState("");

  // Display queue (same model as the slideshow)
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const seenIds = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    makeQrDataUrl(uploadUrl()).then(setQr).catch(() => {});
  }, []);

  // 0. On mount: restore the in-progress photo + its start time (survives refresh)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const { id, at } = JSON.parse(raw) as { id: string; at: number };
        if (id && at && Date.now() - at < SHOW_MS) {
          setCurrentId(id);
          setStartedAt(at);
        } else {
          localStorage.removeItem(STORE_KEY);
        }
      }
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, []);

  // Persist the current photo + start time whenever they change
  useEffect(() => {
    try {
      if (currentId && startedAt) {
        localStorage.setItem(STORE_KEY, JSON.stringify({ id: currentId, at: startedAt }));
      } else {
        localStorage.removeItem(STORE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [currentId, startedAt]);

  // 1. Enqueue new arrivals (FIFO, oldest first). On the first pass after a
  //    refresh, mark existing photos as already-seen so we don't replay them.
  useEffect(() => {
    if (!restored) return;
    if (!seededRef.current) {
      photos.forEach((p) => seenIds.current.add(p.id));
      seededRef.current = true;
      return;
    }
    const fresh = photos.filter((p) => !seenIds.current.has(p.id));
    if (fresh.length === 0) return;
    fresh.forEach((p) => seenIds.current.add(p.id));
    setQueue((q) => [...q, ...fresh.map((p) => p.id).reverse()]);
  }, [photos, restored]);

  // 2. Dequeue when the screen is idle → stamp a fresh start time
  useEffect(() => {
    if (!restored) return;
    if (currentId !== null) return;
    if (queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrentId(next);
    setStartedAt(Date.now());
    setQueue(rest);
  }, [currentId, queue, restored]);

  // 3. Auto-advance: hide after the *remaining* time → triggers next dequeue
  useEffect(() => {
    if (!currentId || startedAt === null) return;
    const remaining = Math.max(0, SHOW_MS - (Date.now() - startedAt));
    const t = setTimeout(() => {
      setCurrentId(null);
      setStartedAt(null);
    }, remaining);
    return () => clearTimeout(t);
  }, [currentId, startedAt]);

  const photosById = new Map<string, Photo>(photos.map((p) => [p.id, p]));
  const featured = currentId ? (photosById.get(currentId) ?? null) : null;

  const live = status === "live";
  const queueLen = queue.length;

  // Elapsed time so the countdown bar resumes where it left off after refresh
  const elapsed = startedAt !== null ? Date.now() - startedAt : 0;

  return (
    <div className={styles.stage}>
      <div className={styles.bgGlow} aria-hidden />
      <div className="scanlines" aria-hidden />

      {/* ── Left: featured ──────────────────────────────────────────────── */}
      <div className={styles.mainArea}>
        <header className={styles.statusBar}>
          <div className={styles.brand}>
            <BoltIcon className={styles.brandBolt} />
            <h1 className={styles.brandName}>ELECTRIC SOCIAL</h1>
          </div>
          <div className={styles.liveTag}>
            <span className={`${styles.liveDot} ${live ? "" : styles.off}`} />
            <span>
              {queueLen > 0 ? `คิว ${queueLen} รูป` : "LIVE FEED / สด"}
            </span>
          </div>
        </header>

        <div className={styles.cinematic}>
          {featured ? (
            <>
              {/* countdown bar — resumes at the elapsed position after refresh */}
              <div
                key={`bar-${featured.id}`}
                className={styles.countdown}
                style={{ animationDelay: `-${elapsed}ms` }}
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
              <div className={styles.featuredScrim} />

              <div className={styles.hudTopLeft}>
                SYS.WARP.ACTIVE // {featured.id.slice(0, 4).toUpperCase()}
              </div>
              <div className={styles.hudBars}>
                <span style={{ height: "40%", opacity: 0.4 }} />
                <span style={{ height: "80%", opacity: 0.8 }} />
                <span style={{ height: "55%", opacity: 0.6 }} />
              </div>

              <div className={styles.featuredContent}>
                <div className={styles.profile}>
                  <span className={styles.avatar}>
                    <InstagramIcon className={styles.avatarIcon} />
                  </span>
                  <div>
                    <div className={styles.profileName}>{featured.name}</div>
                    <div className={styles.profileMeta}>เพิ่งส่งขึ้นจอ</div>
                  </div>
                </div>
                {featured.msg && (
                  <h2 className={styles.message}>{featured.msg}</h2>
                )}
              </div>
            </>
          ) : (
            <div className={styles.featuredEmpty}>
              <BoltIcon className={styles.emptyBolt} />
              <div className={styles.emptyTitle}>รอรูปขึ้นจอ</div>
              <div className={styles.emptySub}>สแกน QR ด้านขวาเพื่อส่งรูป</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: sidebar ──────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.qrSection}>
          <div className={styles.qrBlob} aria-hidden />
          <h3 className={styles.qrTitle}>OPEN A WARP</h3>
          <p className={styles.qrSub}>สแกนเพื่อส่งรูปขึ้นจอ</p>
          <div className={styles.qrPlate}>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.qrImg} src={qr} alt="QR ส่งรูป" />
            )}
            <span className={styles.qrScan} aria-hidden />
          </div>
          <div className={styles.qrCaption}>
            <span>สแกนเพื่อส่งรูปขึ้นจอ</span>
          </div>
        </div>

        <div className={styles.sidebarFill}>
          {queueLen > 0 && (
            <div className={styles.queuePanel}>
              <div className={styles.queueNum}>{queueLen}</div>
              <div className={styles.queueLabel}>รูปกำลังรอขึ้นจอ</div>
            </div>
          )}
        </div>

        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>รูปทั้งหมด</div>
            <div className={styles.statValueCyan}>{photos.length}</div>
          </div>
          <Link href="/tv/slideshow" className={styles.slideLink}>
            <SlideshowIcon className={styles.slideIcon} />
            สไลด์โชว์
          </Link>
        </div>
      </aside>
    </div>
  );
}
