import { blankProfile, type Member, type Profile } from './team-management';

export const ASSIGNMENT_KINDS = { primary: 'งานหลัก', acting: 'รักษาการ', additional: 'งานเพิ่มเติม' } as const;
export type Assignment = {
  id: string;
  company_id: string;
  position: string;
  kind: keyof typeof ASSIGNMENT_KINDS;
  start_date: string;
  end_date: string;
  direct_manager: string;
  functional_manager: string;
  x: number | null;
  y: number | null;
};
export type AssignmentNode = Member & { person_id: string; primary_company_id: string; assignment: Assignment };
export const bangkokDate = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function assignmentState(a: Assignment, date: string): 'active' | 'upcoming' | 'ended' {
  return a.start_date && a.start_date > date ? 'upcoming' : a.end_date && a.end_date < date ? 'ended' : 'active';
}
export const assignmentStateLabel = { active: 'มีผลอยู่', upcoming: 'ยังไม่เริ่ม', ended: 'สิ้นสุดแล้ว' } as const;

/** Read-through compatibility, not a data migration or an inferred appointment. */
export function assignmentsFor(person: Member, profile: Profile = blankProfile(person)): Assignment[] {
  if (profile.assignments) return profile.assignments.map(a => a.kind === 'primary'
    ? { ...a, company_id: person.company_id, position: person.position || '' } : a);
  return [{ id: person.id, company_id: person.company_id, position: person.position || '', kind: 'primary',
    start_date: '', end_date: '', direct_manager: profile.direct_manager || '', functional_manager: profile.functional_manager || '', x: profile.x, y: profile.y }];
}

export function assignmentNodes(people: Member[], profiles: Map<string, Profile>) {
  const nodes: AssignmentNode[] = [];
  const nodeProfiles = new Map<string, Profile>();
  for (const person of people) {
    const profile = profiles.get(person.id) || blankProfile(person);
    for (const a of assignmentsFor(person, profile)) {
      nodes.push({ ...person, id: a.id, person_id: person.id, primary_company_id: person.company_id, company_id: a.company_id, position: a.position, assignment: a });
      nodeProfiles.set(a.id, { ...profile, person_id: a.id, company_ids: [a.company_id], direct_manager: a.direct_manager, functional_manager: a.functional_manager, x: a.x, y: a.y });
    }
  }
  return { nodes, profiles: nodeProfiles };
}
export function assignmentLabel(node: AssignmentNode) {
  return `${node.full_name} · ${node.company_id.toUpperCase()} · ${ASSIGNMENT_KINDS[node.assignment.kind]} · ${node.position || 'ยังไม่ระบุตำแหน่ง'}`;
}
export function withAssignments(person: Member, profile: Profile, assignments: Assignment[], people: Member[], profiles: Map<string, Profile>): Profile {
  const all = assignmentNodes(people, profiles).nodes;
  const owner = (id: string) => assignments.some(a => a.id === id) ? person.id : all.find(n => n.id === id)?.person_id || '';
  const primary = assignments.find(a => a.kind === 'primary');
  return { ...profile, assignment_version: 1, assignments,
    company_ids: [...new Set([person.company_id, ...profile.company_ids, ...assignments.map(a => a.company_id)].filter(Boolean))],
    direct_manager: owner(primary?.direct_manager || ''), functional_manager: owner(primary?.functional_manager || ''),
    x: primary?.x ?? null, y: primary?.y ?? null };
}

/** Keep validation pure so API and editor can report the same error before writing. */
export function validateAssignments(member: Member, profile: Profile, people: Member[], profiles: Profile[], companyIds: string[]): string | null {
  const previous = profiles.find(p => p.person_id === member.id);
  if (!profile.assignments) return previous?.assignments ? 'ข้อมูลการมอบหมายงานเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่' : null;
  if (profile.assignment_version !== 1 || !Array.isArray(profile.assignments) || !profile.assignments.length || profile.assignments.length > 100)
    return 'ข้อมูลการมอบหมายงานไม่ถูกต้อง (รองรับสูงสุด 100 รายการต่อคน)';
  const assignments = profile.assignments;
  const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const ids = new Set<string>();
  for (const a of assignments) {
    if (!a || !uuid(a.id) || ids.has(a.id) || !Object.hasOwn(ASSIGNMENT_KINDS, a.kind)) return 'รหัสหรือประเภทการมอบหมายงานไม่ถูกต้อง';
    ids.add(a.id);
    for (const field of ['company_id', 'position', 'start_date', 'end_date', 'direct_manager', 'functional_manager'] as const)
      if (typeof a[field] !== 'string' || a[field].length > (field === 'position' ? 2000 : 100)) return 'รายละเอียดการมอบหมายงานไม่ถูกต้อง';
    if (!companyIds.includes(a.company_id)) return 'ไม่พบบริษัทของการมอบหมายงาน';
    if (a.kind !== 'primary' && (!a.position.trim() || !a.start_date)) return 'กรุณาระบุตำแหน่งและวันเริ่มของงานรักษาการ / งานเพิ่มเติม';
    if ([a.start_date, a.end_date].some(d => d && !validDate(d)) || (a.end_date && (!a.start_date || a.end_date < a.start_date))) return 'ช่วงวันที่การมอบหมายงานไม่ถูกต้อง';
    if (a.kind === 'primary' && (a.id !== member.id || a.company_id !== member.company_id || a.position !== member.position || a.start_date || a.end_date)) return 'งานหลักต้องตรงกับบริษัทและตำแหน่งหลัก โดยไม่มีวันเริ่มหรือสิ้นสุดแยก';
    if (a.kind !== 'primary' && a.id === member.id) return 'รหัสงานหลักไม่สามารถใช้กับงานอื่นได้';
    for (const n of [a.x, a.y]) if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 20000)) return 'ตำแหน่งการ์ดการมอบหมายงานไม่ถูกต้อง';
  }
  if (assignments.filter(a => a.kind === 'primary').length !== 1) return 'ต้องมีงานหลักหนึ่งรายการต่อคน';
  for (const old of previous?.assignments || []) {
    const next = assignments.find(a => a.id === old.id);
    if (!next) return 'ไม่สามารถลบการมอบหมายงานที่บันทึกแล้ว ให้ระบุวันสิ้นสุดเพื่อเก็บประวัติ';
    if (old.kind !== next.kind || (old.kind !== 'primary' && old.company_id !== next.company_id)) return 'การมอบหมายงานเดิมเปลี่ยนบริษัทหรือประเภทไม่ได้ ให้สิ้นสุดรายการเดิมแล้วเพิ่มรายการใหม่';
  }
  const candidatePeople = [...people.filter(p => p.id !== member.id), member];
  const candidateProfiles = new Map(profiles.map(p => [p.person_id, p])); candidateProfiles.set(member.id, profile);
  const all = assignmentNodes(candidatePeople, candidateProfiles).nodes;
  const byId = new Map(all.map(n => [n.id, n]));
  if (byId.size !== all.length) return 'รหัสการมอบหมายงานซ้ำกับบุคคลอื่น';
  for (const a of assignments) for (const field of ['direct_manager', 'functional_manager'] as const) {
    if (!a[field]) continue;
    const manager = byId.get(a[field]);
    if (!manager) return 'ไม่พบการมอบหมายงานของผู้บังคับบัญชา';
    if (manager.person_id === member.id) return 'ไม่สามารถเลือกตนเองเป็นผู้บังคับบัญชา แม้อยู่คนละบริษัท';
  }
  // Preserve separate direct and functional semantics. Reject cycles in either graph,
  // including stored appointments, so changing the chart date cannot reveal a cycle.
  for (const field of ['direct_manager', 'functional_manager'] as const) for (const a of assignments) {
    const seen = new Set([a.id]); let next = a[field];
    while (next) {
      if (seen.has(next)) return 'สายรายงานของการมอบหมายงานวนกลับหาตัวเอง';
      seen.add(next); next = byId.get(next)?.assignment[field] || '';
    }
  }
  for (let i = 0; i < assignments.length; i++) for (let j = i + 1; j < assignments.length; j++) {
    const a = assignments[i], b = assignments[j];
    if (a.company_id === b.company_id && a.kind === b.kind && a.position.trim().toLocaleLowerCase() === b.position.trim().toLocaleLowerCase()
      && (a.start_date || '0000') <= (b.end_date || '9999') && (b.start_date || '0000') <= (a.end_date || '9999')) return 'มีการมอบหมายงานตำแหน่งเดียวกันในบริษัทเดียวกันซ้อนช่วงเวลา';
  }
  return null;
}
