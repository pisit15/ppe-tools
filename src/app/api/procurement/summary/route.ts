import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { requireProcurementActor } from '@/lib/procurement/access';
import { actorScope, getDataset } from '@/lib/procurement/data';
import { canSee } from '@/lib/procurement/scope';

export const dynamic = 'force-dynamic';

// Per-person PR summary limited (server-side) to the companies the login has rights to. Admins see all.
export async function GET(request: NextRequest) {
  try {
    const actor = await requireProcurementActor(request);
    const d = await getDataset();
    const scope = actorScope(actor, d);
    const prs = d.prs
      .map(p => ({ ...p, sites: d.sitesByPr.get(p.odoo_id) ?? [] }))
      .filter(p => canSee(scope, p.sites, p.requester));
    const sites = (scope.all ? [...new Set(prs.flatMap(p => p.sites))].sort() : scope.sites)
      .map(id => ({ id, name: d.siteNames.get(id) ?? id.toUpperCase() }));
    return NextResponse.json({ prs, meta: d.meta, scope: scope.all ? 'all' : 'company', sites });
  } catch (error) {
    return apiError(error);
  }
}
