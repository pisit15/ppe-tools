import { AccessError } from "@/lib/toolsSession";
import type { PermitData, PermitTemplate } from "./types";
import { AMT_V2_SEEDS } from "./amt-forms";
const stable = (v: unknown): string => JSON.stringify(v, (_, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value);
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function text(v: unknown, label: string, max = 2000, required = true) {
  if (
    typeof v !== "string" ||
    v.length > max ||
    v.includes("\0") ||
    (required && !v.trim())
  )
    throw new AccessError(`กรุณาระบุ${label}ให้ถูกต้อง`, 400);
  return v.trim();
}
export async function jsonBody(
  r: Request,
  max = 4_000_000,
): Promise<Record<string, unknown>> {
  if (Number(r.headers.get("content-length") || 0) > max)
    throw new AccessError("ข้อมูลมีขนาดใหญ่เกินไป", 413);
  const raw = await r.text();
  if (Buffer.byteLength(raw) > max)
    throw new AccessError("ข้อมูลมีขนาดใหญ่เกินไป", 413);
  try {
    const b = JSON.parse(raw);
    if (!b || Array.isArray(b) || typeof b !== "object") throw 0;
    return b;
  } catch {
    throw new AccessError("ข้อมูลไม่ถูกต้อง", 400);
  }
}
export function png(v: unknown): string {
  if (
    typeof v !== "string" ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(v) ||
    v.length > 150000
  )
    throw new AccessError("ลายเซ็นต้องเป็นภาพ PNG ขนาดไม่เกิน 100 KB", 400);
  const b = Buffer.from(v.slice(22), "base64");
  if (
    b.length < 33 ||
    b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    b.readUInt32BE(16) > 2000 ||
    b.readUInt32BE(20) > 1000 ||
    !b.readUInt32BE(16) ||
    !b.readUInt32BE(20)
  )
    throw new AccessError("ภาพลายเซ็นไม่ถูกต้อง", 400);
  return v;
}
export function validateTemplate(v: unknown): PermitTemplate["config"] {
  const c = v as PermitTemplate["config"];
  if (
    !c ||
    !Array.isArray(c.fields) ||
    c.fields.length < 1 ||
    c.fields.length > 100 ||
    !Array.isArray(c.roles) ||
    !c.roles.includes("area_owner") ||
    !c.roles.includes("safety") ||
    c.roles.some(
      (r) => !["area_owner", "safety", "project_manager"].includes(r),
    )
  )
    throw new AccessError(
      "แม่แบบต้องมีรายการตรวจและผู้อนุมัติพื้นที่/ความปลอดภัย",
      400,
    );
  const ids = new Set();
  const config: PermitTemplate["config"] = {
    roles: [...new Set(c.roles)],
    fields: c.fields.map((f) => {
      if (
        !f ||
        !/^\w{1,60}$/.test(f.id) ||
        ids.has(f.id) ||
        !["text", "textarea", "check", "choice"].includes(f.kind) ||
        typeof f.required !== "boolean"
      )
        throw new AccessError("ช่องข้อมูลแม่แบบไม่ถูกต้องหรือซ้ำ", 400);
      ids.add(f.id);
      if(f.kind==="choice" && (!Array.isArray(f.options)||f.options.length<2||f.options.length>20||new Set(f.options.map(o=>o.value)).size!==f.options.length))throw new AccessError("รายการตัวเลือกไม่ถูกต้อง",400);
      if(f.print) {
        const pt=(x:number,y:number)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=827&&y>=0&&y<=1170;
        if(!pt(f.print.x,f.print.y)||(f.print.page!==undefined&&(!Number.isInteger(f.print.page)||f.print.page<0||f.print.page>1))||f.print.marks?.some(m=>!pt(m.x,m.y)||!['yes','no','na'].includes(m.value))||(f.print.width!==undefined&&(!Number.isFinite(f.print.width)||f.print.width<1||f.print.width>827))||(f.print.height!==undefined&&(!Number.isFinite(f.print.height)||f.print.height<1||f.print.height>1170)))throw new AccessError("ตำแหน่งพิมพ์ไม่ถูกต้อง",400);
      }
      return {
        id: f.id,
        label: text(f.label, "ชื่อช่องข้อมูล", 500),
        kind: f.kind,
        required: f.required,
        ...(f.options ? {options:f.options.map(o=>({value:text(o.value,"ค่าตัวเลือก",60),label:text(o.label,"ชื่อตัวเลือก",200)}))}:{}),
        ...(f.section ? {section:text(f.section,"หัวข้อ",200)}:{}),
        ...(f.print ? {print:structuredClone(f.print)}:{}),
      };
    }),
  };
  if(c.layoutVersion) {
    const reviewed=AMT_V2_SEEDS.find(t=>t.config.sourceSha256===c.sourceSha256&&stable(t.config.fields)===stable(config.fields));
    if(c.layoutVersion!=="amt-2026-11-v2"||!reviewed)throw new AccessError("ผังพิมพ์ไม่ตรงชุดแม่แบบที่ตรวจทาน กรุณาใช้ชุดแม่แบบรายช่อง AMT",400);
    config.layoutVersion=c.layoutVersion;config.sourceSha256=c.sourceSha256;
  } else if(config.fields.some(f=>f.print))throw new AccessError("ผังพิมพ์ต้องผูกกับชุดแม่แบบที่ตรวจทาน",400);
  return config;
}
export function validateData(
  b: unknown,
  templates: PermitTemplate[],
): PermitData {
  const d = b as PermitData;
  if (!d || !Array.isArray(d.forms) || d.forms.length < 1 || d.forms.length > 9)
    throw new AccessError("เลือกแบบฟอร์ม 1–9 ฉบับ", 400);
  const startsAt = text(d.startsAt, "เวลาเริ่ม", 40),
    endsAt = text(d.endsAt, "เวลาสิ้นสุด", 40);
  if (
    !Number.isFinite(Date.parse(startsAt)) ||
    !Number.isFinite(Date.parse(endsAt)) ||
    Date.parse(endsAt) <= Date.parse(startsAt)
  )
    throw new AccessError("เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม", 400);
  const ids = new Set();
  const forms = d.forms.map((f) => {
    const t = templates.find((t) => t.id === f.template?.id && t.active);
    if (!t || ids.has(t.code))
      throw new AccessError("แม่แบบยังไม่เปิดใช้หรือเลือกประเภทงานซ้ำ", 400);
    ids.add(t.code);
    const answers: Record<string, string> = {};
    for (const field of t.config.fields) {
      const value = f.answers?.[field.id] ?? "";
      answers[field.id] = text(value, field.label, 5000, false);
      if (
        field.kind === "check" &&
        value &&
        !["yes", "no"].includes(value) &&
        !value.startsWith("na:")
      )
        throw new AccessError("คำตอบรายการตรวจไม่ถูกต้อง", 400);
      if(field.kind==='choice'&&value&&!field.options?.some(o=>o.value===value))throw new AccessError("คำตอบไม่อยู่ในรายการตัวเลือก",400);
    }
    if(t.config.layoutVersion==='amt-2026-11-v2')for(const key of Object.keys(answers))if(key.startsWith('control_')) {
      const hazard=t.config.fields.find(f=>f.id.startsWith('hazard_')&&key.startsWith(`control_${f.id.slice(7)}_`));
      if(hazard&&answers[hazard.id]==='no')answers[key]='';
    }
    return { template: t, answers };
  });
  if (!ids.has("AHS-003") && forms.some((f) => f.template.source_code))
    throw new AccessError(
      "แบบ AMITA ต้องแนบ General Work Permit ในชุดงาน",
      400,
    );
  const approvers: PermitData["approvers"] = {};
  for (const role of ["area_owner", "safety", "project_manager"] as const)
    if (d.approvers?.[role])
      approvers[role] = text(d.approvers[role], "ผู้อนุมัติ", 150);
  const attachments: PermitData["attachments"] = [];
  if (d.attachments !== undefined) {
    if (!Array.isArray(d.attachments) || d.attachments.length > 8)
      throw new AccessError("แนบไฟล์ได้ไม่เกิน 8 ไฟล์", 400);
    for (const a of d.attachments) {
      const name = text(a.name, "ชื่อไฟล์", 150);
      if (
        !["application/pdf", "image/png", "image/jpeg"].includes(a.type) ||
        typeof a.data !== "string" ||
        a.data.length > 500000 ||
        !new RegExp(`^data:${a.type};base64,[A-Za-z0-9+/]+=*$`).test(a.data)
      )
        throw new AccessError(
          "แนบ PDF/PNG/JPG ขนาดไม่เกิน 350 KB ต่อไฟล์",
          400,
        );
      const bytes = Buffer.from(a.data.split(",")[1], "base64");
      if (
        (a.type === "application/pdf" &&
          bytes.subarray(0, 5).toString() !== "%PDF-") ||
        (a.type === "image/png" &&
          bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") ||
        (a.type === "image/jpeg" &&
          bytes.subarray(0, 3).toString("hex") !== "ffd8ff")
      )
        throw new AccessError("เนื้อหาไฟล์ไม่ตรงชนิดที่ระบุ", 400);
      attachments.push({
        id: crypto.randomUUID(),
        name,
        type: a.type,
        data: a.data,
      });
    }
  }
  return {
    title: text(d.title, "ชื่องาน", 200),
    location: text(d.location, "พื้นที่", 300),
    detail: text(d.detail, "รายละเอียด", 5000),
    contractorName: text(d.contractorName, "บริษัทผู้ปฏิบัติงาน", 200),
    phone: text(d.phone, "เบอร์ติดต่อ", 80),
    workers: text(d.workers, "รายชื่อผู้ปฏิบัติงาน", 5000),
    ...(d.workerCount!==undefined ? {workerCount:(()=>{if(!Number.isInteger(d.workerCount)||d.workerCount!<1||d.workerCount!>500)throw new AccessError("จำนวนผู้ปฏิบัติงานต้องเป็น 1–500 คน",400);return d.workerCount;})()}:{}),
    ...(d.locationId ? {locationId:uuid.test(d.locationId)?d.locationId:(()=>{throw new AccessError("พื้นที่มาตรฐานไม่ถูกต้อง",400);})()}:{}),
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    fireImpact: text(d.fireImpact, "ผลกระทบระบบดับเพลิง", 1500),
    project: d.project === true,
    forms,
    approvers,
    attachments,
    signatures: [],
    events: [],
    ...(d.sourcePermitId && uuid.test(d.sourcePermitId)
      ? { sourcePermitId: d.sourcePermitId }
      : {}),
  };
}
export function assertReady(d: PermitData) {
  if (Date.parse(d.endsAt) <= Date.now())
    throw new AccessError("ช่วงเวลาที่ขออนุญาตหมดอายุแล้ว", 400);
  if(d.forms.some(f=>f.template.config.layoutVersion==='amt-2026-11-v2')&&!d.workerCount)throw new AccessError("ระบุจำนวนผู้ปฏิบัติงานก่อนส่งคำขอ",400);
  for (const f of d.forms)
    for (const field of f.template.config.fields) {
      const a = f.answers[field.id] || "";
      if(f.template.config.layoutVersion==='amt-2026-11-v2'&&field.id.startsWith('control_')) {
        const hazard=f.template.config.fields.find(h=>h.id.startsWith('hazard_')&&field.id.startsWith(`control_${h.id.slice(7)}_`));
        if(hazard&&f.answers[hazard.id]==='no')continue;
      }
      if (
        (field.required && !a.trim()) ||
        (field.kind === "check" &&
          (a === "no" || (a.startsWith("na:") && a.slice(3).trim().length < 3)))
      )
        throw new AccessError(
          `ตรวจสอบ ${f.template.code}: ${field.label} (ไม่ผ่าน หรือยังไม่ระบุเหตุผลที่ไม่เกี่ยวข้อง)`,
          400,
        );
    }
  for(const f of d.forms.filter(f=>f.template.config.layoutVersion==='amt-2026-11-v2')) {
    if(f.template.source_code==='004') {
      if(!['equipment_mewp','equipment_scaffold','equipment_ladder','equipment_other'].some(k=>f.answers[k]==='yes'))throw new AccessError("เลือกวิธีเข้าถึงพื้นที่ทำงานบนที่สูงอย่างน้อยหนึ่งวิธี",400);
      if(f.answers.check_3==='yes'&&f.answers.ppe_harness!=='yes')throw new AccessError("ผลตรวจชุดกันตกไม่ตรงกับ PPE ที่เลือก กรุณาทบทวน",400);
      for(const [equipment,check] of [['equipment_ladder','check_1'],['equipment_scaffold','check_2']])if(f.answers[equipment]==='yes'&&f.answers[check]!=='yes')throw new AccessError("อุปกรณ์ที่เลือกต้องมีผลตรวจผ่านก่อนส่งคำขอ",400);
    }
    for(const [id,answer] of Object.entries(f.answers)) {
      if(answer!=='yes')continue;
      const other=f.template.config.fields.find(x=>x.id===`${id}_text`);
      if(other&&!f.answers[other.id]?.trim())throw new AccessError(`ระบุ ${other.label}`,400);
      if(id.startsWith('hazard_')) {
        const prefix=`control_${id.slice(7)}_`;
        if(!Object.entries(f.answers).some(([key,v])=>key.startsWith(prefix)&&!key.endsWith('_text')&&v==='yes'))throw new AccessError(`เลือกมาตรการควบคุมสำหรับ ${f.template.config.fields.find(x=>x.id===id)?.label}`,400);
      }
    }
  }
  if (
    d.forms.some((f) => f.template.source_code === "006") &&
    !d.attachments.length
  )
    throw new AccessError("แนบหลักฐานสำหรับงานที่อับอากาศก่อนส่งคำขอ", 400);
}
