import type { NextRequest } from 'next/server';
import { firstAidFailure, firstAidJson, manageFirstAid } from '@/lib/first-aid/server';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try { return firstAidJson(await manageFirstAid(request)); }
  catch (error) { return firstAidFailure(error); }
}
export const PATCH = POST;
