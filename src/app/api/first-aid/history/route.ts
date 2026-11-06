import type { NextRequest } from 'next/server';
import { firstAidFailure, firstAidJson, loadFirstAidHistory } from '@/lib/first-aid/server';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try { return firstAidJson(await loadFirstAidHistory(request)); }
  catch (error) { return firstAidFailure(error); }
}
