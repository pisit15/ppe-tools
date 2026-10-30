import { NextRequest, NextResponse } from "next/server";
import { posterUuid } from "@/lib/chemical/poster";
import { assertExistingCompany } from "@/lib/chemical/access";
import { getSupabaseServer } from "@/lib/supabase";
import type { ChemCompanySettings, ChemEmergencyContact } from "@/lib/types";

import {
  requireModuleActor,
  assertCompany,
  apiError,
  AccessError,
} from "@/lib/toolsSession";

export const dynamic = "force-dynamic";

function db() {
  return getSupabaseServer();
}

const DEFAULTS = (companyId: string): ChemCompanySettings => ({
  company_id: companyId,
  emergency_contacts: [],
  show_emergency: true,
});

/** GET ?company_id= → การตั้งค่าของบริษัท (คืนค่าเริ่มต้นถ้ายังไม่เคยบันทึก) */
export async function GET(request: NextRequest) {
  try {
    const actor = await requireModuleActor(request, 'chemical', 'Chemical Management');
    const companyId = request.nextUrl.searchParams.get("company_id") || "";
    assertCompany(actor, companyId);
    if (companyId === "all") {
      const { data, error } = await db()
        .from("chem_company_settings")
        .select("*");
      if (error) throw error;
      return NextResponse.json({ data: DEFAULTS("all"), policies: data });
    }
    const { data, error } = await db()
      .from("chem_company_settings")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({
      data: (data as ChemCompanySettings | null) || DEFAULTS(companyId),
    });
  } catch (error) {
    return apiError(error);
  }
}

function cleanContacts(raw: unknown): ChemEmergencyContact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => ({
      label: String((c as ChemEmergencyContact)?.label ?? "").trim(),
      phone: String((c as ChemEmergencyContact)?.phone ?? "").trim(),
    }))
    .filter((c) => c.label || c.phone)
    .slice(0, 10);
}

/** PUT { company_id, emergency_contacts?, show_emergency? } → upsert */
export async function PUT(request: NextRequest) {
  try {
    const actor = await requireModuleActor(request, 'chemical', 'Chemical Management');
    const body = (await request.json()) as Partial<ChemCompanySettings>;
    if (!body.company_id || body.company_id === "all")
      return NextResponse.json({ error: "กรุณาเลือกบริษัท" }, { status: 400 });
    assertCompany(actor, body.company_id, true);
    await assertExistingCompany(body.company_id);
    const row: Record<string, unknown> = { company_id: body.company_id };
    // Governance fields (SDS review cycle, default poster template) are admin-only;
    // company users keep editing their own emergency contacts, and every change is logged.
    const governance = body.default_poster_template_id !== undefined || body.sds_review_years !== undefined || body.sds_review_policy !== undefined;
    if (governance && !actor.isAdmin) {
      const { data: current } = await db().from("chem_company_settings")
        .select("default_poster_template_id, sds_review_years, sds_review_policy")
        .eq("company_id", body.company_id).maybeSingle();
      const changed =
        (body.default_poster_template_id !== undefined && body.default_poster_template_id !== (current?.default_poster_template_id ?? null)) ||
        (body.sds_review_years !== undefined && body.sds_review_years !== (current?.sds_review_years ?? null)) ||
        (body.sds_review_policy !== undefined && (body.sds_review_policy?.trim() || null) !== (current?.sds_review_policy ?? null));
      if (changed) throw new AccessError("เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยนรอบทบทวน SDS หรือแม่แบบโปสเตอร์ได้", 403);
      delete body.default_poster_template_id; delete body.sds_review_years; delete body.sds_review_policy;
    }
    if (body.default_poster_template_id !== undefined) {
      const id = body.default_poster_template_id;
      if (id !== null) {
        if (typeof id !== "string" || !posterUuid.test(id))
          throw new AccessError("รหัสแม่แบบไม่ถูกต้อง", 400);
        const { data: template, error } = await db()
          .from("chem_poster_templates")
          .select("id")
          .eq("id", id)
          .eq("is_visible", true)
          .maybeSingle();
        if (error) throw error;
        if (!template)
          throw new AccessError(
            "แม่แบบนี้ถูกซ่อนหรือไม่มีอยู่แล้ว กรุณาเลือกใหม่",
            400,
          );
      }
      row.default_poster_template_id = id;
    }
    if (body.sds_review_years !== undefined) {
      const years = body.sds_review_years;
      if (
        years !== null &&
        (!Number.isInteger(years) || years < 1 || years > 50)
      )
        throw new AccessError(
          "รอบทบทวนต้องเป็นจำนวนเต็ม 1–50 ปี หรือยังไม่กำหนด",
          400,
        );
      if (years !== null && !body.sds_review_policy?.trim())
        throw new AccessError("กรุณาระบุชื่อนโยบายที่กำหนดรอบทบทวน", 400);
      row.sds_review_years = years;
      row.sds_review_policy =
        years === null ? null : body.sds_review_policy?.trim();
    }
    if (body.emergency_contacts !== undefined)
      row.emergency_contacts = cleanContacts(body.emergency_contacts);
    if (body.show_emergency !== undefined)
      row.show_emergency = !!body.show_emergency;
    const { data: before } = await db().from("chem_company_settings").select("*").eq("company_id", body.company_id).maybeSingle();
    row.updated_by = actor.username;
    row.updated_at = new Date().toISOString();
    const { data, error } = await db()
      .from("chem_company_settings")
      .upsert([row], { onConflict: "company_id" })
      .select();
    if (error) throw error;
    // Append-only audit trail of values printed on posters (best effort, never blocks the save).
    const { error: logError } = await db().from("chem_company_settings_history")
      .insert([{ company_id: body.company_id, changed_by: actor.username, before: before ?? null, after: data[0] }]);
    if (logError) console.error("chem settings history insert failed", logError.message);
    return NextResponse.json({ data: data[0] as ChemCompanySettings });
  } catch (error: unknown) {
    return apiError(error);
  }
}
