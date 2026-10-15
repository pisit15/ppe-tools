import { createHash } from "node:crypto";
import { AccessError } from "@/lib/toolsSession";
import { assertReady, png, text } from "./validation";
import {
  requiredRoles,
  type Permit,
  type PermitActor,
  type PermitData,
  type PermitRole,
} from "./types";
// PostgreSQL jsonb reorders object keys. Canonicalize before hashing so the
// signed content can be verified after persistence and in an archived snapshot.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}
export const documentHash = (d: PermitData) =>
  createHash("sha256")
    .update(JSON.stringify(canonical({ ...d, signatures: [], events: [] })))
    .digest("hex");
export function event(a: PermitActor, action: string, note = "") {
  return {
    id: crypto.randomUUID(),
    actor: a.key,
    name: a.name,
    action,
    at: new Date().toISOString(),
    note,
  };
}
export function transition(
  p: Permit,
  a: PermitActor,
  action: string,
  b: Record<string, unknown>,
): Permit {
  const next: Permit = structuredClone(p);
  const d = next.data;
  const now = Date.now();
  const owner = p.created_by === a.key;
  const roles = requiredRoles(d);
  const assigned = roles.filter(
    (r) => d.approvers[r] === a.key && (a.admin || a.roles.includes(r)),
  );
  const expired = Date.parse(d.endsAt) <= now;
  const deny = (
    message = "ไม่มีสิทธิ์ดำเนินการ หรือสถานะงานเปลี่ยนแล้ว",
  ): never => {
    throw new AccessError(message, 409);
  };
  const sign = (stage: string, role: string) => {
    if (b.confirm !== true)
      throw new AccessError("กรุณายืนยันการลงนามด้วยตัวเอง", 400);
    if (d.signatures.some((s) => s.stage === stage && s.role === role))
      deny("บทบาทนี้ลงนามแล้ว");
    d.signatures.push({
      actor: a.key,
      name: a.name,
      stage,
      role,
      at: new Date().toISOString(),
      image: png(b.signature),
      hash: documentHash(d),
    });
  };
  let note =
    typeof b.note === "string" ? text(b.note, "บันทึก", 6000, false) : "";
  switch (action) {
    case "submit":
      if (!owner || p.status !== "draft") deny();
      assertReady(d);
      for (const r of roles)
        if (!d.approvers[r] || d.approvers[r] === a.key)
          throw new AccessError(
            "เลือกผู้อนุมัติทุกบทบาท โดยต้องไม่ใช่ผู้ยื่นคำขอ",
            400,
          );
      if (new Set(roles.map((r) => d.approvers[r])).size !== roles.length)
        throw new AccessError("ผู้อนุมัติแต่ละบทบาทต้องเป็นคนละบัญชี", 400);
      sign("request", "requester");
      next.status = "submitted";
      break;
    case "approve": {
      if (p.status !== "submitted" || expired)
        deny("อนุมัติได้เฉพาะคำขอที่รออนุมัติและยังไม่หมดอายุ");
      const role = roles.find(
        (r) => !d.signatures.some((s) => s.stage === "approve" && s.role === r),
      );
      if (!role || !assigned.includes(role) || owner)
        deny("ต้องเป็นผู้อนุมัติที่ได้รับมอบหมายตามลำดับ");
      sign("approve", role!);
      if (
        roles.every((r) =>
          d.signatures.some((s) => s.stage === "approve" && s.role === r),
        )
      )
        next.status = "approved";
      break;
    }
    case "return":
      if (p.status !== "submitted" || !assigned.length || !note)
        deny("ผู้อนุมัติต้องระบุเหตุผลส่งกลับ");
      next.status = "draft";
      d.signatures = d.signatures.map((s) =>
        s.stage.startsWith("superseded:")
          ? s
          : { ...s, stage: `superseded:${p.version}:${s.stage}` },
      );
      break;
    case "start":
      if (
        p.status !== "approved" ||
        !assigned.includes("area_owner") ||
        expired ||
        Date.parse(d.startsAt) > now ||
        !note
      )
        deny("เจ้าของพื้นที่ต้องตรวจหน้างานและเปิดงานภายในช่วงเวลาที่อนุญาต");
      sign("start", "area_owner");
      next.status = "active";
      break;
    case "suspend":
      if (
        p.status !== "active" ||
        (!owner && !assigned.length && !a.admin) ||
        !note
      )
        deny("ระบุเหตุผลพักงาน");
      next.status = "suspended";
      break;
    case "resume":
      if (
        p.status !== "suspended" ||
        !assigned.includes("area_owner") ||
        expired ||
        !note
      )
        deny("เจ้าของพื้นที่ต้องตรวจยืนยันก่อนกลับเข้าทำงาน");
      note = `ตรวจยืนยันกลับเข้าทำงาน: ${note}`;
      next.status = "active";
      break;
    case "inspect":
      if (
        !["active", "suspended"].includes(p.status) ||
        (!assigned.length && !a.admin) ||
        !note
      )
        deny("ผู้ตรวจต้องบันทึกผลตรวจ");
      if (b.unsafe === true) next.status = "suspended";
      note = `${b.unsafe === true ? "ไม่ปลอดภัย — พักงาน" : "บันทึกตรวจ"}: ${note}`;
      break;
    case "request_close":
      if (!owner || !["active", "suspended"].includes(p.status) || !note)
        deny("ผู้ยื่นต้องบันทึกผลส่งมอบงานก่อนขอปิด");
      sign("close", "requester");
      next.status = "closing";
      break;
    case "close": {
      if (p.status !== "closing") deny();
      const role = (["area_owner", "safety"] as PermitRole[]).find(
        (r) => !d.signatures.some((s) => s.stage === "close" && s.role === r),
      );
      if (!role || !assigned.includes(role) || !note)
        deny("ผู้ตรวจรับต้องลงนามตามลำดับและบันทึกผลตรวจ");
      sign("close", role!);
      if (
        ["area_owner", "safety"].every((r) =>
          d.signatures.some((s) => s.stage === "close" && s.role === r),
        )
      )
        next.status = "closed";
      break;
    }
    case "cancel":
      if (
        ["closed", "cancelled", "closing"].includes(p.status) ||
        (!owner && !a.admin && !assigned.length) ||
        !note
      )
        deny("ระบุเหตุผลยกเลิก");
      next.status = "cancelled";
      break;
    default:
      throw new AccessError("ไม่รองรับการดำเนินการนี้", 400);
  }
  const audit = event(a, action, note);
  if (action === "return") {
    const { events: previousEvents, ...document } = p.data;
    void previousEvents;
    d.events.push({ ...audit, document });
  } else d.events.push(audit);
  next.version++;
  next.updated_at = new Date().toISOString();
  return next;
}
