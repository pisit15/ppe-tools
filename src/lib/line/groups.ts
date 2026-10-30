// Registry of LINE groups the OA has been invited to (webhook join/leave events).
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchGroupName } from './push';

export type LineGroupRow = { group_id: string; group_name: string; active: boolean; joined_at: string; left_at: string | null; last_event_at: string };

export async function recordGroupJoin(db: SupabaseClient, groupId: string, accessToken: string): Promise<LineGroupRow> {
  const name = await fetchGroupName(groupId, accessToken);
  const now = new Date().toISOString();
  const { data, error } = await db.from('line_groups')
    .upsert({ group_id: groupId, group_name: name, active: true, left_at: null, last_event_at: now }, { onConflict: 'group_id' })
    .select('*').single();
  if (error) throw error;
  return data as LineGroupRow;
}

export async function recordGroupLeave(db: SupabaseClient, groupId: string) {
  const now = new Date().toISOString();
  const { error } = await db.from('line_groups').update({ active: false, left_at: now, last_event_at: now }).eq('group_id', groupId);
  if (error) throw error;
}

/** Keep the name fresh when the group chats (cheap: one update, no API call). */
export async function touchGroup(db: SupabaseClient, groupId: string) {
  await db.from('line_groups').update({ last_event_at: new Date().toISOString(), active: true }).eq('group_id', groupId);
}
