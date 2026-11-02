import type { NextRequest } from 'next/server';
import { firstAidFailure, firstAidJson, loadPublicFirstAidState, postPublicFirstAidTransaction } from '@/lib/first-aid/server';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ token: string }> };
export async function GET(_request: NextRequest, context: Context) {
  try { const { token } = await context.params; return firstAidJson(await loadPublicFirstAidState(token)); }
  catch (error) { return firstAidFailure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  try { const { token } = await context.params; return firstAidJson(await postPublicFirstAidTransaction(request, token)); }
  catch (error) { return firstAidFailure(error); }
}
