import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import {
  AccessError,
  assertCompany,
  assertSameOrigin,
  requireToolsActor,
} from "@/lib/toolsSession";
import { getSupabaseServer } from "@/lib/supabase";
import type { PermitActor, PermitRole } from "./types";
export const PERMIT_COOKIE = "ea_permit_session";
export const PERMIT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/permit",
  maxAge: 8 * 60 * 60,
};
const mac = (v: string) => {
  const s =
    process.env.TOOLS_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Session secret missing");
  return createHmac("sha256", s).update(`permit:${v}`).digest("base64url");
};
export function issuePermitSession(row: Record<string, unknown>) {
  const body = Buffer.from(
    JSON.stringify({
      id: row.id,
      credential: mac(String(row.password_hash)),
      exp: Math.min(
        Date.now() + PERMIT_COOKIE_OPTIONS.maxAge * 1000,
        Date.parse(String(row.expires_at)),
      ),
    }),
  ).toString("base64url");
  return `${body}.${mac(body)}`;
}
export function decodePermitSession(
  token?: string,
): { id: string; credential: string; exp: number } | null {
  try {
    if (!token) return null;
    const [body, sig, ...rest] = token.split(".");
    const expected = Buffer.from(mac(body));
    const got = Buffer.from(sig || "");
    if (
      rest.length ||
      got.length !== expected.length ||
      !timingSafeEqual(got, expected)
    )
      return null;
    const d = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof d.id === "string" &&
      typeof d.credential === "string" &&
      Number.isFinite(d.exp) &&
      d.exp > Date.now()
      ? d
      : null;
  } catch {
    return null;
  }
}
export async function permitActor(request: NextRequest): Promise<PermitActor> {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
    assertSameOrigin(request);
  const token = request.cookies.get(PERMIT_COOKIE)?.value;
  if (token) {
    const s = decodePermitSession(token);
    if (!s)
      throw new AccessError("บัญชีหรือเซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", 401);
    const { data: r, error } = await getSupabaseServer()
      .from("wp_contractors")
      .select("*")
      .eq("id", s.id)
      .maybeSingle();
    if (error) throw error;
    if (
      !r ||
      !r.active ||
      Date.parse(r.starts_at) > Date.now() ||
      Date.parse(r.expires_at) <= Date.now() ||
      mac(r.password_hash) !== s.credential
    )
      throw new AccessError("บัญชียังไม่เริ่มใช้งาน หมดอายุ หรือถูกระงับ", 401);
    return {
      key: `contractor:${r.id}`,
      id: r.id,
      name: r.display_name,
      companyId: r.company_id,
      admin: false,
      contractor: true,
      requesterType: r.requester_type,
      department: r.department,
      contractorName: r.requester_type === "employee" ? r.department : r.contractor_name,
      expiresAt: r.expires_at,
      roles: [],
    };
  }
  const a = await requireToolsActor(request);
  const key = `${a.accountTable}:${a.id}`;
  const { data, error } = await getSupabaseServer()
    .from("wp_members")
    .select("role")
    .eq("actor_key", key)
    .eq(
      "company_id",
      request.nextUrl.searchParams.get("company_id") || a.companyId,
    );
  if (error) throw error;
  return {
    key,
    id: a.id,
    name: a.displayName,
    companyId: a.companyId,
    admin: a.isAdmin,
    contractor: false,
    roles: (data || []).map((x) => x.role as PermitRole),
  };
}
export function permitCompany(a: PermitActor, value: unknown) {
  assertCompany(
    { isAdmin: a.admin, companyId: a.companyId } as Parameters<
      typeof assertCompany
    >[0],
    value,
    true,
  );
  return value;
}
export function permitAdmin(a: PermitActor) {
  if (!a.admin || a.contractor)
    throw new AccessError("เฉพาะผู้ดูแลระบบเท่านั้น", 403);
}
export function canReadPermit(
  a: PermitActor,
  p: { company_id: string; created_by: string },
) {
  permitCompany(a, p.company_id);
  if (a.contractor && p.created_by !== a.key)
    throw new AccessError("ไม่มีสิทธิ์เข้าถึงใบอนุญาตนี้");
}
