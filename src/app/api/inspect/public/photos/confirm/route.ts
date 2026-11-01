import { NextRequest, NextResponse } from 'next/server';
import { apiError, assertSameOrigin } from '@/lib/toolsSession';
import { assetByToken, confirmPhoto } from '@/lib/inspect/server';
import { bad } from '@/lib/inspect/validation';

export const dynamic = 'force-dynamic';

/** POST { token, path, width, height } → registers the uploaded object (size verified server-side) */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => null) as { token?: string; path?: string; width?: number; height?: number } | null;
    const token = String(body?.token || '');
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw bad('QR ไม่ถูกต้อง');
    const asset = await assetByToken(token);
    const row = await confirmPhoto(asset.company_id, asset.id, String(body?.path || ''), { width: Number(body?.width || 0), height: Number(body?.height || 0) });
    return NextResponse.json({ data: { id: row.id, storage_path: row.storage_path, bytes: row.bytes } }, { status: 201 });
  } catch (error) { return apiError(error); }
}
