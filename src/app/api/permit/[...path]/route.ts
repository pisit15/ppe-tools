import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseServer } from "@/lib/supabase";
import {
  AccessError,
  apiError,
  assertSameOrigin,
  TOOLS_COOKIE,
  TOOLS_COOKIE_OPTIONS,
} from "@/lib/toolsSession";
import {
  PERMIT_COOKIE,
  PERMIT_COOKIE_OPTIONS,
  issuePermitSession,
  permitActor,
  permitCompany,
  permitAdmin,
  canReadPermit,
} from "@/lib/permit/session";
import {
  jsonBody,
  text,
  uuid,
  validateData,
  validateTemplate,
} from "@/lib/permit/validation";
import { event, transition } from "@/lib/permit/workflow";
import { PERMIT_SEEDS } from "@/lib/permit/catalog";
import {
  requiredRoles,
  type Permit,
  type PermitRole,
  type PermitTemplate,
} from "@/lib/permit/types";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const response = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const safeContractor = (r: Record<string, unknown>) => ({
  id: r.id,
  username: r.username,
  display_name: r.display_name,
  contractor_name: r.contractor_name,
  starts_at: r.starts_at,
  expires_at: r.expires_at,
  active: r.active,
});
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, context: Context) {
  try {
    const parts = (await context.params).path;
    const resource = parts[0];
    const method = req.method;
    const db = getSupabaseServer();
    const methods: Record<string, string[]> = {
      session: ["GET", "POST", "DELETE"],
      companies: ["GET"],
      directory: ["GET"],
      members: ["GET", "POST", "DELETE"],
      contractors: ["GET", "POST", "PATCH"],
      templates: ["GET", "POST", "PATCH"],
      sources: ["GET"],
      permits: ["GET", "POST", "PUT"],
    };
    if (!methods[resource]?.includes(method) || parts.length > 2)
      throw new AccessError("ไม่รองรับคำขอนี้", 405);
    if (resource === "session" && method === "DELETE") {
      assertSameOrigin(req);
      const r = response({ ok: true });
      r.cookies.set(PERMIT_COOKIE, "", { ...PERMIT_COOKIE_OPTIONS, maxAge: 0 });
      return r;
    }
    if (resource === "session" && method === "POST") {
      assertSameOrigin(req);
      const b = await jsonBody(req, 4000);
      const username = text(b.username, "ชื่อผู้ใช้", 60).toLowerCase();
      const password = text(b.password, "รหัสผ่าน", 128);
      if (!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username))
        throw new AccessError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", 401);
      const limit = await db.rpc("wp_login_attempt", {
        p_key: createHash("sha256").update(username).digest("hex"),
      });
      if (limit.error) throw limit.error;
      if (limit.data !== true)
        throw new AccessError("ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 15 นาที", 429);
      const { data: r, error } = await db
        .from("wp_contractors")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      // Always perform bcrypt to reduce account enumeration timing differences.
      const valid = await bcrypt.compare(
        password,
        r?.password_hash ||
          "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5wN5c6YcwbAAUe2lsYKB4P8rO2M6k5q",
      );
      if (
        !r ||
        !valid ||
        !r.active ||
        Date.parse(r.starts_at) > Date.now() ||
        Date.parse(r.expires_at) <= Date.now()
      )
        throw new AccessError(
          "ชื่อผู้ใช้ รหัสผ่าน หรือช่วงเวลาใช้งานไม่ถูกต้อง",
          401,
        );
      const result = response({ ok: true });
      result.cookies.set(
        PERMIT_COOKIE,
        issuePermitSession(r),
        PERMIT_COOKIE_OPTIONS,
      );
      result.cookies.set(TOOLS_COOKIE, "", {
        ...TOOLS_COOKIE_OPTIONS,
        maxAge: 0,
      });
      return result;
    }
    const actor = await permitActor(req);
    if (resource === "session") return response({ actor });
    if (resource === "companies" && method === "GET") {
      permitAdmin(actor);
      const { data, error } = await db
        .from("company_settings")
        .select("company_id,company_name")
        .order("company_name");
      if (error) throw error;
      return response({ data });
    }
    const company = permitCompany(
      actor,
      req.nextUrl.searchParams.get("company_id") || actor.companyId,
    );
    if (resource === "directory" && method === "GET") {
      const { data, error } = await db
        .from("wp_members")
        .select("actor_key,display_name,role")
        .eq("company_id", company);
      if (error) throw error;
      return response({ data });
    }
    if (resource === "members") {
      permitAdmin(actor);
      if (method === "GET") {
        const results = await Promise.all(
          ["company_users", "tools_users", "admin_accounts"].map(
            async (table) => {
              let q = db
                .from(table)
                .select("id,username,display_name,is_active")
                .eq("is_active", true);
              if (table !== "admin_accounts") q = q.eq("company_id", company);
              const { data, error } = await q;
              if (error) {
                // Some legacy company tables do not have display_name.
                let retry = db
                  .from(table)
                  .select("id,username,is_active")
                  .eq("is_active", true);
                if (table !== "admin_accounts")
                  retry = retry.eq("company_id", company);
                const r = await retry;
                if (r.error) throw r.error;
                return (r.data || []).map((r) => ({
                  key: `${table}:${r.id}`,
                  name: r.username,
                }));
              }
              return (data || []).map((r) => ({
                key: `${table}:${r.id}`,
                name: r.display_name || r.username,
              }));
            },
          ),
        );
        return response({ data: results.flat() });
      }
      const b = await jsonBody(req, 4000);
      const key = text(b.actor_key, "บัญชี", 150);
      const [table, id] = key.split(":");
      if (
        !["company_users", "tools_users", "admin_accounts"].includes(table) ||
        !uuid.test(id)
      )
        throw new AccessError("บัญชีไม่ถูกต้อง", 400);
      const role = text(b.role, "บทบาท", 40) as PermitRole;
      if (!["area_owner", "safety", "project_manager"].includes(role))
        throw new AccessError("บทบาทไม่ถูกต้อง", 400);
      if (method === "DELETE") {
        const r = await db
          .from("wp_members")
          .delete()
          .eq("company_id", company)
          .eq("actor_key", key)
          .eq("role", role);
        if (r.error) throw r.error;
        return response({ ok: true });
      }
      const r = await db
        .from(table)
        .select("*")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();
      if (r.error) throw r.error;
      if (
        !r.data ||
        (table !== "admin_accounts" && r.data.company_id !== company)
      )
        throw new AccessError("บัญชีไม่อยู่ในบริษัทนี้", 400);
      const result = await db
        .from("wp_members")
        .insert({
          company_id: company,
          actor_key: key,
          display_name: r.data.display_name || r.data.username,
          role,
        });
      if (result.error) {
        if (result.error.code === "23505")
          throw new AccessError("บัญชีนี้มีบทบาทดังกล่าวแล้ว", 409);
        throw result.error;
      }
      return response({ ok: true }, 201);
    }
    if (resource === "contractors") {
      permitAdmin(actor);
      if (method === "GET") {
        const { data, error } = await db
          .from("wp_contractors")
          .select("*")
          .eq("company_id", company)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return response({ data: (data || []).map(safeContractor) });
      }
      const b = await jsonBody(req, 6000);
      if (method === "PATCH") {
        if (!uuid.test(String(b.id)) || typeof b.active !== "boolean")
          throw new AccessError("ข้อมูลบัญชีไม่ถูกต้อง", 400);
        const { data, error } = await db
          .from("wp_contractors")
          .update({ active: b.active })
          .eq("id", b.id)
          .eq("company_id", company)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new AccessError("ไม่พบบัญชี", 404);
        return response({ data: safeContractor(data) });
      }
      const username = text(b.username, "ชื่อผู้ใช้", 60).toLowerCase();
      if (!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username))
        throw new AccessError(
          "ชื่อผู้ใช้ใช้ a-z, 0-9, จุด ขีด หรือ _ ความยาว 3–60 ตัว",
          400,
        );
      const password = text(b.password, "รหัสผ่าน", 72);
      if (password.length < 12 || Buffer.byteLength(password) > 72)
        throw new AccessError(
          "รหัสผ่านต้องยาวอย่างน้อย 12 ตัว และไม่เกิน 72 ไบต์",
          400,
        );
      const start = Date.parse(String(b.starts_at)),
        end = Date.parse(String(b.expires_at));
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        end <= Date.now()
      )
        throw new AccessError("ช่วงเวลาใช้งานไม่ถูกต้อง", 400);
      const { data, error } = await db
        .from("wp_contractors")
        .insert({
          company_id: company,
          username,
          password_hash: await bcrypt.hash(password, 12),
          display_name: text(b.display_name, "ชื่อผู้ใช้จริง", 150),
          contractor_name: text(b.contractor_name, "บริษัทผู้รับเหมา", 200),
          starts_at: new Date(start).toISOString(),
          expires_at: new Date(end).toISOString(),
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505")
          throw new AccessError("ชื่อผู้ใช้นี้ถูกใช้แล้ว", 409);
        throw error;
      }
      return response({ data: safeContractor(data) }, 201);
    }
    if (resource === "templates") {
      if (method === "GET") {
        const { data, error } = await db
          .from("wp_templates")
          .select("*")
          .eq("company_id", company)
          .order("code")
          .order("version", { ascending: false });
        if (error) throw error;
        return response({
          data: actor.admin ? data : (data || []).filter((t) => t.active),
        });
      }
      permitAdmin(actor);
      const b = await jsonBody(req, 120000);
      if (b.action === "import") {
        if (company !== "amt")
          throw new AccessError(
            "ต้นฉบับ AMITA นำเข้าได้ในบริษัท AMT จากนั้นคัดลอกไปปรับใช้กับบริษัทอื่น",
            400,
          );
        // Independent inserts make retries safe when imports were partially completed.
        for (const seed of PERMIT_SEEDS) {
          const r = await db.from("wp_templates").insert(seed);
          if (r.error && r.error.code !== "23505") throw r.error;
        }
        return response({ ok: true });
      }
      if (method === "PATCH") {
        if (
          !uuid.test(String(b.id)) ||
          typeof b.active !== "boolean" ||
          b.confirm !== true
        )
          throw new AccessError("ยืนยันการตรวจทานแม่แบบก่อนเปลี่ยนสถานะ", 400);
        const { data, error } = await db
          .from("wp_templates")
          .update({ active: b.active })
          .eq("id", b.id)
          .eq("company_id", company)
          .select("*")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new AccessError("ไม่พบแม่แบบ", 404);
        return response({ data });
      }
      const code = text(b.code, "รหัสเอกสาร", 60);
      const config = validateTemplate(b.config);
      const latest = await db
        .from("wp_templates")
        .select("version")
        .eq("company_id", company)
        .eq("code", code)
        .order("version", { ascending: false })
        .limit(1);
      if (latest.error) throw latest.error;
      const { data, error } = await db
        .from("wp_templates")
        .insert({
          company_id: company,
          code,
          name: text(b.name, "ชื่อแบบฟอร์ม", 200),
          revision: text(b.revision, "Revision", 60),
          version: (latest.data?.[0]?.version || 0) + 1,
          config,
          review_note: text(b.review_note || "", "ข้อสังเกต", 3000, false),
          source_code:
            company === "amt" &&
            PERMIT_SEEDS.some((t) => t.source_code === b.source_code)
              ? b.source_code
              : null,
          active: false,
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505")
          throw new AccessError(
            "มีผู้บันทึกเวอร์ชันใหม่พร้อมกัน กรุณาลองใหม่",
            409,
          );
        throw error;
      }
      return response({ data }, 201);
    }
    if (resource === "sources" && method === "GET") {
      if (
        company !== "amt" ||
        !PERMIT_SEEDS.some((t) => t.source_code === parts[1])
      )
        throw new AccessError("ไม่พบต้นฉบับ", 404);
      const bytes = await readFile(
        path.join(process.cwd(), "data", "permit-templates", `${parts[1]}.pdf`),
      );
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="AHS-${parts[1]}.pdf"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (resource !== "permits") throw new AccessError("ไม่พบรายการ", 404);
    const id = parts[1];
    if (!id && method === "GET") {
      let q = db
        .from("wp_permits")
        .select("*")
        .eq("company_id", company)
        .order("created_at", { ascending: false })
        .limit(100);
      if (actor.contractor) q = q.eq("created_by", actor.key);
      const { data, error } = await q;
      if (error) throw error;
      return response({
        data: (data || []).map((p: Permit) => ({
          ...p,
          data: {
            ...p.data,
            attachments: p.data.attachments.map((a) => ({ ...a, data: "" })),
            signatures: p.data.signatures.map((s) => ({ ...s, image: "" })),
          },
        })),
        limit: 100,
      });
    }
    if (id && !uuid.test(id))
      throw new AccessError("รหัสเอกสารไม่ถูกต้อง", 400);
    let existing: Permit | null = null;
    if (id) {
      const r = await db
        .from("wp_permits")
        .select("*")
        .eq("id", id)
        .eq("company_id", company)
        .maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) throw new AccessError("ไม่พบใบอนุญาต", 404);
      existing = r.data as Permit;
      canReadPermit(actor, existing);
    }
    if (existing && method === "GET") return response({ data: existing });
    const b = await jsonBody(req);
    if ((method === "POST" && !id) || (method === "PUT" && existing)) {
      if (
        existing &&
        (existing.created_by !== actor.key ||
          existing.status !== "draft" ||
          existing.version !== b.version)
      )
        throw new AccessError(
          "แก้ไขได้เฉพาะร่างของตนเอง กรุณาโหลดข้อมูลล่าสุด",
          409,
        );
      const t = await db
        .from("wp_templates")
        .select("*")
        .eq("company_id", company)
        .eq("active", true);
      if (t.error) throw t.error;
      const data = validateData(b.data, t.data as PermitTemplate[]);
      if (actor.contractor)
        data.contractorName = actor.contractorName || data.contractorName;
      if (data.sourcePermitId) {
        const source = await db
          .from("wp_permits")
          .select("*")
          .eq("id", data.sourcePermitId)
          .eq("company_id", company)
          .maybeSingle();
        if (source.error) throw source.error;
        if (!source.data) throw new AccessError("ไม่พบใบอนุญาตต้นทาง", 400);
        canReadPermit(actor, source.data);
      }
      data.events = [
        ...(existing?.data.events || []),
        event(actor, existing ? "edit" : "create"),
      ];
      data.signatures = existing?.data.signatures || [];
      if (existing) {
        const r = await db
          .from("wp_permits")
          .update({
            data,
            version: existing.version + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("company_id", company)
          .eq("version", existing.version)
          .select("*")
          .maybeSingle();
        if (r.error) throw r.error;
        if (!r.data)
          throw new AccessError(
            "ข้อมูลเปลี่ยนระหว่างบันทึก กรุณาโหลดใหม่",
            409,
          );
        return response({ data: r.data });
      }
      const r = await db
        .from("wp_permits")
        .insert({
          id: randomUUID(),
          company_id: company,
          created_by: actor.key,
          status: "draft",
          version: 1,
          data,
        })
        .select("*")
        .single();
      if (r.error) throw r.error;
      return response({ data: r.data }, 201);
    }
    if (existing && method === "POST") {
      if (existing.version !== b.version)
        throw new AccessError(
          "มีผู้ดำเนินการกับเอกสารนี้แล้ว กรุณาโหลดใหม่",
          409,
        );
      if (b.action === "submit") {
        const members = await db
          .from("wp_members")
          .select("*")
          .eq("company_id", company);
        if (members.error) throw members.error;
        for (const role of requiredRoles(existing.data)) {
          const key = existing.data.approvers[role];
          if (
            !members.data?.some((m) => m.actor_key === key && m.role === role)
          )
            throw new AccessError(
              "ผู้อนุมัติไม่มีบทบาทที่กำหนด กรุณาแก้ไขร่าง",
              400,
            );
          const [table, actorId] = (key || "").split(":");
          if (
            !["company_users", "tools_users", "admin_accounts"].includes(table)
          )
            throw new AccessError("ผู้อนุมัติไม่ถูกต้อง", 400);
          const r = await db
            .from(table)
            .select("*")
            .eq("id", actorId)
            .eq("is_active", true)
            .maybeSingle();
          if (r.error) throw r.error;
          if (
            !r.data ||
            (table !== "admin_accounts" && r.data.company_id !== company)
          )
            throw new AccessError("ผู้อนุมัติถูกระงับหรือเปลี่ยนบริษัท", 400);
        }
      }
      const next = transition(existing, actor, String(b.action), b);
      const r = await db
        .from("wp_permits")
        .update({
          status: next.status,
          version: next.version,
          data: next.data,
          updated_at: next.updated_at,
        })
        .eq("id", id)
        .eq("company_id", company)
        .eq("version", existing.version)
        .select("*")
        .maybeSingle();
      if (r.error) throw r.error;
      if (!r.data)
        throw new AccessError("ข้อมูลเปลี่ยนระหว่างลงนาม กรุณาโหลดใหม่", 409);
      return response({ data: r.data });
    }
    throw new AccessError("ไม่รองรับคำขอนี้", 405);
  } catch (e) {
    return apiError(e);
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
