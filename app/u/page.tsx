"use client";

import { useRef, useState } from "react";
import { imageToJpeg } from "@/lib/client";
import {
  CameraIcon,
  GalleryIcon,
  PhotoIcon,
  CheckIcon,
} from "@/components/icons";
import styles from "./u.module.css";

type Phase = "idle" | "sending" | "done";

const CAPTIONS = [
  "เมาไม่มาก แค่เพื่อนต้องลากไปส่ง",
  "เหล้าไม่แรง…แต่ใจเต้นแรงมาก",
  "ดื่มไม่บ่อย แค่ลอยทุกเช้า",
  "เมาแบบมีชั้นเชิง…เดินเซแบบมีสไตล์",
  "เมาแล้วพูดไม่เพราะ แต่น่ารักอะเนอะเลยไม่ถือ",
  "เมาเหล้าก็เสียหลัก เมารักก็เสียเงิน",
  "เห็นเธอเทไม่ยั้ง เราเลยไม่รั้งเธอไว้",
  "เปย์กันอย่างนี้นาน นานนะเธอ",
  "ไม่รู้ทำไมอยากเมาทีไร คิดถึงแกทุกที",
  "ปาร์ตี้ในคืนวันเสาร์ กับความเหงาในเช้าวันอาทิตย์",
  "วันนี้ไม่เน้นเมา เน้นเอาใจเธอมากกว่า",
  "แก้วนี้ยังว่าง คนข้างๆ ก็เหมือนกัน",
  "ปาร์ตี้เบา ๆ แต่ตัวเราไม่เบาแล้วนะ",
  "คืนนี้ไม่มีหลง แต่ลงรถผิดสถานี",
  "ปาร์ตี้แบบมีเธอ ก็เผลอใจง่ายเป็นพิเศษ",
  "กลางวันทำงาน กลางคืนทำมึน",
  "ถ้าเมาแล้วเดินหลง ให้เราไปส่งป่ะ",
  "เหล้าทำลายตับ แต่เธอทำลายใจ",
  "คืนนี้ไม่ชอบคนหรู แต่ขอคนที่ดูจริงใจ",
  "กลางคืนแค่ลั้นลา พอเช้ามาแทบตาย",
  "ไม่มีหรอกคนลูบหัว ส่วนมากมีแต่คนลูบหลัง",
  "ถ้าเขาจะรัก กลับบ้านเช้าเขาก็รัก",
  "ตับแข็งเรื่องเล็ก หมดเป๊กเรื่องใหญ่",
  "อยากชวนเธอไปร้านนั่งชิล ไปนั่งเล่นกันแบบฟีลแฟน",
  "เวลาเมา คำว่าเบาก็ไม่มีในโลก",
  "โครตเหนื่อย โครตเพลีย ขอเบียร์สักแก้ว",
  "อุบัติเหตุที่ชอบที่สุดคือ ชนแก้ว",
  "ถ้าเรารวย เราจะซื้อเบียร์ไปสู่ขอเธอ",
  "ได้หมดถ้าสดชื่น ถ้าไม่ลื่นก็เดินไหว",
  "กินเหล้าอาจจะเมา... แต่ถ้ากินเรา รับรองว่าติดใจ",
  "เมาแล้วเดินเซ... ให้เปย์ไปส่งที่ห้องไหมคะ?",
  "แก้วนี้โซจู ส่วนยูอ่ะโซฮอต... คืนนี้ขออนุอดพากลับนะ",
  "เหล้าไม่เมา... แต่คนข้างๆ ทำไมใจสั่นจัง",
  "คืนนี้เพื่อนไม่ว่าง... ขออนุญาตให้เธอเป็นคนพากลับแทนนะ",
];

export default function UploadPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [captionSel, setCaptionSel] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [queuedAhead, setQueuedAhead] = useState(0);

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

  async function submit() {
    if (!blob) { setError("กรุณาเลือกหรือถ่ายรูปก่อน"); return; }
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
      setPhase("done");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null); setPreviewUrl(""); setName(""); setMsg("");
    setCaptionSel(""); setPhase("idle"); setError("");
  }

  function onCaptionChange(val: string) {
    setCaptionSel(val);
    if (val !== "__custom__") setMsg(val);
    else setMsg("");
  }

  if (phase === "done") {
    return (
      <main className={styles.success}>
        <div className={styles.checkCircle}><CheckIcon /></div>
        <div className={styles.successH}>ส่งขึ้นจอแล้ว</div>
        <div className={styles.successSub}>
          {queuedAhead > 0
            ? `มีคนส่งพร้อมกัน ${queuedAhead} คน รูปของคุณเข้าคิวแล้วและกำลังขึ้นจอ`
            : "รูปของคุณกำลังขึ้นจอทีวีที่ร้าน มองหาบนกำแพงรูปได้เลย"}
        </div>
        <button className={styles.again} onClick={reset}>ส่งอีกรูป</button>
      </main>
    );
  }

  const sending = phase === "sending";

  return (
    <main className={styles.screen}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        className={styles.hidden} onChange={onPick} aria-hidden="true" tabIndex={-1} />
      <input ref={galleryRef} type="file" accept="image/*"
        className={styles.hidden} onChange={onPick} aria-hidden="true" tabIndex={-1} />

      <div className={styles.header}>
        <span className={styles.brandDot} />
        NEON BAR
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
          <span className={styles.previewEmpty}>
            <PhotoIcon />
            <span>แตะเพื่อเลือกรูป</span>
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
        <input id="nickname" className={styles.input} value={name} maxLength={40}
          placeholder="@username" onChange={(e) => setName(e.target.value)} />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="caption">แคปชั่น</label>
        <select id="caption" className={styles.select}
          value={captionSel} onChange={(e) => onCaptionChange(e.target.value)}>
          <option value="">— ไม่ใส่แคปชั่น —</option>
          {CAPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
          <option value="__custom__">✏️ พิมพ์เอง...</option>
        </select>
        {captionSel === "__custom__" && (
          <input className={`${styles.input} ${styles.customInput}`}
            value={msg} maxLength={120}
            placeholder="พิมพ์แคปชั่นของคุณ..."
            onChange={(e) => setMsg(e.target.value)} />
        )}
      </div>

      <button className={styles.send} onClick={submit} disabled={sending || !blob}>
        {sending ? (<><span className={styles.spinner} /> กำลังส่ง…</>) : "ส่งขึ้นจอเลย"}
      </button>

      <div className={styles.note} role="alert">{error}</div>
    </main>
  );
}
