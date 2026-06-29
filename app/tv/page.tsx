"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { makeQrDataUrl, uploadUrl } from "@/lib/client";
import { usePhotos } from "@/lib/usePhotos";
import { SlideshowIcon } from "@/components/icons";
import styles from "./tv.module.css";

export default function TvWall() {
  const { photos, status, queueDepth } = usePhotos();
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const u = uploadUrl();
    setUrl(u);
    makeQrDataUrl(u).then(setQr).catch(() => {});
  }, []);

  const live = status === "live";

  return (
    <div className={styles.screen}>
      <header className={styles.head}>
        <div className={`${styles.logo} accA`}>NEON BAR</div>
        <div className={styles.headRight}>
          <div className={styles.live}>
            <span className={`${styles.dot} ${live ? "" : styles.off}`} />
            {queueDepth > 0
              ? `กำลังประมวลผล ${queueDepth} รูป…`
              : live
                ? "LIVE · ส่งรูปขึ้นจอ"
                : "กำลังเชื่อมต่อ…"}
          </div>
          {qr && (
            <div className={styles.headQr}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR" />
              <span className={styles.headQrText}>สแกน → ส่งรูปขึ้นกำแพง</span>
            </div>
          )}
        </div>
      </header>

      {photos.length === 0 ? (
        <div className={styles.idle}>
          <div className={`${styles.idleLogo} accA`}>NEON BAR</div>
          {qr && (
            <div className={styles.qrbig}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR ส่งรูป" />
            </div>
          )}
          <div className={styles.idleH}>สแกนเพื่อส่งรูปขึ้นจอ</div>
          <div className={styles.idleSub}>ถ่ายหรือเลือกรูป แล้วขึ้นจอนี้ทันที</div>
          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepn}>1</span>สแกน QR
            </div>
            <div className={styles.step}>
              <span className={styles.stepn}>2</span>เลือก/ถ่ายรูป
            </div>
            <div className={styles.step}>
              <span className={styles.stepn}>3</span>ขึ้นจอเลย
            </div>
          </div>
          {url && <div className={styles.idleUrl}>{url}</div>}
        </div>
      ) : (
        <div className={styles.grid}>
          {photos.map((p) => (
            <div key={p.id} className={styles.tile} style={{ background: p.tint }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${p.id}`} alt={p.name} loading="lazy" />
              {(p.name || p.msg) && (
                <div className={styles.cap}>
                  <span className={styles.cname}>{p.name}</span>
                  {p.msg && <span className={styles.cmsg}>{p.msg}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.toolbar}>
        <Link href="/tv/slideshow" className={styles.toolBtn}>
          <SlideshowIcon />
          สไลด์โชว์
        </Link>
      </div>
    </div>
  );
}
