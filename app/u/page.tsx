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

export default function UploadPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [queuedAhead, setQueuedAhead] = useState(0);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
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
    if (!blob) {
      setError("กรุณาเลือกหรือถ่ายรูปก่อน");
      return;
    }
    setPhase("sending");
    setError("");
    try {
      const fd = new FormData();
      fd.append("image", blob, "photo.jpg");
      fd.append("name", name);
      fd.append("msg", msg);
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
      setQueuedAhead(data.queuedAhead ?? 0);
      setPhase("done");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ");
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl("");
    setName("");
    setMsg("");
    setPhase("idle");
    setError("");
  }

  if (phase === "done") {
    return (
      <main className={styles.success}>
        <div className={styles.checkCircle}>
          <CheckIcon />
        </div>
        <div className={styles.successH}>ส่งขึ้นจอแล้ว</div>
        <div className={styles.successSub}>
          {queuedAhead > 0
            ? `มีคนส่งพร้อมกัน ${queuedAhead} คน รูปของคุณเข้าคิวแล้วและกำลังขึ้นจอ`
            : "รูปของคุณกำลังขึ้นจอทีวีที่ร้าน มองหาบนกำแพงรูปได้เลย"}
        </div>
        <button className={styles.again} onClick={reset}>
          ส่งอีกรูป
        </button>
      </main>
    );
  }

  const sending = phase === "sending";

  return (
    <main className={styles.screen}>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hidden}
        onChange={onPick}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className={styles.hidden}
        onChange={onPick}
        aria-hidden="true"
        tabIndex={-1}
      />

      <div className={styles.header}>
        <span className={styles.brandDot} />
        NEON BAR
      </div>
      <h1 className={styles.title}>ส่งรูปขึ้นจอที่ร้าน</h1>
      <p className={styles.sub}>ถ่ายหรือเลือกรูป ใส่ชื่อ แล้วกดส่ง</p>

      <button
        type="button"
        className={styles.preview}
        onClick={() => galleryRef.current?.click()}
        aria-label="เลือกรูปเพื่อแสดงตัวอย่าง"
      >
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
        <button
          type="button"
          className={styles.srcBtn}
          onClick={() => cameraRef.current?.click()}
        >
          <CameraIcon />
          ถ่ายรูป
        </button>
        <button
          type="button"
          className={styles.srcBtn}
          onClick={() => galleryRef.current?.click()}
        >
          <GalleryIcon />
          เลือกรูป
        </button>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="nickname">
          ชื่อเล่น
        </label>
        <input
          id="nickname"
          className={styles.input}
          value={name}
          maxLength={40}
          placeholder="เช่น ปาร์ตี้"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="message">
          ข้อความ (ไม่ใส่ก็ได้)
        </label>
        <input
          id="message"
          className={styles.input}
          value={msg}
          maxLength={120}
          placeholder="เช่น ชนแก้ว!"
          onChange={(e) => setMsg(e.target.value)}
        />
      </div>

      <button
        className={styles.send}
        onClick={submit}
        disabled={sending || !blob}
      >
        {sending ? (
          <>
            <span className={styles.spinner} /> กำลังส่ง…
          </>
        ) : (
          "ส่งขึ้นจอเลย"
        )}
      </button>

      <div className={styles.note} role="alert">
        {error}
      </div>
    </main>
  );
}
