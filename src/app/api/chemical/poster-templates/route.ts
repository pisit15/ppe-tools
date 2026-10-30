import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import {
  AccessError,
  apiError,
  assertCompany,
  requireModuleActor,
} from "@/lib/toolsSession";
import { posterUuid, validatePosterConfig } from "@/lib/chemical/poster";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  try {
    const actor = await requireModuleActor(request, 'chemical', 'Chemical Management');
    const company =
      request.nextUrl.searchParams.get("company_id") || actor.companyId;
    const manage = request.nextUrl.searchParams.get("manage") === "1";
    if (manage && !actor.isAdmin)
      throw new AccessError("เฉพาะ Admin เท่านั้นที่จัดการแม่แบบได้");
    let q = getSupabaseServer()
      .from("chem_poster_templates")
      .select("id,name,company_id,is_visible,revision,config,updated_at")
      .order("name");
    if (!manage) {
      assertCompany(actor, company);
      // Published templates are shared; company_id records the template's origin.
      // Substance records and saved poster versions remain company scoped.
      q = q.eq("is_visible", true);
    }
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ data }, { headers });
  } catch (e) {
    return apiError(e);
  }
}
async function write(request: NextRequest) {
  try {
    const actor = await requireModuleActor(request, 'chemical', 'Chemical Management');
    if (!actor.isAdmin)
      throw new AccessError("เฉพาะ Admin เท่านั้นที่จัดการแม่แบบได้");
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 240000)
      throw new AccessError("รูปหรือข้อมูลแม่แบบมีขนาดใหญ่เกินไป", 413);
    let b;
    try {
      b = JSON.parse(raw);
    } catch {
      throw new AccessError("ข้อมูลแม่แบบไม่ถูกต้อง", 400);
    }
    if (
      !b ||
      typeof b.name !== "string" ||
      !b.name.trim() ||
      b.name.length > 120 ||
      b.name.includes("\0") ||
      typeof b.is_visible !== "boolean" ||
      typeof b.company_id !== "string"
    )
      throw new AccessError("กรอกชื่อแม่แบบและบริษัทให้ถูกต้อง", 400);
    assertCompany(actor, b.company_id);
    const db = getSupabaseServer();
    if (b.company_id !== "all") {
      const c = await db
        .from("company_settings")
        .select("company_id")
        .eq("company_id", b.company_id)
        .maybeSingle();
      if (c.error) throw c.error;
      if (!c.data) throw new AccessError("ไม่พบบริษัทนี้", 400);
    }
    let config;
    try {
      config = validatePosterConfig(b.config);
    } catch (e) {
      throw new AccessError(
        e instanceof Error ? e.message : "ข้อมูลไม่ถูกต้อง",
        400,
      );
    }
    const payload = {
      name: b.name.trim(),
      company_id: b.company_id,
      is_visible: b.is_visible,
      config,
      updated_at: new Date().toISOString(),
      updated_by: {
        id: actor.id,
        displayName: actor.displayName,
        accountTable: actor.accountTable,
      },
    };
    if (request.method === "POST") {
      if (!posterUuid.test(b.id))
        throw new AccessError("รหัสแม่แบบไม่ถูกต้อง", 400);
      const { data, error } = await db
        .from("chem_poster_templates")
        .insert({ ...payload, id: b.id })
        .select("*")
        .single();
      if (error?.code === "23505")
        throw new AccessError(
          "คำขอนี้ถูกบันทึกแล้ว กรุณาโหลดรายชื่อแม่แบบใหม่",
          409,
        );
      if (error) throw error;
      return NextResponse.json({ data }, { status: 201, headers });
    }
    if (
      !posterUuid.test(b.id) ||
      !Number.isInteger(b.revision) ||
      b.revision < 1
    )
      throw new AccessError("รหัสแม่แบบไม่ถูกต้อง", 400);
    const { data, error } = await db
      .from("chem_poster_templates")
      .update({ ...payload, revision: b.revision + 1 })
      .eq("id", b.id)
      .eq("revision", b.revision)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new AccessError(
        "แม่แบบถูกแก้จากหน้าต่างอื่นแล้ว กรุณาโหลดข้อมูลล่าสุด",
        409,
      );
    return NextResponse.json({ data }, { headers });
  } catch (e) {
    return apiError(e);
  }
}
export const POST = write;
export const PATCH = write;
