"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUploadQr } from "@/lib/useUploadQr";
import { usePhotos } from "@/lib/usePhotos";
import { ArrowLeftIcon } from "@/components/icons";
import styles from "./slideshow.module.css";

const SHOW_MS = 60000; // how long the latest photo stays before it disappears

export default function Slideshow() {
  const { photos } = usePhotos();
  const { src: qr } = useUploadQr();
  const [visibleId, setVisibleId] = useState<string | null>(null);

  const latest = photos[0];

  // Show the newest photo for ~60s then hide it (back to the QR prompt).
  useEffect(() => {
    if (!latest) {
      setVisibleId(null);
      return;
    }
    setVisibleId(latest.id);
    const t = setTimeout(() => setVisibleId(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [latest?.id]);

  const current = latest && latest.id === visibleId ? latest : null;

  return (
    <div className={styles.stage}>
      <Link href="/tv" className={styles.back}>
        <ArrowLeftIcon />
        กลับกำแพงรูป
      </Link>

      {current ? (
        <>
          <div key={current.id} className={styles.countdown} />

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
              {current.name && <div className={styles.cname}>{current.name}</div>}
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
          {qr && (
            <div className={styles.emptyPlate}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR ส่งรูป" />
            </div>
          )}
          <div className={`${styles.emptyH} accA`}>สแกนเพื่อส่งรูปขึ้นจอ</div>
          <div className={styles.emptySub}>ถ่ายหรือเลือกรูป แล้วขึ้นจอนี้ทันที</div>
        </div>
      )}
    </div>
  );
}
