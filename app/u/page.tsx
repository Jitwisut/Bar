"use client";

import { useRef, useState } from "react";
import { imageToJpeg, makeQrDataUrl } from "@/lib/client";
import { useSettings } from "@/lib/useSettings";
import { promptPayPayload } from "@/lib/promptpay";
import {
  CameraIcon,
  GalleryIcon,
  PhotoIcon,
  CheckIcon,
} from "@/components/icons";
import styles from "./u.module.css";

type Phase = "idle" | "sending" | "paying" | "done";

export default function UploadPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { settings, loaded } = useSettings();
  const pay = settings.payment;

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [captionSel, setCaptionSel] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [queuedAhead, setQueuedAhead] = useState(0);
  const [payQr, setPayQr] = useState("");
  const [needsApproval, setNeedsApproval] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      const jpeg = await imageToJpeg(file);
      setBlob(jpeg);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(jpeg);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปิดรูปไม่สำเร็จ");
    }
  }

  // Step 1 — customer taps "ส่งขึ้นจอ". If payment is on, show the PromptPay QR
  // and wait for "จ่ายแล้ว"; otherwise upload straight away.
  async function submit() {
    if (!blob) { setError("กรุณาเลือกหรือถ่ายรูปก่อน"); return; }
    setError("");
    if (pay.enabled && pay.amountBaht > 0) {
      const payload = promptPayPayload(pay.promptPayId, pay.amountBaht);
      if (payload) {
        try {
          setPayQr(await makeQrDataUrl(payload));
        } catch {
          setPayQr("");
        }
      } else {
        setPayQr(""); // no valid PromptPay id configured → show amount only
      }
      setPhase("paying");
      return;
    }
    await doUpload();
  }

  // Step 2 — actually send the photo to the server.
  async function doUpload() {
    if (!blob) return;
    setPhase("sending");
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", blob, "photo.jpg");
      fd.append("name", name);
      fd.append("msg", msg);
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
      setQueuedAhead(data.queuedAhead ?? 0);
      setNeedsApproval(data.status === "pending");
      setPhase("done");
    } catch (err) {
      setPhase(pay.enabled ? "paying" : "idle");
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null); setPreviewUrl(""); setName(""); setMsg("");
    setCaptionSel(""); setPhase("idle"); setError("");
    setPayQr(""); setNeedsApproval(false);
  }

  function onCaptionChange(val: string) {
    setCaptionSel(val);
    if (val !== "__custom__") setMsg(val);
    else setMsg("");
  }

  const sending = phase === "sending";

  // Owner turned uploads off (bar closed / event over)
  if (loaded && settings.uploadsPaused) {
    return (
      <main className={styles.screen}>
        <div className="scanlines" aria-hidden />
        <div className={styles.header}>
          <span className={styles.brandDot} />
          {settings.brandName}
        </div>
        <h1 className={styles.title}>ปิดรับรูปชั่วคราว</h1>
        <p className={styles.sub}>
          ตอนนี้ร้านยังไม่เปิดรับรูปขึ้นจอ ลองสแกนใหม่อีกครั้งภายหลังนะ
        </p>
      </main>
    );
  }

  // Payment screen — PromptPay QR + amount, waiting for "จ่ายแล้ว"
  if (phase === "paying") {
    return (
      <main className={styles.screen}>
        <div className="scanlines" aria-hidden />
        <div className={styles.header}>
          <span className={styles.brandDot} />
          {settings.brandName}
        </div>
        <h1 className={styles.title}>ชำระค่าโพสต์รูป</h1>
        <p className={styles.sub}>สแกน QR ด้านล่างเพื่อจ่าย แล้วกด “จ่ายแล้ว”</p>

        <div className={styles.payBox}>
          <div className={styles.payAmount}>
            ฿{pay.amountBaht.toLocaleString()}
          </div>
          {payQr ? (
            <div className={styles.payQrPlate}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={payQr} alt="PromptPay QR" />
            </div>
          ) : (
            <div className={styles.payNoQr}>
              (ยังไม่ได้ตั้งเบอร์ PromptPay — กรุณาจ่ายที่เคาน์เตอร์)
            </div>
          )}
          <div className={styles.payHint}>PromptPay · พร้อมเพย์</div>
        </div>

        <button className={styles.send} onClick={doUpload} disabled={sending}>
          {sending ? (<><span className={styles.spinner} /> กำลังส่ง…</>) : "จ่ายแล้ว ส่งรูปเลย"}
        </button>
        <button className={styles.again} onClick={reset} style={{ marginTop: 10 }}>
          ยกเลิก
        </button>
        <div className={styles.note} role="alert">{error}</div>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className={styles.success}>
        <div className={styles.checkCircle}><CheckIcon /></div>
        <div className={styles.successH}>
          {needsApproval ? "รอพนักงานยืนยัน" : "ส่งขึ้นจอแล้ว"}
        </div>
        <div className={styles.successSub}>
          {needsApproval
            ? pay.enabled
              ? "รูปของคุณส่งแล้ว รอพนักงานยืนยันการชำระเงินก่อนขึ้นจอ"
              : "รูปของคุณส่งแล้ว รอพนักงานตรวจสอบก่อนขึ้นจอสักครู่นะ"
            : queuedAhead > 0
              ? `มีคนส่งพร้อมกัน ${queuedAhead} คน รูปของคุณเข้าคิวแล้วและกำลังขึ้นจอ`
              : "รูปของคุณกำลังขึ้นจอทีวีที่ร้าน มองหาบนกำแพงรูปได้เลย"}
        </div>
        <button className={styles.again} onClick={reset}>ส่งอีกรูป</button>
      </main>
    );
  }

  return (
    <main className={styles.screen}>
      <div className="scanlines" aria-hidden />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        className={styles.hidden} onChange={onPick} aria-hidden="true" tabIndex={-1} />
      <input ref={galleryRef} type="file" accept="image/*"
        className={styles.hidden} onChange={onPick} aria-hidden="true" tabIndex={-1} />

      <div className={styles.header}>
        <span className={styles.brandDot} />
        {settings.brandName}
      </div>
      <h1 className={styles.title}>ส่งรูปขึ้นจอที่ร้าน</h1>
      <p className={styles.sub}>ถ่ายหรือเลือกรูป ใส่ชื่อ แล้วกดส่ง</p>

      <button type="button" className={styles.preview}
        onClick={() => galleryRef.current?.click()}
        aria-label="เลือกรูปเพื่อแสดงตัวอย่าง">
        {previewUrl && <div className={styles.pvtag}>พร้อมส่ง</div>}
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="ตัวอย่างรูปที่จะส่ง" />
        ) : (
          <span className={styles.uplink}>
            <span className={styles.scanBeam} aria-hidden />
            <span className={styles.uplinkIcon}>
              <span className={`${styles.cornerAccent} ${styles.cornerTL}`} />
              <span className={`${styles.cornerAccent} ${styles.cornerBR}`} />
              <PhotoIcon />
            </span>
            <span className={styles.uplinkTitle}>แตะเพื่อส่งรูป</span>
            <span className={styles.uplinkMeta}>
              รองรับ JPG, PNG • สูงสุด {settings.maxUploadMB}MB
            </span>
            <span className={styles.uplinkDots}>
              <span style={{ opacity: 0.5 }} />
              <span style={{ opacity: 0.3 }} />
              <span style={{ opacity: 0.1 }} />
            </span>
          </span>
        )}
      </button>

      <div className={styles.sources}>
        <button type="button" className={styles.srcBtn}
          onClick={() => cameraRef.current?.click()}>
          <CameraIcon /> ถ่ายรูป
        </button>
        <button type="button" className={styles.srcBtn}
          onClick={() => galleryRef.current?.click()}>
          <GalleryIcon /> เลือกรูป
        </button>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="nickname">ชื่อ Instagram</label>
        <input id="nickname" className={styles.input} value={name} maxLength={settings.nameMaxLen}
          placeholder="@username" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="caption">แคปชั่น</label>
        <select id="caption" className={styles.select}
          value={captionSel} onChange={(e) => onCaptionChange(e.target.value)}>
          <option value="">— ไม่ใส่แคปชั่น —</option>
          {settings.captions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="__custom__">+ พิมพ์เอง...</option>
        </select>
        {captionSel === "__custom__" && (
          <input className={`${styles.input} ${styles.customInput}`}
            value={msg} maxLength={settings.msgMaxLen}
            placeholder="พิมพ์แคปชั่นของคุณ..."
            onChange={(e) => setMsg(e.target.value)} />
        )}
      </div>

      <button className={styles.send} onClick={submit} disabled={sending || !blob}>
        {sending ? (
          <><span className={styles.spinner} /> กำลังส่ง…</>
        ) : pay.enabled && pay.amountBaht > 0 ? (
          `ส่งขึ้นจอ · ฿${pay.amountBaht.toLocaleString()}`
        ) : (
          "ส่งขึ้นจอเลย"
        )}
      </button>

      <div className={styles.note} role="alert">{error}</div>
    </main>
  );
}
