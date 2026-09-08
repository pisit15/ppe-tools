import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, saError } from '@/lib/superAdminGuard';
import { getSupabaseServer } from '@/lib/supabase';
import { validateProfile, validateReview, type Member, type Profile, type Review } from '@/lib/team-management';
export const runtime = 'nodejs';
const PERSON_COLUMNS='id,full_name,nick_name,company_id,position,bu,department,responsibility,phone,email,is_active,is_she_team,employment_type,updated_at';
const noCache = { 'Cache-Control': 'private, no-store' };
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:noCache});
function databaseError(error: { code?: string; message?: string }) {
  if (['42P01','PGRST205','PGRST202'].includes(error.code||'')) return json({error:'ส่วนจัดการทีมยังไม่พร้อมใช้งาน กรุณาติดตั้ง migration team_management ก่อน',setupRequired:true},503);
  if (error.message?.includes('TEAM_CONFLICT')) return json({error:'ข้อมูลถูกแก้ไขจากหน้าต่างอื่น กรุณาโหลดใหม่ก่อนบันทึก'},409);
  if (error.message?.includes('TEAM_REVIEW_LOCKED')) return json({error:'ผลประเมินนี้สรุปแล้วและล็อกไว้'},409);
  if (error.message?.includes('TEAM_CYCLE')) return json({error:'สายรายงานวนกลับหาตัวเอง'},400);
  if (error.code==='23505') return json({error:'ข้อมูลซ้ำกับรายการที่บันทึกแล้ว กรุณาโหลดใหม่และตรวจบัญชีหรือรอบประเมิน'},409);
  return saError(error,'บันทึกหรือโหลดข้อมูลทีมไม่สำเร็จ');
}
export async function GET(request: NextRequest) {
  const guard=await requireSuperAdmin(request); if(!guard.ok) return guard.response;
  try {
    const db=getSupabaseServer();
    const results=await Promise.all([
      db.from('she_personnel').select(PERSON_COLUMNS).order('full_name'),
      db.from('team_member_profiles').select('payload'),
      db.from('team_performance_reviews').select('payload'),
      db.from('company_settings').select('company_id,company_name').order('company_id'),
      db.from('company_users').select('id,company_id,username,display_name').eq('is_active',true),
      db.from('tools_users').select('id,company_id,username,display_name').eq('is_active',true),
      db.from('personnel_licenses').select('id,personnel_id,has_license,license_no,expiry_date,legal_requirement_types(name,category)'),
    ]);
    for (const result of results) if(result.error) return databaseError(result.error);
    return json({people:results[0].data,profiles:results[1].data?.map(r=>r.payload),reviews:results[2].data?.map(r=>r.payload),companies:results[3].data,
      users:[...(results[4].data||[]).map(r=>({...r,id:String(r.id),source:'company_users'})),...(results[5].data||[]).map(r=>({...r,id:String(r.id),source:'tools_users'}))],licenses:results[6].data});
  } catch(err) { return saError(err,'โหลดข้อมูลทีมไม่สำเร็จ'); }
}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function POST(request: NextRequest) {
  const guard=await requireSuperAdmin(request); if(!guard.ok) return guard.response;
  const origin=request.headers.get('origin');
  try { if(origin && new URL(origin).host!==request.headers.get('host')) return json({error:'ไม่อนุญาตคำขอข้ามเว็บไซต์'},403); }
  catch { return json({error:'ไม่อนุญาตคำขอข้ามเว็บไซต์'},403); }
  try {
    const raw=await request.text(); if(raw.length>150000) return json({error:'ข้อมูลยาวเกินกำหนด'},413);
    let body; try {body=JSON.parse(raw);} catch {return json({error:'รูปแบบข้อมูลไม่ถูกต้อง'},400);}
    if(!body || typeof body!=='object' || Array.isArray(body)) return json({error:'รูปแบบข้อมูลไม่ถูกต้อง'},400);
    const db=getSupabaseServer();
    if(body.action==='member') {
      const m=body.member as Member; const p=body.profile as Profile;
      if(!m||!p||!uuid(m.id)||p.person_id!==m.id||!Number.isInteger(p.revision)||p.revision<0) return json({error:'ข้อมูลบุคลากรไม่ถูกต้อง'},400);
      for(const field of ['full_name','nick_name','company_id','position','bu','department','responsibility','phone','email','employment_type'] as const)
        if(typeof m[field]!=='string'||m[field].length>2000) return json({error:'ข้อมูลบุคลากรไม่ถูกต้อง'},400);
      if(!m.full_name.trim()||!m.company_id||!['permanent','contract','outsource'].includes(m.employment_type)) return json({error:'กรุณาระบุชื่อ บริษัท และประเภทการจ้าง'},400);
      for(const key of ['province','effective_date','direct_manager','functional_manager','user_id','license_claims','notes'] as const)
        if(typeof p[key]!=='string'||p[key].length>20000) return json({error:'ข้อมูลรายละเอียดไม่ถูกต้อง'},400);
      const bangkokToday=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
      if(p.effective_date && (!/^\d{4}-\d{2}-\d{2}$/.test(p.effective_date)||!Number.isFinite(Date.parse(p.effective_date))||new Date(p.effective_date).toISOString().slice(0,10)!==p.effective_date||p.effective_date>bangkokToday)) return json({error:'วันที่มีผลต้องเป็นวันที่วันนี้หรือในอดีต'},400);
      if(p.status!=='working'&&!p.effective_date) return json({error:'กรุณาระบุวันที่สถานะมีผล'},400);
      const [people,profiles,companies]=await Promise.all([db.from('she_personnel').select(PERSON_COLUMNS),db.from('team_member_profiles').select('payload'),db.from('company_settings').select('company_id')]);
      for(const result of [people,profiles,companies]) if(result.error) return databaseError(result.error);
      const validation=validateProfile(p,people.data as Member[],profiles.data?.map(r=>r.payload) as Profile[]);
      if(validation) return json({error:validation},400);
      if(![m.company_id,...p.company_ids].every(id=>companies.data?.some(c=>c.company_id===id))) return json({error:'ไม่พบบริษัทที่เลือก'},400);
      if(!p.company_ids.includes(m.company_id)) return json({error:'บริษัทที่รับผิดชอบต้องรวมบริษัทหลัก'},400);
      if(p.user_id) {
        const linked=await db.from(p.user_source).select('id').eq('id',p.user_id).eq('is_active',true).maybeSingle();
        if(linked.error) return databaseError(linked.error);
        if(!linked.data) return json({error:'ไม่พบบัญชีที่เปิดใช้งาน'},400);
        if(profiles.data?.some(r=>r.payload.person_id!==m.id&&r.payload.user_id===p.user_id&&r.payload.user_source===p.user_source)) return json({error:'บัญชีนี้เชื่อมกับบุคคลอื่นแล้ว'},409);
      }
      const saved=await db.rpc('save_team_member',{p_member:m,p_profile:p,p_actor:guard.session.username,p_expected_updated_at:m.updated_at||null});
      if(saved.error) return databaseError(saved.error);
      return json({data:saved.data});
    }
    if(body.action==='review') {
      const r=body.review as Review;
      if(!r||!uuid(r.id)||!uuid(r.person_id)||!Number.isInteger(r.revision)||r.revision<0) return json({error:'ข้อมูลประเมินไม่ถูกต้อง'},400);
      for(const key of ['cycle','reviewer','final_grade','adjustment_reason','goals','check_in','employee_notes','manager_notes','idp','next_check_in'] as const)
        if(typeof r[key]!=='string'||r[key].length>20000) return json({error:'ข้อความประเมินไม่ถูกต้อง'},400);
      if(r.cycle.length>100) return json({error:'ชื่อรอบยาวเกินไป'},400);
      const validation=validateReview(r); if(validation) return json({error:validation},400);
      const saved=await db.rpc('save_team_review',{p_review:r,p_actor:guard.session.username});
      if(saved.error) return databaseError(saved.error);
      return json({data:saved.data});
    }
    return json({error:'ไม่รู้จักคำสั่ง'},400);
  } catch(err) {return saError(err,'บันทึกข้อมูลทีมไม่สำเร็จ');}
}
