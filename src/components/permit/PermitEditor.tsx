"use client";
import { useState } from "react";
import {
  ROLE_LABELS,
  requiredRoles,
  type Permit,
  type PermitActor,
  type PermitData,
  type PermitTemplate,
} from "@/lib/permit/types";
import { localTime, permitApi, type DirectoryEntry } from "./api";
export default function PermitEditor({
  actor,
  company,
  templates,
  directory,
  initial,
  copy,
  onSaved,
  onCancel,
}: {
  actor: PermitActor;
  company: string;
  templates: PermitTemplate[];
  directory: DirectoryEntry[];
  initial?: Permit;
  copy?: boolean;
  onSaved: (p: Permit) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<PermitData>(() =>
    initial
      ? {
          ...structuredClone(initial.data),
          signatures: [],
          events: [],
          ...(copy
            ? {
                sourcePermitId: initial.id,
                startsAt: new Date().toISOString(),
                endsAt: new Date(Date.now() + 8 * 3600000).toISOString(),
              }
            : {}),
        }
      : {
          title: "",
          location: "",
          detail: "",
          contractorName: actor.contractorName || "",
          phone: "",
          workers: "",
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 8 * 3600000).toISOString(),
          fireImpact: "",
          project: false,
          forms: [],
          approvers: {},
          attachments: [],
          signatures: [],
          events: [],
        },
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const set = (key: keyof PermitData, value: unknown) =>
    setData((d) => ({ ...d, [key]: value }));
  function toggle(t: PermitTemplate) {
    setData((d) => ({
      ...d,
      forms: d.forms.some((f) => f.template.id === t.id)
        ? d.forms.filter((f) => f.template.id !== t.id)
        : [
            ...d.forms.filter((f) => f.template.code !== t.code),
            { template: t, answers: {} },
          ],
    }));
  }
  function answer(id: string, field: string, value: string) {
    setData((d) => ({
      ...d,
      forms: d.forms.map((f) =>
        f.template.id === id
          ? { ...f, answers: { ...f.answers, [field]: value } }
          : f,
      ),
    }));
  }
  async function attachments(files: FileList | null) {
    if (!files) return;
    setError("");
    try {
      const items = await Promise.all(
        Array.from(files).map(async (f) => {
          if (
            f.size > 350000 ||
            !["application/pdf", "image/png", "image/jpeg"].includes(f.type)
          )
            throw new Error("แนบ PDF/PNG/JPG ไม่เกิน 350 KB ต่อไฟล์");
          const data = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
            r.readAsDataURL(f);
          });
          return { id: crypto.randomUUID(), name: f.name, type: f.type, data };
        }),
      );
      setData((d) => ({ ...d, attachments: [...d.attachments, ...items] }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const edit = initial && !copy;
      const r = await permitApi<{ data: Permit }>(
        `permits${edit ? "/" + initial.id : ""}`,
        company,
        edit ? "PUT" : "POST",
        { data, version: initial?.version },
      );
      onSaved(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const options = templates.filter((t) => t.active);
  return (
    <form onSubmit={save} className="wp-stack">
      <div className="wp-page-title">
        <div>
          <span className="wp-eyebrow">NEW WORK REQUEST</span>
          <h2>
            {copy
              ? "ต่ออายุ / สร้างฉบับใหม่"
              : initial
                ? "แก้ไขร่าง"
                : "สร้างคำขออนุญาตทำงาน"}
          </h2>
          <p>กรอกข้อมูลครั้งเดียว เชื่อมแบบฟอร์มที่เกี่ยวข้องในชุดงานเดียว</p>
        </div>
        <button type="button" className="wp-secondary" onClick={onCancel}>
          กลับรายการ
        </button>
      </div>
      {copy && (
        <div className="wp-notice">
          สร้างฉบับใหม่อ้างอิงใบเดิม
          ผู้เกี่ยวข้องต้องลงนามใหม่ก่อนเริ่มช่วงเวลาถัดไป
        </div>
      )}
      <section className="wp-panel">
        <h3>01 · ข้อมูลการทำงาน</h3>
        <div className="wp-form-grid">
          {(
            [
              ["title", "ชื่องาน"],
              ["location", "พื้นที่ปฏิบัติงาน"],
              ["contractorName", "บริษัท / หน่วยงานที่ปฏิบัติงาน"],
              ["phone", "เบอร์ติดต่อ"],
            ] as const
          ).map(([k, label]) => (
            <label key={k}>
              {label}
              <input
                required
                maxLength={k === "phone" ? 80 : 200}
                value={data[k]}
                disabled={k === "contractorName" && actor.contractor}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}
          <label>
            เริ่มงาน
            <input
              required
              type="datetime-local"
              value={localTime(data.startsAt)}
              onChange={(e) => {
                if (e.target.value)
                  set("startsAt", new Date(e.target.value).toISOString());
              }}
            />
          </label>
          <label>
            สิ้นสุดงาน
            <input
              required
              type="datetime-local"
              value={localTime(data.endsAt)}
              onChange={(e) => {
                if (e.target.value)
                  set("endsAt", new Date(e.target.value).toISOString());
              }}
            />
          </label>
        </div>
        <p className="wp-muted">
          เวลาในช่องกรอกตามเขตเวลาของอุปกรณ์ · รายการเอกสารแสดงเวลาไทย
        </p>
        {(
          [
            ["detail", "รายละเอียด / ขอบเขตงาน"],
            ["workers", "รายชื่อผู้ปฏิบัติงานและหน้าที่"],
            [
              "fireImpact",
              "ผลกระทบต่อระบบดับเพลิงและการประสานงาน (หากไม่มีให้ระบุ)",
            ],
          ] as const
        ).map(([k, label]) => (
          <label key={k}>
            {label}
            <textarea
              required
              maxLength={5000}
              value={data[k]}
              onChange={(e) => set(k, e.target.value)}
            />
          </label>
        ))}
        <label className="wp-inline">
          <input
            type="checkbox"
            checked={data.project}
            onChange={(e) => set("project", e.target.checked)}
          />
          เป็นงานโครงการ ต้องมีผู้จัดการโครงการร่วมอนุมัติ
        </label>
      </section>
      <section className="wp-panel">
        <h3>02 · เลือกแบบฟอร์ม</h3>
        <p className="wp-muted">
          แบบ AMITA ใช้ General Work Permit ร่วมกับแบบงานเสี่ยงสูงที่เกี่ยวข้อง
        </p>
        {!options.length && (
          <p className="wp-notice">
            ยังไม่มีแม่แบบที่เปิดใช้ ให้ผู้ดูแลตรวจทานและเปิดใช้ในเมนูแม่แบบ
          </p>
        )}
        <div className="wp-template-grid">
          {options.map((t) => (
            <label
              key={t.id}
              className={`wp-template-choice ${data.forms.some((f) => f.template.id === t.id) ? "chosen" : ""}`}
            >
              <input
                type="checkbox"
                checked={data.forms.some((f) => f.template.id === t.id)}
                onChange={() => toggle(t)}
              />
              <span>
                <b>{t.code}</b>
                <strong>{t.name}</strong>
                <small>
                  Rev.{t.revision} · เวอร์ชัน {t.version}
                </small>
              </span>
            </label>
          ))}
        </div>
      </section>
      {data.forms.map((f) => (
        <section key={f.template.id} className="wp-panel">
          <h3>
            {f.template.code} · {f.template.name}
          </h3>
          {!options.some((t) => t.id === f.template.id) && (
            <p className="wp-error">
              แม่แบบนี้เลิกใช้แล้ว เลือกเวอร์ชันที่เปิดใช้อยู่ก่อนบันทึก
            </p>
          )}
          {f.template.config.fields.map((field) =>
            field.kind === "check" ? (
              <div key={field.id} className="wp-check-row">
                <label htmlFor={`${f.template.id}-${field.id}`}>
                  {field.label}
                  {field.required ? " *" : ""}
                </label>
                <select
                  id={`${f.template.id}-${field.id}`}
                  value={
                    (f.answers[field.id] || "").startsWith("na:")
                      ? "na"
                      : f.answers[field.id] || ""
                  }
                  onChange={(e) =>
                    answer(
                      f.template.id,
                      field.id,
                      e.target.value === "na" ? "na:" : e.target.value,
                    )
                  }
                >
                  <option value="">ยังไม่ตรวจ</option>
                  <option value="yes">ผ่าน / จัดให้มี</option>
                  <option value="no">ไม่ผ่าน</option>
                  <option value="na">ไม่เกี่ยวข้อง</option>
                </select>
                {(f.answers[field.id] || "").startsWith("na:") && (
                  <input
                    aria-label={`เหตุผล: ${field.label}`}
                    placeholder="ระบุเหตุผลที่ไม่เกี่ยวข้อง"
                    value={f.answers[field.id].slice(3)}
                    onChange={(e) =>
                      answer(f.template.id, field.id, "na:" + e.target.value)
                    }
                  />
                )}
              </div>
            ) : (
              <label key={field.id}>
                {field.label}
                {field.required ? " *" : ""}
                <textarea
                  value={f.answers[field.id] || ""}
                  maxLength={5000}
                  onChange={(e) =>
                    answer(f.template.id, field.id, e.target.value)
                  }
                />
              </label>
            ),
          )}
        </section>
      ))}
      <section className="wp-panel">
        <h3>03 · ผู้อนุมัติและเอกสารประกอบ</h3>
        <div className="wp-form-grid">
          {requiredRoles(data).map((role) => (
            <label key={role}>
              {ROLE_LABELS[role]}
              <select
                aria-label={ROLE_LABELS[role]}
                value={data.approvers[role] || ""}
                onChange={(e) =>
                  set("approvers", {
                    ...data.approvers,
                    [role]: e.target.value,
                  })
                }
              >
                <option value="">เลือกผู้อนุมัติ</option>
                {directory
                  .filter((m) => m.role === role && m.actor_key !== actor.key)
                  .map((m) => (
                    <option key={m.actor_key} value={m.actor_key}>
                      {m.display_name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <label>
          แนบ JSA หลักฐานอบรม ภาพหน้างาน หรือเอกสารประกอบ
          <input
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg"
            onChange={(e) => void attachments(e.target.files)}
          />
        </label>
        <p className="wp-muted">
          สูงสุด 8 ไฟล์ · PDF/PNG/JPG ไม่เกิน 350 KB ต่อไฟล์
        </p>
        {data.attachments.map((a) => (
          <div key={a.id} className="wp-inline">
            <span>{a.name}</span>
            <button
              type="button"
              className="wp-link"
              onClick={() =>
                set(
                  "attachments",
                  data.attachments.filter((x) => x.id !== a.id),
                )
              }
            >
              นำออก
            </button>
          </div>
        ))}
      </section>
      {error && (
        <div role="alert" className="wp-error">
          {error}
        </div>
      )}
      <div className="wp-form-footer">
        <p>บันทึกเป็นร่างก่อนตรวจทานและลงนามส่งคำขอ</p>
        <button className="wp-primary" disabled={busy || !data.forms.length}>
          {busy ? "กำลังบันทึก…" : "บันทึกร่างคำขอ"}
        </button>
      </div>
    </form>
  );
}
