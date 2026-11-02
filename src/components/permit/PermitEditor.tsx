"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ROLE_LABELS,
  requiredRoles,
  type Permit,
  type PermitActor,
  type PermitData,
  type PermitTemplate,
} from "@/lib/permit/types";
import { localTime, permitApi, type DirectoryEntry } from "./api";
import PermitFormFields from "./PermitFormFields";

type LocationOption = {id: string; name: string; department: string; area_owner: string; safety: string; active: boolean};
const workTypes = [{code: "AHS-003", label: "งานทั่วไป"}, {code: "AHS-004", label: "งานบนที่สูง"}, {code: "AHS-005", label: "งานความร้อน / ประกายไฟ"}, {code: "AHS-006", label: "งานในที่อับอากาศ"}, {code: "AHS-013", label: "งานยกที่มีความเสี่ยงสูง"}, {code: "AHS-014", label: "งานขุดเจาะ"}, {code: "AHS-015", label: "งานรื้อถอน"}, {code: "AHS-016", label: "งานไฟฟ้าที่อันตรายสูง"}, {code: "AHS-029", label: "งานตัดต่อระบบท่อ"}];
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
    [error, setError] = useState(""),
    [locations, setLocations] = useState<LocationOption[]>([]),
    [locationNotice, setLocationNotice] = useState("");
  const options = Array.from(templates.filter(t => t.active).reduce((byCode, t) => {
    const previous = byCode.get(t.code);
    if (!previous || t.version > previous.version) byCode.set(t.code, t);
    return byCode;
  }, new Map<string, PermitTemplate>()).values());
  const suggestApprovers = useCallback((d: PermitData): PermitData => {
    const approvers = {...d.approvers};
    const used = new Set(Object.values(approvers).filter(Boolean));
    for (const role of requiredRoles(d)) {
      if (approvers[role]) continue;
      const candidates = [...new Set(directory.filter(m => m.role === role && m.actor_key !== actor.key).map(m => m.actor_key))];
      if (candidates.length === 1 && !used.has(candidates[0])) { approvers[role] = candidates[0]; used.add(candidates[0]); }
    }
    return Object.keys(approvers).length === Object.keys(d.approvers).length ? d : {...d, approvers};
  }, [directory, actor.key]);
  useEffect(() => { setData(suggestApprovers); }, [suggestApprovers]);
  useEffect(() => {
    let live = true;
    permitApi<{data: LocationOption[]}>("locations", company).then(r => { if (live) setLocations(r.data.filter(l => l.active)); }).catch(() => {if(live) setLocationNotice("ยังโหลดพื้นที่มาตรฐานไม่ได้ สามารถระบุพื้นที่และผู้อนุมัติด้วยตนเองได้");});
    return () => { live = false; };
  }, [company]);
  const set = (key: keyof PermitData, value: unknown) =>
    setData(d => suggestApprovers({ ...d, [key]: value, ...(key === "location" ? {locationId: undefined} : {}) }));
  function addTemplate(t: PermitTemplate) {
    const general = options.find(v => v.code === "AHS-003");
    if (company === "amt" && t.code !== "AHS-003" && !general) {setError("ยังไม่มีแม่แบบงานทั่วไปที่เปิดใช้ ติดต่อผู้ดูแล AMT ก่อนเลือกงานเสี่ยงสูง");return;}
    setError("");
    setData(d => {
      const forms = d.forms.filter(f => f.template.code !== t.code);
      const sharedSource = d.forms.find(f => f.template.config.layoutVersion === "amt-2026-11-v2");
      const sharedAnswers = t.config.layoutVersion === "amt-2026-11-v2" && sharedSource ? Object.fromEntries(["equipment", "hazards", "additional"].map(key => [key, sharedSource.answers[key] || ""])) : {};
      forms.push(d.forms.find(f => f.template.id === t.id) || {template:t,answers:sharedAnswers});
      if (company === "amt" && t.code !== "AHS-003" && general && !forms.some(f => f.template.code === "AHS-003")) forms.unshift({template:general,answers:general.config.layoutVersion === "amt-2026-11-v2" ? sharedAnswers : {}});
      return suggestApprovers({...d, forms});
    });
  }
  function chooseWork(code: string) {
    const t = options.find(t => t.code === code);
    if (!t) {setError("แม่แบบสำหรับงานนี้ยังไม่เปิดใช้ กรุณาติดต่อผู้ดูแล AMT เพื่อตรวจทานและเปิดใช้ก่อน");return;}
    addTemplate(t);
  }
  function toggle(t: PermitTemplate) {
    if (data.forms.some(f => f.template.id === t.id)) {
      if (company === "amt" && t.code === "AHS-003" && data.forms.some(f => f.template.code !== "AHS-003" && f.template.source_code)) {setError("งานเสี่ยงสูงต้องแนบงานทั่วไปในชุดงานเดียวกัน");return;}
      setData(d => suggestApprovers({...d, forms:d.forms.filter(f => f.template.id !== t.id)}));
    } else addTemplate(t);
  }
  function selectLocation(id: string) {
    const location = locations.find(l => l.id === id);
    setLocationNotice("");
    if (!location) {setData(d => ({...d,locationId:undefined}));return;}
    const assigned: string[] = [];
    const selected: PermitData["approvers"] = {};
    for (const role of ["area_owner", "safety"] as const) {
      const key = location[role];
      if (key && key !== actor.key && !assigned.includes(key) && directory.some(m => m.role === role && m.actor_key === key)) {selected[role] = key; assigned.push(key);}
    }
    if (!selected.area_owner || !selected.safety) setLocationNotice("พื้นที่นี้ยังมีผู้อนุมัติไม่ครบหรือผู้ขอเป็นผู้อนุมัติ โปรดตรวจสอบรายชื่อก่อนส่งคำขอ");
    setData(d => {
      const approvers = {...d.approvers};
      for (const role of ["area_owner", "safety"] as const) {if(selected[role]) approvers[role]=selected[role];else delete approvers[role];}
      return {...d, locationId:id,location:location.name,approvers};
    });
  }
  function answer(id: string, field: string, value: string) {
    const isShared = ["equipment", "hazards", "additional"].includes(field) && data.forms.some(f => f.template.id === id && f.template.config.layoutVersion === "amt-2026-11-v2");
    setData((d) => ({
      ...d,
      forms: d.forms.map(f => {
        if (f.template.id !== id && !(isShared && f.template.config.layoutVersion === "amt-2026-11-v2" && f.template.config.fields.some(x => x.id === field))) return f;
        const answers = {...f.answers, [field]: value};
        if (field.startsWith("hazard_") && value !== "yes") for (const key of Object.keys(answers)) if (key.startsWith(`control_${field.slice(7)}_`)) answers[key] = "";
        return {...f, answers};
      }),
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
  const missingRoles = requiredRoles(data).filter(role => !directory.some(m => m.role === role && m.actor_key !== actor.key));
  const selectedKeys = requiredRoles(data).map(r => data.approvers[r]).filter(Boolean);
  const duplicateApprover = selectedKeys.length !== new Set(selectedKeys).size;
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
          {locations.length > 0 && <label>พื้นที่มาตรฐาน<select aria-label="พื้นที่มาตรฐาน" value={data.locationId || ""} onChange={e => selectLocation(e.target.value)}><option value="">ระบุพื้นที่ด้วยตนเอง</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.department ? ` · ${l.department}` : ""}</option>)}</select></label>}
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
        {locationNotice && <p className="wp-notice" role="status">{locationNotice}</p>}
        <label>จำนวนผู้ปฏิบัติงาน<input type="number" min={1} max={500} value={data.workerCount ?? ""} onChange={e => set("workerCount", e.target.value ? Number(e.target.value) : undefined)} /></label>
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
        {company === "amt" && <div className="wp-work-selector" aria-label="เลือกลักษณะงาน">{workTypes.map(w => <button type="button" key={w.code} className={data.forms.some(f => f.template.code === w.code) ? "wp-primary" : "wp-secondary"} aria-pressed={data.forms.some(f => f.template.code === w.code)} onClick={() => chooseWork(w.code)}>{w.label}</button>)}<p className="wp-muted">เลือกได้หลายลักษณะงาน ระบบแนบงานทั่วไปให้อัตโนมัติ และใช้แม่แบบรุ่นล่าสุดที่เปิดใช้</p></div>}
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
          <PermitFormFields form={f} hideShared={f.template.config.layoutVersion === "amt-2026-11-v2" && data.forms.find(v => v.template.config.layoutVersion === "amt-2026-11-v2")?.template.id !== f.template.id} onAnswer={(field, value) => answer(f.template.id, field, value)} />
        </section>
      ))}
      <section className="wp-panel">
        <h3>03 · ผู้อนุมัติและเอกสารประกอบ</h3>
        {missingRoles.length > 0 && <p className="wp-notice" role="status">ยังไม่ได้กำหนดผู้อนุมัติ: {missingRoles.map(r => ROLE_LABELS[r]).join(" / ")} ติดต่อผู้ดูแลบริษัทเพื่อกำหนดผู้ลงนาม สามารถบันทึกร่างไว้ก่อนได้</p>}
        {duplicateApprover && <p className="wp-notice" role="status">ผู้อนุมัติแต่ละบทบาทต้องเป็นคนละบัญชี โปรดแก้รายชื่อก่อนลงนามส่งคำขอ</p>}
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
