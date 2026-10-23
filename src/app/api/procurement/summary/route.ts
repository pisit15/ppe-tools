import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { getDataset } from '@/lib/procurement/data';

export const dynamic = 'force-dynamic';

// Per-person PR summary. Admins get every requester; everyone else gets only the requester
// linked to their login in proc_requester_accounts (filtered here, server-side).
export async function GET(request: NextRequest) {
  try {
    const actor = await requireProcurementActor(request);
    const { prs, meta } = await getDataset();
    if (actor.isAdmin) return NextResponse.json({ prs, meta, scope: 'all', requester: null });

    const { data, error } = await getSupabaseServer().from('proc_requester_accounts')
      .select('requester').eq('username', actor.username.trim().toLowerCase()).maybeSingle();
    if (error) throw error;
    const requester = data?.requester ?? null;
    return NextResponse.json({
      prs: requester ? prs.filter(p => p.requester === requester) : [],
      meta, scope: 'own', requester,
    });
  } catch (error) {
    return apiError(error);
  }
}
