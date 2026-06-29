"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUploadQr } from "@/lib/useUploadQr";
import { usePhotos } from "@/lib/usePhotos";
import { ArrowLeftIcon, InstagramIcon } from "@/components/icons";
import styles from "./slideshow.module.css";

const SHOW_MS = 60000; // 1 minute
const STORAGE_KEY = "neon_slideshow";

// [type, x%, y%, size, delayS, durS]  type: s=star b=beer w=bottle
const PARTS = [
  ["s",5,20,20,0,9],["b",13,72,26,1.4,11],["w",22,38,18,2.8,8],
  ["s",32,85,16,0.7,10],["b",40,18,24,3.5,12],["w",50,58,20,1.9,9],
  ["s",58,8,18,4.2,8],["b",65,45,28,2.2,11],["w",73,78,20,0.4,10],
  ["s",80,28,22,5,9],["b",87,62,24,1.6,12],["w",93,18,18,3.8,8],
  ["s",96,48,16,2.5,11],["b",45,95,22,4.6,9],["w",28,55,20,1.1,10],
  ["s",70,88,18,3.2,8],["b",18,10,26,0.9,11],["w",82,40,20,4.8,9],
  // extra
  ["s",3,60,16,1.7,10],["b",10,35,22,3.9,9],["w",36,12,18,2.1,11],
  ["s",52,75,20,0.6,8],["b",60,92,24,4.3,10],["w",78,52,16,1.3,12],
  ["s",90,72,18,3.1,9],["b",35,48,22,5.2,11],["w",47,28,20,2.6,8],
  ["s",16,82,16,4.7,10],["b",72,15,26,1.8,9],["w",88,85,18,0.2,11],
  ["s",25,5,20,3.6,8],["b",55,42,24,4.1,10],["w",64,68,18,2.3,9],
] as const;

function StarSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}
function BeerSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M6 3h9l-1.5 15H7.5L6 3z" />
      <path d="M15 7h4a1 1 0 011 1v4a1 1 0 01-1 1h-4" />
      <path d="M6 7h9" />
    </svg>
  );
}
function BottleSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M10 1h4v3l3 3.5V20a2 2 0 01-2 2H9a2 2 0 01-2-2V7.5L10 4V1z" />
      <line x1="7" y1="11" x2="17" y2="11" />
    </svg>
  );
}

function getRemaining(id: string): number {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    if (!s) return SHOW_MS;
    const { photoId, shownAt } = JSON.parse(s);
    if (photoId !== id) return SHOW_MS;
    const elapsed = Date.now() - shownAt;
    return Math.max(0, SHOW_MS - elapsed);
  } catch {
    return SHOW_MS;
  }
}

export default function Slideshow() {
  const { photos } = usePhotos();
  const { src: qr } = useUploadQr();
  const [visibleId, setVisibleId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const latest = photos[0];

  useEffect(() => {
    if (!latest) {
      setVisibleId(null);
      return;
    }
    const remaining = getRemaining(latest.id);
    const elapsed = SHOW_MS - remaining;
    if (remaining <= 0) {
      setVisibleId(null);
      return;
    }
    // Store show time only when it's a new photo
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      const stored = s ? JSON.parse(s) : null;
      if (!stored || stored.photoId !== latest.id) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ photoId: latest.id, shownAt: Date.now() }));
      }
    } catch { /* ignore */ }

    setElapsedMs(elapsed);
    setVisibleId(latest.id);
    const t = setTimeout(() => setVisibleId(null), remaining);
    return () => clearTimeout(t);
  }, [latest?.id]);

  const current = latest && latest.id === visibleId ? latest : null;

  return (
    <div className={styles.stage}>
      <div className={styles.bgLayer} aria-hidden="true">
        {PARTS.map(([t, x, y, s, d, dr], i) => (
          <div key={i} className={styles.bgPart}
            style={{ left:`${x}%`, top:`${y}%`, width:s, height:s, animationDelay:`${d}s`, animationDuration:`${dr}s` }}>
            {t === "s" ? <StarSvg /> : t === "b" ? <BeerSvg /> : <BottleSvg />}
          </div>
        ))}
      </div>
      <Link href="/tv" className={styles.back}>
        <ArrowLeftIcon />
        กลับกำแพงรูป
      </Link>

      {current ? (
        <>
          <div
            key={current.id}
            className={styles.countdown}
            style={{ animationDelay: `-${elapsedMs}ms` }}
          />

          <div className={styles.frame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={current.id} src={`/api/img/${current.id}`} alt={current.name} />
          </div>

          <div className={styles.top}>
            <div className={`${styles.logo} accA`}>NEON BAR</div>
            <div className={styles.live}>
              <span className={styles.dot} />
              ล่าสุด · ส่งรูปขึ้นจอ
            </div>
          </div>

          {(current.name || current.msg) && (
            <div className={styles.cap}>
              {current.name && (
                <div className={styles.cname}>
                  <InstagramIcon className={styles.igIcon} />:
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
          <div className={styles.emptyCard}>
            {qr && (
              <div className={styles.emptyPlate}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR ส่งรูป" />
              </div>
            )}
            <div className={styles.emptyH}>สแกนเพื่อส่งรูปขึ้นจอ</div>
            <div className={styles.emptySub}>ถ่ายหรือเลือกรูป แล้วขึ้นจอนี้ทันที</div>
          </div>
        </div>
      )}
    </div>
  );
}
