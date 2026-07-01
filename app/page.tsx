"use client";

import Link from "next/link";
import {
  MonitorIcon,
  CameraIcon,
  BoltIcon,
  QrIcon,
  VerifiedIcon,
} from "@/components/icons";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      {/* Top nav */}
      <header className={styles.nav}>
        <div className={styles.navInner}>
          <div className={styles.logo}>Electric Social</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className="scanlines" aria-hidden />

        {/* Hero */}
        <section className={styles.hero}>
          <h1 className={styles.title}>
            เปลี่ยนงานของคุณให้มีชีวิต
            <br />
            <span className={styles.titleAccent}>แบบเรียลไทม์</span>
          </h1>
          <p className={styles.subtitle}>
            ระบบแสดงรูปบนจอสำหรับร้านอาหาร บาร์ และงานอีเวนต์ —
            ให้ลูกค้าแชร์บรรยากาศขึ้นจอได้ทันที ร้านของคุณก็มีชีวิตชีวาด้วยรูปจากทุกคน
          </p>
        </section>

        {/* CTA cards */}
        <div className={styles.cards}>
          <div className={`${styles.card} ${styles.cyan}`}>
            <div className={`${styles.cardIcon} ${styles.cyan}`}>
              <MonitorIcon />
            </div>
            <h2 className={styles.cardTitle}>เปิดจอทีวี</h2>
            <p className={styles.cardDesc}>
              เปิดกำแพงรูปแบบ cinematic สำหรับจอใหญ่
              อัปเดตรูปลูกค้าสด ๆ ตลอดเวลา ให้บรรยากาศในร้านคึกคักไม่มีสะดุด
            </p>
            <Link href="/tv" className={`${styles.cardBtn} ${styles.cyan}`}>
              เปิดโหมดจอใหญ่
            </Link>
          </div>

          <div className={`${styles.card} ${styles.magenta}`}>
            <div className={`${styles.cardIcon} ${styles.magenta}`}>
              <CameraIcon />
            </div>
            <h2 className={styles.cardTitle}>ส่งรูปขึ้นจอ</h2>
            <p className={styles.cardDesc}>
              หน้าสำหรับลูกค้าแชร์รูป แค่สแกน QR ถ่ายหรือเลือกรูป
              แล้วดูรูปขึ้นจอหลักภายในไม่กี่วินาที
            </p>
            <Link href="/u" className={`${styles.cardBtn} ${styles.magenta}`}>
              เริ่มส่งรูปเลย
            </Link>
          </div>
        </div>

        {/* Feature chips */}
        <div className={styles.features}>
          <div className={styles.feature}>
            <BoltIcon />
            <span>ขึ้นจอทันที</span>
          </div>
          <div className={styles.feature}>
            <QrIcon />
            <span>ไม่ต้องโหลดแอป</span>
          </div>
          <div className={styles.feature}>
            <VerifiedIcon />
            <span>ปลอดภัย ดูแลรูป</span>
          </div>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>Electric Social</div>
          <div className={styles.footerLinks}>
            <a href="#">เงื่อนไข</a>
            <a href="#">ความเป็นส่วนตัว</a>
            <a href="#">ติดต่อ</a>
            <a href="#">ร้านค้า</a>
          </div>
          <div className={styles.footerCopy}>© 2026 Electric Social</div>
        </div>
      </footer>
    </div>
  );
}
