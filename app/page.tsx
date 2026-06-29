"use client";

import Link from "next/link";
import { useUploadQr } from "@/lib/useUploadQr";
import { MonitorIcon, SlideshowIcon, CameraIcon } from "@/components/icons";
import styles from "./page.module.css";

export default function Home() {
  const { src, url } = useUploadQr();

  return (
    <main className={styles.wrap}>
      <div className={styles.grid}>
        <div>
          <div className={styles.brand}>
            <span className={styles.brandDot} />
            NEON BAR
          </div>

          <h1 className={styles.title}>ส่งรูปขึ้นจอทีวีที่ร้าน แบบเรียลไทม์</h1>
          <p className={styles.tag}>
            ลูกค้าสแกน QR แล้วส่งรูปขึ้นจอได้ทันที ไม่ต้องโหลดแอป
          </p>

          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepn}>1</span>สแกน QR ด้วยมือถือ
            </div>
            <div className={styles.step}>
              <span className={styles.stepn}>2</span>เลือกหรือถ่ายรูป ใส่ชื่อ
            </div>
            <div className={styles.step}>
              <span className={styles.stepn}>3</span>รูปขึ้นจอทีวีทันที
            </div>
          </div>

          <div className={styles.actions}>
            <Link href="/tv" className={`${styles.btn} ${styles.primary}`}>
              <MonitorIcon />
              เปิดจอกำแพงรูป
            </Link>
            <Link href="/tv/slideshow" className={styles.btn}>
              <SlideshowIcon />
              สไลด์โชว์
            </Link>
            <Link href="/u" className={styles.btn}>
              <CameraIcon />
              หน้าส่งรูป
            </Link>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.qrPlate}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="QR สำหรับส่งรูปขึ้นจอ" width={200} height={200} />
            ) : (
              <div style={{ width: 200, height: 200 }} />
            )}
          </div>
          <div className={styles.cardLabel}>สแกนเพื่อส่งรูป</div>
          <div className={styles.cardUrl}>{url}</div>
        </div>
      </div>
    </main>
  );
}
