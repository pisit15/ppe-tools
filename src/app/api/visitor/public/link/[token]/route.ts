import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/toolsSession';
import { activeLink, companyName } from '@/lib/visitor/server';

export const dynamic = 'force-dynamic';

/** Public: tells the request form which company a secret link belongs to. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const link = await activeLink(token);
    const name = await companyName(link.company_id);
    return NextResponse.json({ company: { id: link.company_id, name }, label: link.label });
  } catch (error) {
    return apiError(error);
  }
}
