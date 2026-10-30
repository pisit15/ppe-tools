import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { activeLink, companyName, companyOptions } from '@/lib/visitor/server';
import type { VisitorLinkInfo } from '@/lib/visitor/types';

export const dynamic = 'force-dynamic';

/** Public: tells the request form which company a secret link belongs to, plus that company's option lists. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await activeLink(token);
    const [name, options] = await Promise.all([companyName(link.company_id), companyOptions(link.company_id)]);
    const payload: VisitorLinkInfo = { company: { id: link.company_id, name }, label: link.label, ...options };
    return NextResponse.json(payload);
  } catch (error) {
    return apiError(error);
  }
}
