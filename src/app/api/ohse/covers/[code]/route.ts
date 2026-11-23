import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertCompany, assertSameOrigin } from '@/lib/toolsSession';
import { requireOhseStaff } from '@/lib/ohse/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Cookie',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireOhseStaff(request);
    assertCompany(actor, 'amt');
    const { code } = await params;
    if (!/^(?:[1-9]|1[0-7])$/.test(code)) return new NextResponse(null, { status: 404, headers: privateHeaders });

    const { amtCoverBytes } = await import('@/lib/ohse/amt-cover-data');
    const encoded = amtCoverBytes[code];
    if (!encoded) return new NextResponse(null, { status: 404, headers: privateHeaders });
    return new NextResponse(new Uint8Array(Buffer.from(encoded, 'base64')), {
      headers: { ...privateHeaders, 'Content-Type': 'image/webp' },
    });
  } catch (error) {
    const response = apiError(error);
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value);
    return response;
  }
}
