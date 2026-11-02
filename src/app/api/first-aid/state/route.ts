import type { NextRequest } from 'next/server';
import { firstAidActor, firstAidFailure, firstAidJson, loadFirstAidState } from '@/lib/first-aid/server';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try { const { actor, companyId } = await firstAidActor(request); return firstAidJson(await loadFirstAidState(companyId, actor)); }
  catch (error) { return firstAidFailure(error); }
}
