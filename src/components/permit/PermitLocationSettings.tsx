"use client";

import { useEffect, useState } from "react";
import { permitApi, type DirectoryEntry } from "./api";

type Location = { id: string; name: string; department: string; area_owner: string; safety: string; active: boolean };

export default function PermitLocationSettings({ company, directory }: { company: string; directory: DirectoryEntry[] }) {
  const [rows, setRows] = useState<Location[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", department: "", area_owner: "", safety: "" });
  const load = async () => setRows((await permitApi<{ data: Location[] }>("locations", company)).data);
  const names = new Map(directory.map(member => [member.actor_key, member.display_name]));
  const missingRoles = (["area_owner", "safety"] as const).filter(role => !directory.some(member => member.role === role));

  useEffect(() => {
    let live = true;
    permitApi<{ data: Location[] }>("locations", company)
      .then(result => { if (live) setRows(result.data); })
      .catch(reason => { if (live) setError(reason.message); });
    return () => { live = false; };
  }, [company]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await permitApi("locations", company, "POST", form);
      setForm({ ...form, name: "", department: "" });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(row: Location) {
    setBusy(true);
    setError("");
    try {
      await permitApi("locations", company, "PATCH", { id: row.id, active: !row.active });
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="wp-stack wps-settings wps-locations">
    <div className="wp-page-title">
      <div><span className="wp-eyebrow">{company.toUpperCase()} · LOCATION DIRECTORY</span><h2>พื้นที่และผู้รับผิดชอบ</h2><p>เลือกพื้นที่ครั้งเดียว ระบบจะกำหนดผู้รับผิดชอบตามพื้นที่ให้ในคำขอ</p></div>
      <div className="wps-summary" aria-label="สรุปพื้นที่"><div><strong>{rows.filter(row => row.active).length}</strong><span>พื้นที่เปิดใช้</span></div><div><strong>{rows.length}</strong><span>พื้นที่ทั้งหมด</span></div></div>
    </div>
    {error && <p className="wp-error" role="alert">{error}</p>}
    <section className="wp-panel wps-account-create">
      <details open={rows.length === 0}>
        <summary><span><strong>เพิ่มพื้นที่มาตรฐาน</strong><small>ระบุเจ้าของพื้นที่และผู้ตรวจความปลอดภัย เพื่อให้ส่งต่อคำขอได้ถูกคน</small></span><span className="wps-disclosure-mark" aria-hidden="true">+</span></summary>
        <form className="wp-stack wps-disclosure-body" onSubmit={save}>
          {missingRoles.length > 0 && <p className="wp-notice">กำหนดสิทธิ์{missingRoles.map(role => role === "area_owner" ? "เจ้าของพื้นที่" : "ผู้ตรวจความปลอดภัย").join(" และ ")}ในเมนูผู้ใช้และผู้ลงนามก่อนเพิ่มพื้นที่</p>}
          <div className="wp-form-grid">
            <label>ชื่อพื้นที่<input required maxLength={200} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
            <label>แผนกที่รับผิดชอบ<input maxLength={200} value={form.department} onChange={event => setForm({ ...form, department: event.target.value })} /></label>
            {(["area_owner", "safety"] as const).map(role => <label key={role}>{role === "area_owner" ? "เจ้าของพื้นที่" : "ผู้ตรวจความปลอดภัย"}<select required value={form[role]} onChange={event => setForm({ ...form, [role]: event.target.value })}><option value="">เลือกบัญชีที่ได้รับสิทธิ์แล้ว</option>{directory.filter(member => member.role === role && member.actor_key !== form[role === "area_owner" ? "safety" : "area_owner"]).map(member => <option value={member.actor_key} key={member.actor_key}>{member.display_name}</option>)}</select></label>)}
          </div>
          <div className="wps-form-footer"><span>ผู้ลงนามทั้งสองบทบาทต้องเป็นคนละบัญชี</span><button className="wp-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกพื้นที่"}</button></div>
        </form>
      </details>
    </section>
    <section className="wp-panel wps-location-list">
      <div className="wpd-section-title"><h3>พื้นที่ของบริษัท</h3><span>{rows.length} พื้นที่</span></div>
      {!rows.length && <div className="wps-empty"><span aria-hidden="true">⌖</span><p>ยังไม่มีพื้นที่มาตรฐาน</p><small>กำหนดผู้ลงนามแล้วเพิ่มพื้นที่ได้ที่นี่</small></div>}
      {rows.map(row => <div className="wps-location-row" key={row.id}>
        <div className="wps-location-identity"><span className="wps-location-symbol" aria-hidden="true">⌖</span><div><strong>{row.name}</strong><p>{row.department || "ยังไม่ระบุแผนก"}</p></div></div>
        <dl className="wps-location-responsibility"><div><dt>เจ้าของพื้นที่</dt><dd>{names.get(row.area_owner) || "บัญชีถูกถอนสิทธิ์"}</dd></div><div><dt>ผู้ตรวจความปลอดภัย</dt><dd>{names.get(row.safety) || "บัญชีถูกถอนสิทธิ์"}</dd></div></dl>
        <div className="wps-location-state"><span className={"wp-status " + (row.active ? "approved" : "draft")}>{row.active ? "เปิดใช้" : "ปิดใช้"}</span><button className="wp-secondary" disabled={busy} onClick={() => void toggle(row)}>{row.active ? "ปิดใช้" : "เปิดใช้"}</button></div>
      </div>)}
    </section>
  </div>;
}
