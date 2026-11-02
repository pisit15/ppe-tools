import type { NextRequest } from 'next/server';
import { firstAidFailure, firstAidJson, postFirstAidTransaction } from '@/lib/first-aid/server';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try { return firstAidJson(await postFirstAidTransaction(request)); }
  catch (error) { return firstAidFailure(error); }
}
