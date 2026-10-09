import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { AccessError, apiError, assertCompany, requireToolsActor } from '@/lib/toolsSession';
import { getLegalCatalog } from '@/lib/chemical/legal/catalog';
import { checkLegalCatalog, normalizeCas, searchLegalCatalog } from '@/lib/chemical/legal/engine';
import { LEGAL_CATEGORIES } from '@/lib/chemical/legal/types';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const actor = await requireToolsActor(request);
    const params = request.nextUrl.searchParams;
    const company = params.get('company_id');
    assertCompany(actor, company);
    const catalog = await getLegalCatalog();
    const summary = {
      release: catalog.release, sources: catalog.sources,
      stats: LEGAL_CATEGORIES.map(category => ({ category, total: catalog.entries.filter(e => e.category === category).length, verified: catalog.entries.filter(e => e.category === category && e.review_state === 'verified').length })),
    };
    const substanceId = params.get('substance_id');
    if (substanceId) {
      if (company === 'all') throw new AccessError('เลือกบริษัทก่อนตรวจรายการในทะเบียน', 400);
      const { data, error } = await getSupabaseServer().from('chem_substances').select('id,company_id,name,cas_no,updated_at,is_demo,is_active').eq('company_id', company).eq('id', substanceId).eq('is_active', true).maybeSingle();
      if (error) throw error;
      if (!data) throw new AccessError('ไม่พบรายการในบริษัทที่เลือก', 404);
      const cas = normalizeCas(data.cas_no);
      return NextResponse.json({ ...summary, substance: data, check: cas ? checkLegalCatalog(catalog, cas) : null, identityWarning: cas ? null : 'รายการนี้ไม่มี CAS เดี่ยวที่ตรวจรูปแบบได้ โปรดตรวจองค์ประกอบใน SDS และใช้เมนูค้นหาสารอื่นทีละองค์ประกอบ' });
    }
    if (params.get('mode') === 'register') {
      let query = getSupabaseServer().from('chem_substances').select('id,company_id,name,cas_no,updated_at').eq('is_active', true).eq('is_demo', false).order('name').order('id');
      if (company !== 'all') query = query.eq('company_id', company);
      const data: { id: string; company_id: string; name: string; cas_no: string | null; updated_at: string }[] = [];
      for (let offset = 0; ; offset += 500) {
        const batch = await query.range(offset, offset + 499);
        if (batch.error) throw batch.error;
        data.push(...(batch.data || []));
        if ((batch.data?.length || 0) < 500) break;
      }
      const register = data.map(row => {
        const cas = normalizeCas(row.cas_no);
        return { ...row, valid_cas: cas, counts: cas ? checkLegalCatalog(catalog, cas).counts : null };
      });
      return NextResponse.json({ ...summary, register });
    }
    const rawCas = params.get('cas');
    if (rawCas !== null) {
      const cas = normalizeCas(rawCas);
      if (!cas) throw new AccessError('เลข CAS ไม่ถูกต้อง กรุณาตรวจจาก SDS; ระบบจะไม่เดาตัวเลขที่ขาด', 400);
      return NextResponse.json({ ...summary, check: checkLegalCatalog(catalog, cas) });
    }
    const text = (params.get('q') || '').trim();
    if (text.length > 200) throw new AccessError('คำค้นยาวเกิน 200 ตัวอักษร', 400);
    const search = searchLegalCatalog(catalog, text);
    const unmapped = text ? catalog.entries.filter(e => !e.cas_numbers.length && [e.name, e.source_cas, e.list_ref].join(' ').toLowerCase().includes(text.toLowerCase())).slice(0, 20) : [];
    return NextResponse.json({ ...summary, ...search, unmapped });
  } catch (error) { return apiError(error); }
}
