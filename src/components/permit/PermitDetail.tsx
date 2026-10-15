"use client";
import { useEffect, useState } from "react";
import {
  displayStatus,
  requiredRoles,
  ROLE_LABELS,
  STATUS_LABELS,
  type Permit,
  type PermitActor,
  type PermitRole,
} from "@/lib/permit/types";
import { dateTime, permitApi } from "./api";
import SignatureInput from "./SignatureInput";
import { supportsOriginalPdf } from "@/lib/permit/catalog";
const actionLabels: Record<string, string> = {
  submit: "ลงนามส่งคำขอ",
  approve: "ลงนามอนุมัติ",
  return: "ส่งกลับแก้ไข",
  start: "ยืนยันหน้างานและเปิดงาน",
  suspend: "พักงาน",
  resume: "ยืนยันกลับเข้าทำงาน",
  inspect: "บันทึกการตรวจ",
  request_close: "ลงนามขอปิดงาน",
  close: "ลงนามตรวจรับปิดงาน",
  cancel: "ยกเลิกใบอนุญาต",
  create: "สร้างคำขอ",
  edit: "แก้ไขร่าง",
};
const signedActions = ["submit", "approve", "start", "request_close", "close"];
export default function PermitDetail({
  permit: p,
  actor,
  company,
  onChanged,
  onBack,
  onEdit,
  onCopy,
}: {
  permit: Permit;
  actor: PermitActor;
  company: string;
  onChanged: (p: Permit) => void;
  onBack: () => void;
  onEdit: () => void;
  onCopy: () => void;
}) {
  const [action, setAction] = useState(""),
    [signature, setSignature] = useState(""),
    [confirm, setConfirm] = useState(false),
    [note, setNote] = useState(""),
    [unsafe, setUnsafe] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [qr, setQr] = useState("");
  useEffect(() => {
    let live = true;
    import("qrcode")
      .then((q) =>
        q.toDataURL(
          `${window.location.origin}/permit?company_id=${encodeURIComponent(company)}&id=${p.id}`,
          { width: 160, margin: 1 },
        ),
      )
      .then((v) => {
        if (live) setQr(v);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [company, p.id]);
  const owner = p.created_by === actor.key;
  const roles = requiredRoles(p.data);
  const assigned = roles.filter(
    (r) =>
      p.data.approvers[r] === actor.key &&
      (actor.admin || actor.roles.includes(r)),
  );
  const nextApproval = roles.find(
    (r) =>
      !p.data.signatures.some((s) => s.stage === "approve" && s.role === r),
  );
  const nextClose = (["area_owner", "safety"] as PermitRole[]).find(
    (r) => !p.data.signatures.some((s) => s.stage === "close" && s.role === r),
  );
  const expired = displayStatus(p) === "expired";
  const available: string[] = [];
  if (p.status === "draft" && owner) available.push("submit");
  if (p.status === "submitted" && assigned.length) {
    if (!expired && nextApproval && assigned.includes(nextApproval))
      available.push("approve");
    available.push("return");
  }
  if (p.status === "approved" && assigned.includes("area_owner") && !expired)
    available.push("start");
  if (p.status === "active" && (owner || assigned.length || actor.admin))
    available.push("suspend");
  if (p.status === "suspended" && assigned.includes("area_owner") && !expired)
    available.push("resume");
  if (["active", "suspended"].includes(p.status)) {
    if (assigned.length || actor.admin) available.push("inspect");
    if (owner) available.push("request_close");
  }
  if (p.status === "closing" && nextClose && assigned.includes(nextClose))
    available.push("close");
  if (
    !["closed", "cancelled", "closing"].includes(p.status) &&
    (owner || actor.admin || assigned.length)
  )
    available.push("cancel");
  async function perform(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await permitApi<{ data: Permit }>(
        `permits/${p.id}`,
        company,
        "POST",
        { action, version: p.version, signature, confirm, note, unsafe },
      );
      onChanged(r.data);
      setAction("");
      setSignature("");
      setConfirm(false);
      setNote("");
      setUnsafe(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      const r = await permitApi<{ data: Permit }>(`permits/${p.id}`, company);
      onChanged(r.data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="wp-stack">
      <div className="wp-page-title wp-no-print">
        <div>
          <span className="wp-eyebrow">PERMIT RECORD · V{p.version}</span>
          <h2>{p.data.title}</h2>
        </div>
        <div className="wp-inline">
          <button className="wp-secondary" onClick={onBack}>
            กลับรายการ
          </button>
          <button className="wp-secondary" onClick={() => window.print()}>
            พิมพ์สรุปข้อมูล
          </button>
          {supportsOriginalPdf(p) && (
            <a className="wp-primary" href={`/api/permit/permits/${p.id}/pdf?company_id=${encodeURIComponent(company)}`} target="_blank" rel="noopener noreferrer">
              พิมพ์ตามแม่แบบ / PDF
            </a>
          )}
        </div>
      </div>
      <article className="wp-panel wp-document">
        <header className="wp-document-head">
          <div>
            <span className="wp-eyebrow">
              {company.toUpperCase()} · WORK PERMIT
            </span>
            <h2>{p.data.title}</h2>
            <p className="wp-muted">เลขอ้างอิง {p.id}</p>
            <span className={`wp-status ${displayStatus(p)}`}>
              {STATUS_LABELS[displayStatus(p)]}
            </span>
          </div>
          {qr && (
            <div className="wp-qr">
              <img src={qr} alt="QR ตรวจสอบสถานะล่าสุดของใบอนุญาต" />
              <small>
                สแกนตรวจสถานะล่าสุด
                <br />
                ต้องเข้าสู่ระบบ
              </small>
            </div>
          )}
        </header>
        {p.status === "draft" && (
          <p className="wp-notice">ฉบับร่าง — ยังไม่ใช่การอนุญาตให้เริ่มงาน</p>
        )}
        {expired && (
          <p className="wp-error">
            พ้นช่วงเวลาที่ได้รับอนุญาตแล้ว ต้องขออนุมัติฉบับใหม่ก่อนทำงานต่อ
          </p>
        )}
        <dl className="wp-details">
          <div>
            <dt>พื้นที่</dt>
            <dd>{p.data.location}</dd>
          </div>
          <div>
            <dt>บริษัท / หน่วยงานผู้ปฏิบัติงาน</dt>
            <dd>{p.data.contractorName}</dd>
          </div>
          <div>
            <dt>เริ่มงาน (เวลาไทย)</dt>
            <dd>{dateTime(p.data.startsAt)}</dd>
          </div>
          <div>
            <dt>สิ้นสุด (เวลาไทย)</dt>
            <dd>{dateTime(p.data.endsAt)}</dd>
          </div>
          <div>
            <dt>ติดต่อ</dt>
            <dd>{p.data.phone}</dd>
          </div>
          <div>
            <dt>งานโครงการ</dt>
            <dd>{p.data.project ? "ใช่" : "ไม่ใช่"}</dd>
          </div>
        </dl>
        {(
          [
            ["detail", "รายละเอียดงาน"],
            ["workers", "ผู้ปฏิบัติงาน"],
            ["fireImpact", "ผลกระทบระบบดับเพลิง"],
          ] as const
        ).map(([k, label]) => (
          <section key={k}>
            <h4>{label}</h4>
            <p className="wp-pre">{p.data[k]}</p>
          </section>
        ))}
        {p.data.sourcePermitId && (
          <p>อ้างอิงฉบับก่อนหน้า: {p.data.sourcePermitId}</p>
        )}
        {p.data.forms.map((f) => (
          <section key={f.template.id} className="wp-form-section">
            <div className="wp-section-heading">
              <h3>
                {f.template.code} · {f.template.name}
              </h3>
              <span>
                Rev.{f.template.revision} / V{f.template.version}
              </span>
            </div>
            <p className="wp-muted">แบบฟอร์มดิจิทัลตามแม่แบบที่บริษัทเปิดใช้</p>
            {f.template.config.fields.map((field) => (
              <div className="wp-answer" key={field.id}>
                <strong>{field.label}</strong>
                <p className="wp-pre">
                  {f.answers[field.id] === "yes"
                    ? "ผ่าน / จัดให้มี"
                    : f.answers[field.id] === "no"
                      ? "ไม่ผ่าน"
                      : f.answers[field.id]?.startsWith("na:")
                        ? `ไม่เกี่ยวข้อง: ${f.answers[field.id].slice(3)}`
                        : f.answers[field.id] || "ยังไม่ระบุ"}
                </p>
              </div>
            ))}
          </section>
        ))}
        <section>
          <h3>ลายเซ็นและการยืนยัน</h3>
          {!p.data.signatures.length && (
            <p className="wp-muted">ยังไม่มีผู้ลงนาม</p>
          )}
          <div className="wp-signatures">
            {p.data.signatures.map((s, i) => (
              <div key={i} className="wp-signature">
                <strong>
                  {s.stage.startsWith("superseded:")
                    ? "ยกเลิกผลการลงนามเดิม"
                    : s.stage === "approve"
                      ? "อนุมัติ"
                      : s.stage === "close"
                        ? "ปิดงาน"
                        : s.stage === "start"
                          ? "เปิดงาน"
                          : "ยื่นคำขอ"}{" "}
                  · {ROLE_LABELS[s.role as PermitRole] || "ผู้ขออนุญาต"}
                </strong>
                <img src={s.image} alt={`ลายเซ็น ${s.name}`} />
                <b>{s.name}</b>
                <small>{dateTime(s.at)}</small>
                <small className="wp-hash">SHA-256 {s.hash}</small>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>เอกสารแนบ ({p.data.attachments.length})</h3>
          {p.data.attachments.map((a) => (
            <p key={a.id}>
              <a href={a.data} download={a.name}>
                {a.name}
              </a>
            </p>
          ))}
        </section>
        <section>
          <h3>ประวัติการดำเนินการ</h3>
          <ol className="wp-timeline">
            {p.data.events.map((e) => (
              <li key={e.id}>
                <b>{actionLabels[e.action] || e.action}</b>
                <span>
                  {e.name} · {dateTime(e.at)}
                </span>
                {e.note && <p className="wp-pre">{e.note}</p>}
              </li>
            ))}
          </ol>
        </section>
        <footer className="wp-print-note">
          เอกสารแสดงข้อมูล ณ เวลาที่พิมพ์ · ตรวจสอบสถานะล่าสุดผ่าน QR ก่อนใช้งาน
        </footer>
      </article>
      <section className="wp-panel wp-no-print">
        <h3>ดำเนินการกับใบอนุญาต</h3>
        <div className="wp-actions">
          {owner && p.status === "draft" && (
            <button className="wp-secondary" onClick={onEdit}>
              แก้ไขร่าง
            </button>
          )}
          <button
            className="wp-secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            โหลดสถานะล่าสุด
          </button>
          {(owner || actor.admin) && (
            <button className="wp-secondary" onClick={onCopy}>
              ต่ออายุ / สร้างฉบับใหม่
            </button>
          )}
          {available.map((v) => (
            <button
              key={v}
              className={
                v === "suspend" || v === "cancel" ? "wp-danger" : "wp-primary"
              }
              onClick={() => {
                setAction(v);
                setSignature("");
                setConfirm(false);
                setError("");
              }}
            >
              {actionLabels[v]}
            </button>
          ))}
        </div>
        {!available.length && (
          <p className="wp-muted">ไม่มีรายการที่ต้องดำเนินการสำหรับบัญชีนี้</p>
        )}
        {action && (
          <form onSubmit={perform} className="wp-action-form">
            <h3>{actionLabels[action]}</h3>
            <label>
              บันทึก / เหตุผล / ผลตรวจ
              <textarea
                value={note}
                required={!["submit", "approve"].includes(action)}
                maxLength={6000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {action === "inspect" && (
              <label className="wp-inline">
                <input
                  type="checkbox"
                  checked={unsafe}
                  onChange={(e) => setUnsafe(e.target.checked)}
                />
                พบสภาพไม่ปลอดภัย — เปลี่ยนเป็นพักงานทันที
              </label>
            )}
            {signedActions.includes(action) && (
              <>
                <SignatureInput value={signature} onChange={setSignature} />
                <label className="wp-inline">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />
                  ข้าพเจ้า {actor.name}{" "}
                  ตรวจทานเอกสารฉบับนี้และยืนยันลงนามด้วยตนเอง
                </label>
              </>
            )}
            <div className="wp-inline">
              <button
                className="wp-primary"
                disabled={
                  busy ||
                  (signedActions.includes(action) && (!signature || !confirm))
                }
              >
                {busy ? "กำลังบันทึก…" : "ยืนยัน" + actionLabels[action]}
              </button>
              <button
                type="button"
                className="wp-secondary"
                onClick={() => setAction("")}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="wp-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
