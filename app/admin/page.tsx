"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { PublicSettings } from "@/lib/settings";
import type { Photo } from "@/lib/client";
import { useUploadQr } from "@/lib/useUploadQr";
import { BoltIcon, MonitorIcon, CameraIcon } from "@/components/icons";
import styles from "./admin.module.css";

type Tab =
  | "brand"
  | "timing"
  | "captions"
  | "payment"
  | "live"
  | "approve"
  | "qr"
  | "pin";

type TodayStats = { uploads: number; approved: number };

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pinSet, setPinSet] = useState(false);

  // Check auth on mount
  const refreshAuth = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/login", { cache: "no-store" });
      const d = await r.json();
      setAuthed(Boolean(d.authed));
      setPinSet(Boolean(d.pinSet));
    } catch {
      setAuthed(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  if (authed === null) {
    return <div className={styles.page} />;
  }

  if (!authed) {
    return (
      <div className={styles.page}>
        <PinGate pinSet={pinSet} onSuccess={refreshAuth} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Dashboard onLogout={refreshAuth} />
    </div>
  );
}

// ── PIN gate ────────────────────────────────────────────────────────────────
function PinGate({ pinSet, onSuccess }: { pinSet: boolean; onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!/^\d{4,6}$/.test(pin)) {
      setErr("PIN ต้องเป็นตัวเลข 4–6 หลัก");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "เข้าสู่ระบบไม่สำเร็จ");
      onSuccess();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ผิดพลาด");
      setBusy(false);
    }
  }

  return (
    <div className={styles.gate}>
      <div className={styles.gateLogo}>
        <BoltIcon style={{ width: 26, height: 26 }} />
        ADMIN
      </div>
      <div className={styles.gateTitle}>
        {pinSet ? "ใส่ PIN เพื่อเข้าหลังร้าน" : "ตั้ง PIN ครั้งแรก"}
      </div>
      {!pinSet && (
        <div className={styles.gateSub}>
          ตั้งรหัส PIN 4–6 หลักสำหรับเข้าหน้าตั้งค่า จำให้ดี — ใช้ทุกครั้งที่เข้าหน้านี้
        </div>
      )}
      <input
        className={styles.pinInput}
        type="password"
        inputMode="numeric"
        autoFocus
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="••••"
      />
      <div className={styles.gateErr}>{err}</div>
      <button className={styles.gateBtn} onClick={submit} disabled={busy}>
        {pinSet ? "เข้าสู่ระบบ" : "ตั้ง PIN"}
      </button>
    </div>
  );
}

// ── Dashboard ───────────────────────────────────────────────────────────────
const emptyDraft: PublicSettings = {
  brandName: "",
  tagline: "",
  idleTitle: "",
  idleSub: "",
  qrHeading: "",
  qrSub: "",
  tvDurationSec: 40,
  slideshowDurationSec: 60,
  nameMaxLen: 40,
  msgMaxLen: 120,
  maxUploadMB: 15,
  captions: [],
  payment: { enabled: false, amountBaht: 20, promptPayId: "", requireApproval: true },
  uploadsPaused: false,
  moderateAll: false,
};

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("brand");
  const [draft, setDraft] = useState<PublicSettings>(emptyDraft);
  const [newPin, setNewPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<Photo[]>([]);
  const [live, setLive] = useState<Photo[]>([]);
  const [stats, setStats] = useState<TodayStats>({ uploads: 0, approved: 0 });
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const { src: qrSrc, url: qrUrl } = useUploadQr();

  // Load editable settings
  useEffect(() => {
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.settings && setDraft(d.settings))
      .catch(() => {});
  }, []);

  const loadPhotos = useCallback(() => {
    fetch("/api/admin/photos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setPending(d?.pending ?? []);
        setLive(d?.live ?? []);
        if (d?.stats) setStats(d.stats);
        if (d?.serverNow) setServerOffsetMs(d.serverNow - Date.now());
      })
      .catch(() => {});
  }, []);

  // Poll pending queue + live wall + counters
  useEffect(() => {
    loadPhotos();
    const t = setInterval(loadPhotos, 4000);
    return () => clearInterval(t);
  }, [loadPhotos]);

  const set = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const setPay = <K extends keyof PublicSettings["payment"]>(
    k: K,
    v: PublicSettings["payment"][K]
  ) => setDraft((d) => ({ ...d, payment: { ...d.payment, [k]: v } }));

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const body: { settings: PublicSettings; newPin?: string } = { settings: draft };
      if (newPin) {
        if (!/^\d{4,6}$/.test(newPin)) throw new Error("PIN ใหม่ต้องเป็นตัวเลข 4–6 หลัก");
        body.newPin = newPin;
      }
      const r = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "บันทึกไม่สำเร็จ");
      setDraft(d.settings);
      setNewPin("");
      setMsg("บันทึกแล้ว ✓");
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "ผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    onLogout();
  }

  async function act(id: string, action: "approve" | "reject" | "delete") {
    setPending((p) => p.filter((x) => x.id !== id));
    if (action === "delete") setLive((p) => p.filter((x) => x.id !== id));
    await fetch("/api/admin/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    loadPhotos();
  }

  async function clearWall() {
    if (!window.confirm("ล้างกำแพงรูปทั้งหมด? รูปทุกใบ (รวมคิวรออนุมัติ) จะถูกลบถาวร")) {
      return;
    }
    setLive([]);
    setPending([]);
    await fetch("/api/admin/photos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear" }),
    });
    loadPhotos();
  }

  const paymentActive = draft.payment.enabled && draft.payment.requireApproval;

  return (
    <div className={styles.shell}>
      <div className={styles.head}>
        <div className={styles.logo}>
          <BoltIcon style={{ width: 24, height: 24 }} />
          {draft.brandName || "NEON BAR"}
          <span className={styles.logoSub}>· หลังร้าน</span>
        </div>
        <button className={styles.logout} onClick={logout}>
          ออกจากระบบ
        </button>
      </div>

      <div className={styles.quickLinks}>
        <Link href="/tv" className={styles.quickLink} target="_blank">
          <MonitorIcon style={{ width: 15, height: 15 }} /> เปิดจอทีวี
        </Link>
        <Link href="/u" className={styles.quickLink} target="_blank">
          <CameraIcon style={{ width: 15, height: 15 }} /> หน้าส่งรูป
        </Link>
      </div>

      <div className={styles.statsBar}>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{stats.uploads}</div>
          <div className={styles.statLbl}>รูปที่ส่งเข้ามาวันนี้</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{live.length}</div>
          <div className={styles.statLbl}>บนจอ / รอคิว</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statNum} ${styles.pink}`}>{pending.length}</div>
          <div className={styles.statLbl}>รออนุมัติ</div>
        </div>
        {draft.payment.enabled && (
          <div className={styles.statCard}>
            <div className={styles.statNum}>
              ฿{(stats.approved * draft.payment.amountBaht).toLocaleString()}
            </div>
            <div className={styles.statLbl}>
              รายได้วันนี้ (ประมาณ · {stats.approved} รูป)
            </div>
          </div>
        )}
      </div>

      <div className={styles.tabs}>
        <TabBtn id="brand" tab={tab} setTab={setTab}>แบรนด์ & ข้อความ</TabBtn>
        <TabBtn id="timing" tab={tab} setTab={setTab}>เวลา & การรับรูป</TabBtn>
        <TabBtn id="captions" tab={tab} setTab={setTab}>แคปชั่น</TabBtn>
        <TabBtn id="payment" tab={tab} setTab={setTab}>ค่าโพสต์รูป</TabBtn>
        <TabBtn id="live" tab={tab} setTab={setTab} badge={live.length}>
          รูปบนจอ
        </TabBtn>
        <TabBtn id="approve" tab={tab} setTab={setTab} badge={pending.length}>
          คิวอนุมัติ
        </TabBtn>
        <TabBtn id="qr" tab={tab} setTab={setTab}>QR</TabBtn>
        <TabBtn id="pin" tab={tab} setTab={setTab}>PIN</TabBtn>
      </div>

      {tab === "brand" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>แบรนด์ & ข้อความหน้าลูกค้า</h2>
          <p className={styles.cardHint}>
            ชื่อร้านนี้จะแสดงทุกที่ (จอทีวี / หน้าส่งรูป / สไลด์โชว์) แทนที่ค่าเดิมที่ไม่ตรงกัน
          </p>
          <Text label="ชื่อร้าน" value={draft.brandName} onChange={(v) => set("brandName", v)} />
          <Text label="คำโปรย (tagline)" value={draft.tagline} onChange={(v) => set("tagline", v)} />
          <div className={styles.row}>
            <Text label="หัวข้อหน้ารอ (จอทีวี)" value={draft.idleTitle} onChange={(v) => set("idleTitle", v)} />
            <Text label="คำอธิบายหน้ารอ" value={draft.idleSub} onChange={(v) => set("idleSub", v)} />
          </div>
          <div className={styles.row}>
            <Text label="หัวข้อ QR" value={draft.qrHeading} onChange={(v) => set("qrHeading", v)} />
            <Text label="คำอธิบาย QR" value={draft.qrSub} onChange={(v) => set("qrSub", v)} />
          </div>
        </div>
      )}

      {tab === "timing" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>เวลาแสดงรูป & ข้อจำกัด</h2>
          <p className={styles.cardHint}>ปรับว่าแต่ละรูปอยู่บนจอนานแค่ไหนก่อนสลับรูปถัดไป</p>
          <div className={styles.row}>
            <Num label="เวลาแสดงบนจอทีวี" value={draft.tvDurationSec} unit="วินาที" onChange={(v) => set("tvDurationSec", v)} />
            <Num label="เวลาแสดงในสไลด์โชว์" value={draft.slideshowDurationSec} unit="วินาที" onChange={(v) => set("slideshowDurationSec", v)} />
          </div>
          <div className={styles.row}>
            <Num label="ความยาวชื่อสูงสุด" value={draft.nameMaxLen} unit="ตัวอักษร" onChange={(v) => set("nameMaxLen", v)} />
            <Num label="ความยาวแคปชั่นสูงสุด" value={draft.msgMaxLen} unit="ตัวอักษร" onChange={(v) => set("msgMaxLen", v)} />
          </div>
          <Num label="ขนาดไฟล์รูปสูงสุด" value={draft.maxUploadMB} unit="MB" onChange={(v) => set("maxUploadMB", v)} />

          <h2 className={styles.cardTitle} style={{ marginTop: 28 }}>การรับรูปจากลูกค้า</h2>
          <Toggle
            label="ปิดรับรูปชั่วคราว"
            hint={
              draft.uploadsPaused
                ? "กำลังปิดรับ — ลูกค้าที่สแกน QR จะเห็นข้อความว่าปิดรับรูปแล้ว"
                : "เปิดรับรูปตามปกติ — เปิดสวิตช์นี้ตอนร้านปิดหรือจบอีเวนต์"
            }
            on={draft.uploadsPaused}
            onToggle={() => set("uploadsPaused", !draft.uploadsPaused)}
          />
          <Toggle
            label="ตรวจทุกรูปก่อนขึ้นจอ"
            hint="รูปทุกใบ (แม้โพสต์ฟรี) ต้องให้พนักงานอนุมัติในแท็บคิวอนุมัติก่อนขึ้นจอ — กันรูปไม่เหมาะสม"
            on={draft.moderateAll}
            onToggle={() => set("moderateAll", !draft.moderateAll)}
          />
        </div>
      )}

      {tab === "captions" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>แคปชั่นสำเร็จรูป</h2>
          <p className={styles.cardHint}>
            รายการแคปชั่นที่ลูกค้าเลือกได้ตอนส่งรูป ({draft.captions.length} อัน)
          </p>
          <div className={styles.capList}>
            {draft.captions.map((c, i) => (
              <div key={i} className={styles.capRow}>
                <input
                  className={styles.input}
                  value={c}
                  onChange={(e) => {
                    const next = [...draft.captions];
                    next[i] = e.target.value;
                    set("captions", next);
                  }}
                />
                <button
                  className={styles.capDel}
                  onClick={() => set("captions", draft.captions.filter((_, j) => j !== i))}
                  aria-label="ลบ"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className={styles.capAdd}
            onClick={() => set("captions", [...draft.captions, ""])}
          >
            + เพิ่มแคปชั่น
          </button>
        </div>
      )}

      {tab === "payment" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>ค่าโพสต์รูป (PromptPay)</h2>
          <p className={styles.cardHint}>
            เก็บเงินก่อนรูปขึ้นจอ — ลูกค้าจ่ายผ่าน QR PromptPay ตามจำนวนที่ตั้งไว้
          </p>
          <Toggle
            label="เปิดเก็บค่าโพสต์รูป"
            hint="ถ้าปิด รูปขึ้นจอฟรีเหมือนเดิม"
            on={draft.payment.enabled}
            onToggle={() => setPay("enabled", !draft.payment.enabled)}
          />
          {draft.payment.enabled && (
            <>
              <div className={styles.row}>
                <Num label="ราคาต่อรูป" value={draft.payment.amountBaht} unit="บาท" onChange={(v) => setPay("amountBaht", v)} />
                <Text
                  label="เบอร์ PromptPay / เลขบัตร ปชช."
                  value={draft.payment.promptPayId}
                  onChange={(v) => setPay("promptPayId", v)}
                />
              </div>
              <Toggle
                label="ต้องให้พนักงานอนุมัติก่อนขึ้นจอ"
                hint={
                  paymentActive
                    ? "รูปจะเข้าคิว 'รออนุมัติ' — พนักงานเช็คเงินเข้าแล้วกดอนุมัติในแท็บคิวอนุมัติ"
                    : "เชื่อลูกค้า: กด 'จ่ายแล้ว' รูปขึ้นจอทันที (ไม่ต้องอนุมัติ)"
                }
                on={draft.payment.requireApproval}
                onToggle={() => setPay("requireApproval", !draft.payment.requireApproval)}
              />
            </>
          )}
        </div>
      )}

      {tab === "live" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>รูปบนจอ / รอคิว ({live.length})</h2>
          <p className={styles.cardHint}>
            รูปที่กำลังแสดงและรอคิวขึ้นจอ — กดลบเพื่อเอารูปออกทันที (เช่น รูปไม่เหมาะสม)
          </p>
          {live.length === 0 ? (
            <div className={styles.pendEmpty}>ยังไม่มีรูปบนจอ</div>
          ) : (
            <div className={styles.pendGrid}>
              {live.map((p) => {
                const now = Date.now() + serverOffsetMs;
                const showing = Boolean(
                  p.displayStartedAt &&
                    p.displayStartedAt <= now &&
                    p.displayUntil &&
                    p.displayUntil > now
                );
                return (
                  <div key={p.id} className={`${styles.pendCard} ${styles.liveCard}`}>
                    {showing ? (
                      <span className={styles.liveNow}>กำลังแสดง</span>
                    ) : (
                      <span className={styles.queuedTag}>
                        {p.displayStartedAt ? "แสดงแล้ว" : "รอคิว"}
                      </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.pendImg} src={`/api/img/${p.id}`} alt={p.name} />
                    <div className={styles.pendMeta}>
                      <div className={styles.pendName}>{p.name}</div>
                      {p.msg && <div className={styles.pendMsg}>{p.msg}</div>}
                    </div>
                    <div className={styles.pendBtns}>
                      <button className={styles.pendReject} onClick={() => act(p.id, "delete")}>
                        ลบออกจากจอ
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.clearRow}>
            <button className={styles.dangerBtn} onClick={clearWall}>
              ล้างกำแพงรูปทั้งหมด
            </button>
          </div>
        </div>
      )}

      {tab === "qr" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>QR หน้าส่งรูปสำหรับพิมพ์</h2>
          <p className={styles.cardHint}>
            ดาวน์โหลดไปพิมพ์แปะโต๊ะ/เมนู ลูกค้าสแกนแล้วเข้าหน้าส่งรูปได้เลย ไม่ต้องพึ่งจอทีวี
          </p>
          <div className={styles.qrWrap}>
            {qrSrc && (
              <div className={styles.qrBig}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="QR หน้าส่งรูป" />
              </div>
            )}
            <div className={styles.qrInfo}>
              <div className={styles.qrUrl}>{qrUrl}</div>
              {qrSrc && (
                <a className={styles.qrDl} href={qrSrc} download="qr-send-photo.png">
                  ดาวน์โหลด QR (PNG)
                </a>
              )}
              <p className={styles.cardHint} style={{ marginTop: 14 }}>
                QR ชี้ไปที่โดเมนเดียวกับหน้าแอดมินนี้ — ถ้าใช้ในวง LAN
                ให้เปิดหน้าแอดมินผ่าน IP เครื่อง (ไม่ใช่ localhost) ก่อนดาวน์โหลด
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === "approve" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>คิวรออนุมัติ ({pending.length})</h2>
          <p className={styles.cardHint}>
            รูปที่ลูกค้าจ่ายแล้วรอพนักงานยืนยัน — กดอนุมัติเพื่อให้ขึ้นจอ
          </p>
          {pending.length === 0 ? (
            <div className={styles.pendEmpty}>ไม่มีรูปรออนุมัติ</div>
          ) : (
            <div className={styles.pendGrid}>
              {pending.map((p) => (
                <div key={p.id} className={styles.pendCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className={styles.pendImg} src={`/api/img/${p.id}`} alt={p.name} />
                  <div className={styles.pendMeta}>
                    <div className={styles.pendName}>{p.name}</div>
                    {p.msg && <div className={styles.pendMsg}>{p.msg}</div>}
                  </div>
                  <div className={styles.pendBtns}>
                    <button className={styles.pendApprove} onClick={() => act(p.id, "approve")}>
                      อนุมัติ
                    </button>
                    <button className={styles.pendReject} onClick={() => act(p.id, "reject")}>
                      ปฏิเสธ
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "pin" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>เปลี่ยน PIN</h2>
          <p className={styles.cardHint}>ตั้งรหัส PIN ใหม่ 4–6 หลัก แล้วกดบันทึกด้านล่าง</p>
          <div className={styles.field} style={{ maxWidth: 240 }}>
            <label className={styles.label}>PIN ใหม่</label>
            <input
              className={styles.input}
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              placeholder="เว้นว่างถ้าไม่เปลี่ยน"
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
        </div>
      )}

      {tab !== "approve" && tab !== "live" && tab !== "qr" && (
        <div className={styles.saveBar}>
          {msg && <span className={styles.saveMsg}>{msg}</span>}
          <button className={styles.saveBtn} onClick={save} disabled={saving}>
            {saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Small field components ──────────────────────────────────────────────────
function TabBtn({
  id,
  tab,
  setTab,
  children,
  badge,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      className={`${styles.tab} ${tab === id ? styles.active : ""}`}
      onClick={() => setTab(id)}
    >
      {children}
      {badge ? <span className={styles.tabBadge}>{badge}</span> : null}
    </button>
  );
}

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input className={styles.input} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Num({
  label,
  value,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.suffix}>
        <input
          className={styles.input}
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className={styles.suffixUnit}>{unit}</span>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={styles.toggle}>
      <div>
        <div className={styles.toggleLabel}>{label}</div>
        <div className={styles.toggleHint}>{hint}</div>
      </div>
      <button
        className={`${styles.switch} ${on ? styles.on : ""}`}
        onClick={onToggle}
        role="switch"
        aria-checked={on}
        aria-label={label}
      >
        <span className={styles.switchKnob} />
      </button>
    </div>
  );
}
