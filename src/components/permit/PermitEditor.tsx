"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronRight, ClipboardList, FileCheck2, FileText, Paperclip, Save, ShieldCheck, Users, X } from "lucide-react";
import {
  ROLE_LABELS,
  requiredRoles,
  type Permit,
  type PermitActor,
  type PermitData,
  type PermitTemplate,
} from "@/lib/permit/types";
import { localTime, permitApi, type DirectoryEntry } from "./api";
import PermitFormFields, { isPermitFieldEntered, visiblePermitFields } from "./PermitFormFields";
import PermitLivePreview from "./PermitLivePreview";
import "@/app/permit/permit-editor.css";

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
  const [activePreviewForm,setActivePreviewForm]=useState<string|undefined>();
  const [previewLauncher, setPreviewLauncher] = useState<HTMLElement | null>(null);
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
      if (data.attachments.length + files.length > 8) throw new Error("แนบเอกสารได้สูงสุด 8 ไฟล์ โปรดนำไฟล์เดิมออกก่อนแนบเพิ่ม");
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
  const firstShared = data.forms.find(f => f.template.config.layoutVersion === "amt-2026-11-v2")?.template.id;
  const checklist = data.forms.flatMap(f => visiblePermitFields(f, f.template.config.layoutVersion === "amt-2026-11-v2" && f.template.id !== firstShared).filter(field => field.required).map(field => ({field, value:f.answers[field.id]})));
  const entered = checklist.filter(({field,value}) => isPermitFieldEntered(field,value)).length;
  const roles = requiredRoles(data);
  const jobValues = [data.title,data.location,data.contractorName,data.phone,data.detail,data.workers,data.fireImpact,data.startsAt,data.endsAt];
  if (firstShared) jobValues.push(data.workerCount ? String(data.workerCount) : "");
  const jobEntered = jobValues.filter(value => value?.trim()).length;
  const approverCount = roles.filter(role => data.approvers[role]).length;
  const steps = [
    {id:"types",label:"ลักษณะงาน",detail:data.forms.length ? `${data.forms.length} แบบฟอร์ม` : "เลือกแบบฟอร์ม",done:data.forms.length>0},
    {id:"job",label:"ข้อมูลงาน",detail:`${jobEntered}/${jobValues.length}`,done:jobEntered===jobValues.length},
    {id:"safety",label:"มาตรการ",detail:`${entered}/${checklist.length}`,done:checklist.length>0&&entered===checklist.length},
    {id:"people",label:"ผู้อนุมัติ",detail:`${approverCount}/${roles.length}`,done:roles.length>0&&approverCount===roles.length&&!duplicateApprover},
  ];
  function jump(id:string) {
    const section=document.getElementById(`wp-section-${id}`);
    section?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
    section?.focus({preventScroll:true});
  }
  return <div className="wp-editor-grid wp-editor-v3">
    <form onSubmit={save} className="wp-stack wp-editor-form" onFocusCapture={e=>{
      const id=(e.target as HTMLElement).id;
      const form=data.forms.find(f=>id.startsWith(`${f.template.id}-`));
      if(form)setActivePreviewForm(form.template.code);
    }}>
      <header className="wp-editor-heading">
        <button type="button" className="wp-editor-back" onClick={onCancel}><ArrowLeft size={15}/>กลับรายการ</button>
        <div className="wp-editor-heading-line"><div><p className="wp-editor-kicker">คำขออนุญาตทำงาน</p><h1>{copy?"สร้างฉบับใหม่จากใบเดิม":initial?"แก้ไขร่างคำขอ":"เตรียมงานให้พร้อม"}</h1></div><span className="wp-editor-draft"><span/>ฉบับร่าง</span></div>
        <p className="wp-editor-description">กรอกข้อมูลพร้อมดูเอกสารจริง ตรวจทานก่อนลงนามส่งคำขอ</p>
      </header>
      <nav className="wp-editor-steps" aria-label="ส่วนของคำขอ">{steps.map((step,i)=><button type="button" key={step.id} onClick={()=>jump(step.id)}><span className={`wp-editor-step-index${step.done?" is-entered":""}`}>{step.done?<Check size={13}/>:i+1}</span><span><strong>{step.label}</strong><small>{step.detail}</small></span></button>)}</nav>
      {copy&&<div className="wp-notice">ฉบับใหม่นี้อ้างอิงใบเดิม ผู้เกี่ยวข้องต้องลงนามใหม่ก่อนเริ่มช่วงเวลาถัดไป</div>}
      <section id="wp-section-types" tabIndex={-1} className="wp-panel wp-editor-section">
        <SectionTitle icon={<FileText size={19}/>} title="ลักษณะงานและแบบฟอร์ม" subtitle="เลือกได้หลายประเภทในคำขอเดียว"/>
        {!options.length&&<p className="wp-notice">ยังไม่มีแม่แบบที่เปิดใช้ ให้ผู้ดูแลตรวจทานและเปิดใช้ในเมนูแม่แบบ</p>}
        <div className="wp-task-choices" aria-label="เลือกลักษณะงาน">{options.map(t=>{
          const selected=data.forms.some(f=>f.template.id===t.id);
          const label=company==="amt"?workTypes.find(w=>w.code===t.code)?.label||t.name:t.name;
          return <button type="button" key={t.id} className={`wp-task-choice${selected?" is-selected":""}`} aria-label={label} aria-pressed={selected} onClick={()=>toggle(t)}><span className="wp-task-choice-check">{selected?<Check size={13}/>:<span aria-hidden="true">+</span>}</span><span className="wp-task-choice-text"><strong>{label}</strong><small><span>{t.code}</span><span>Rev.{t.revision} · V{t.version}</span></small></span></button>;
        })}</div>
        {company==="amt"&&<p className="wp-editor-help"><FileCheck2 size={14}/>งานเสี่ยงสูงจะแนบ General Work Permit ให้อัตโนมัติ</p>}
        {company==="amt"&&workTypes.some(w=>!options.some(t=>t.code===w.code))&&<details className="wp-unavailable-types"><summary>ประเภทงานที่ยังไม่เปิดใช้</summary><p>{workTypes.filter(w=>!options.some(t=>t.code===w.code)).map(w=>w.label).join(" · ")}</p><p>ให้ผู้ดูแลบริษัทตรวจทานและเปิดใช้แม่แบบก่อนเลือกงานประเภทนี้</p></details>}
      </section>
      <section id="wp-section-job" tabIndex={-1} className="wp-panel wp-editor-section">
        <SectionTitle icon={<ClipboardList size={19}/>} title="ข้อมูลการทำงาน" subtitle="ข้อมูลส่วนนี้จะใช้ร่วมกันในทุกแบบฟอร์ม" count={`${jobEntered}/${jobValues.length}`}/>
        <div className="wp-form-grid">
          {locations.length>0&&<label className="wp-editor-full-width">พื้นที่มาตรฐาน<select aria-label="พื้นที่มาตรฐาน" value={data.locationId||""} onChange={e=>selectLocation(e.target.value)}><option value="">ระบุพื้นที่ด้วยตนเอง</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}{l.department?` · ${l.department}`:""}</option>)}</select><small className="wp-field-hint">เลือกพื้นที่เพื่อเติมเจ้าของพื้นที่และผู้ตรวจความปลอดภัย</small></label>}
          {([["title","ชื่องาน"],["location","พื้นที่ปฏิบัติงาน"],["contractorName","บริษัท / หน่วยงานที่ปฏิบัติงาน"],["phone","เบอร์ติดต่อ"]] as const).map(([k,label])=><label key={k} className={k==="title"?"wp-editor-full-width":""}>{label}<input id={`wp-field-${k}`} aria-label={label} required maxLength={k==="phone"?80:200} type={k==="phone"?"tel":"text"} value={data[k]} disabled={k==="contractorName"&&actor.contractor} placeholder={k==="title"?"เช่น ตรวจซ่อมหลังคาอาคารผลิต 1":undefined} onChange={e=>set(k,e.target.value)}/></label>)}
          <label>เริ่มงาน<input id="wp-field-startsAt" aria-label="เริ่มงาน" required type="datetime-local" value={localTime(data.startsAt)} onChange={e=>{if(e.target.value)set("startsAt",new Date(e.target.value).toISOString());}}/></label>
          <label>สิ้นสุดงาน<input id="wp-field-endsAt" aria-label="สิ้นสุดงาน" required type="datetime-local" value={localTime(data.endsAt)} onChange={e=>{if(e.target.value)set("endsAt",new Date(e.target.value).toISOString());}}/></label>
          <label>จำนวนผู้ปฏิบัติงาน<input id="wp-field-workerCount" aria-label="จำนวนผู้ปฏิบัติงาน" type="number" min={1} max={500} inputMode="numeric" placeholder="คน" value={data.workerCount??""} onChange={e=>set("workerCount",e.target.value?Number(e.target.value):undefined)}/></label>
        </div>
        {locationNotice&&<p className="wp-notice" role="status">{locationNotice}</p>}
        <p className="wp-field-hint wp-editor-time-hint">ช่องวันเวลาใช้เขตเวลาของอุปกรณ์ · เอกสารแสดงเวลาไทย</p>
        {([["detail","รายละเอียด / ขอบเขตงาน"],["workers","รายชื่อผู้ปฏิบัติงานและหน้าที่"],["fireImpact","ผลกระทบต่อระบบดับเพลิงและการประสานงาน (หากไม่มีให้ระบุ)"]] as const).map(([k,label])=><label key={k} className="wp-editor-long-field">{label}<textarea id={`wp-field-${k}`} aria-label={label} required maxLength={5000} rows={k==="detail"?4:3} value={data[k]} placeholder={k==="detail"?"ระบุสิ่งที่จะทำ วิธีทำ และขอบเขตพื้นที่":k==="workers"?"ชื่อ–สกุล / หน้าที่ แยกบรรทัดละ 1 คน":"ระบุผลกระทบและการประสานงาน หรือระบุว่าไม่มี"} onChange={e=>set(k,e.target.value)}/></label>)}
        <label className="wp-project-option"><input type="checkbox" checked={data.project} onChange={e=>set("project",e.target.checked)}/><span><strong>เป็นงานโครงการ</strong><small>เพิ่มผู้จัดการโครงการในลำดับการอนุมัติ</small></span></label>
      </section>
      <section id="wp-section-safety" tabIndex={-1} className="wp-editor-safety-section">
        <div className="wp-editor-safety-title"><div><ShieldCheck size={19}/><h2>ประเมินอันตรายและมาตรการ</h2></div><span>{entered}/{checklist.length} ระบุแล้ว</span></div>
        <p className="wp-field-hint">จำนวนที่ระบุแสดงความคืบหน้าการกรอก ผู้เกี่ยวข้องยังต้องตรวจทานและยืนยันก่อนเริ่มงาน</p>
        {!data.forms.length&&<div className="wp-editor-select-prompt"><ShieldCheck size={26}/><p>เลือกประเภทงานเพื่อแสดงรายการตรวจตามแม่แบบ</p><button type="button" className="wp-link" onClick={()=>jump("types")}>เลือกประเภทงาน<ChevronRight size={14}/></button></div>}
        {data.forms.map(f=><section key={f.template.id} className="wp-panel wp-editor-template-section">
          <header className="wp-editor-template-heading"><span>{f.template.code}</span><div><h3>{f.template.name}</h3><p>Rev.{f.template.revision} · เวอร์ชัน {f.template.version}</p></div></header>
          {!options.some(t=>t.id===f.template.id)&&<p className="wp-error">แม่แบบนี้เลิกใช้แล้ว เลือกเวอร์ชันที่เปิดใช้อยู่ก่อนบันทึก</p>}
          <PermitFormFields form={f} hideShared={f.template.config.layoutVersion==="amt-2026-11-v2"&&firstShared!==f.template.id} onAnswer={(field,value)=>answer(f.template.id,field,value)}/>
        </section>)}
      </section>
      <section id="wp-section-people" tabIndex={-1} className="wp-panel wp-editor-section">
        <SectionTitle icon={<Users size={19}/>} title="ผู้อนุมัติและเอกสารประกอบ" subtitle="ตรวจสอบผู้รับผิดชอบให้ตรงกับพื้นที่และลักษณะงาน"/>
        {missingRoles.length>0&&<p className="wp-notice" role="status">ยังไม่ได้กำหนดผู้อนุมัติ: {missingRoles.map(r=>ROLE_LABELS[r]).join(" / ")} ติดต่อผู้ดูแลบริษัทเพื่อกำหนดผู้ลงนาม สามารถบันทึกร่างไว้ก่อนได้</p>}
        {duplicateApprover&&<p className="wp-notice" role="status">ผู้อนุมัติแต่ละบทบาทต้องเป็นคนละบัญชี โปรดแก้รายชื่อก่อนลงนามส่งคำขอ</p>}
        <div className="wp-form-grid">{roles.map(role=><label key={role}>{ROLE_LABELS[role]}<select aria-label={ROLE_LABELS[role]} value={data.approvers[role]||""} onChange={e=>set("approvers",{...data.approvers,[role]:e.target.value})}><option value="">เลือกผู้อนุมัติ</option>{directory.filter(m=>m.role===role&&m.actor_key!==actor.key).map(m=><option key={m.actor_key} value={m.actor_key}>{m.display_name}</option>)}</select></label>)}</div>
        <div className="wp-editor-upload"><Paperclip size={20}/><label>แนบ JSA หลักฐานอบรม ภาพหน้างาน หรือเอกสารประกอบ<input type="file" multiple accept="application/pdf,image/png,image/jpeg" onChange={e=>void attachments(e.target.files)}/><small>สูงสุด 8 ไฟล์ · PDF/PNG/JPG ไม่เกิน 350 KB ต่อไฟล์</small></label></div>
        {data.attachments.length>0&&<ul className="wp-editor-attachments">{data.attachments.map(a=><li key={a.id}><FileText size={16}/><span>{a.name}</span><button type="button" className="wp-link" aria-label={`นำออก: ${a.name}`} onClick={()=>set("attachments",data.attachments.filter(x=>x.id!==a.id))}><X size={15}/>นำออก</button></li>)}</ul>}
      </section>
      {error&&<div role="alert" className="wp-error">{error}</div>}
      <footer className="wp-form-footer wp-editor-savebar"><div className="wp-editor-save-hint"><strong>บันทึกไว้แล้วกลับมาตรวจทานได้</strong><p>ลงนามส่งคำขอในขั้นตอนถัดไป</p></div><div className="wp-editor-preview-launcher" ref={setPreviewLauncher}/><button className="wp-primary" disabled={busy||!data.forms.length}><Save size={17}/>{busy?"กำลังบันทึก…":"บันทึกร่างคำขอ"}</button></footer>
    </form>
    <PermitLivePreview data={data} company={company} activeFormCode={activePreviewForm} launcherHost={previewLauncher}/>
  </div>;
}

function SectionTitle({icon,title,subtitle,count}:{icon:React.ReactNode;title:string;subtitle:string;count?:string}) {
  return <div className="wp-editor-section-title"><span className="wp-editor-section-icon">{icon}</span><div><h2>{title}</h2><p>{subtitle}</p></div>{count&&<span className="wp-editor-section-count">{count}</span>}</div>;
}
