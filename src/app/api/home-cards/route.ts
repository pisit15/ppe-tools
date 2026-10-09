import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { homeCards, type HomeCardRow } from '@/lib/home-cards';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { data, error } = await getSupabaseServer().from('tools_home_cards')
      .select('id,name,description,is_visible,revision,updated_at').eq('is_visible', true);
    if (error) throw error;
    return NextResponse.json({ data: homeCards((data || []) as HomeCardRow[]) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Load homepage cards failed', error);
    return NextResponse.json({ error: 'โหลดรายการเครื่องมือไม่สำเร็จ กรุณาลองใหม่' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
