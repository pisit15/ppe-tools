export const FAMILIES = {
  F1: 'ผู้จัดการ / หัวหน้า HSE', F2: 'จป.วิชาชีพ / Safety Supervisor',
  F3: 'จป.เทคนิค / ผู้ช่วย จป.', F4: 'เจ้าหน้าที่ / วิศวกรสิ่งแวดล้อม',
  F5: 'ปฏิบัติการสิ่งแวดล้อม / หัวหน้ากะ', F6: 'ISO / DCC',
} as const;
export type Family = keyof typeof FAMILIES;
export const WEIGHTS: Record<Family, number[]> = {
  F1: [30,20,30,20], F2: [30,35,20,15], F3: [20,40,25,15],
  F4: [40,20,25,15], F5: [25,30,30,15], F6: [35,30,20,15],
};
export const STATUS = { working: 'ทำงานอยู่', resigned: 'ลาออก', laid_off: 'เลิกจ้าง', transferred: 'ย้าย', inactive: 'พ้นขอบเขตทีม' } as const;
export type Member = {
  id: string; full_name: string; nick_name: string; company_id: string;
  position: string; bu: string; department: string; responsibility: string;
  phone: string; email: string; is_active: boolean; is_she_team: boolean;
  employment_type: string; updated_at?: string;
};
export type Profile = {
  in_scope?: boolean;
  person_id: string; revision: number; teams: string[]; company_ids: string[];
  family: Family | ''; tier: string; province: string;
  status: keyof typeof STATUS; effective_date: string;
  direct_manager: string; functional_manager: string;
  user_source: '' | 'company_users' | 'tools_users'; user_id: string;
  license_claims: string; notes: string;
  x: number | null; y: number | null;
};
export type Review = {
  id: string; person_id: string; cycle: string; revision: number;
  family: Family; weights: number[]; scores: (number | null)[];
  evidence: string[]; reviewer: string; final_grade: string;
  adjustment_reason: string; goals: string; check_in: string;
  employee_notes: string; manager_notes: string; idp: string;
  next_check_in: string; state: 'draft' | 'calibration' | 'final';
};
export type License = { id: string; personnel_id: string; has_license: boolean; license_no: string | null; expiry_date: string | null; legal_requirement_types: { name: string; category: string } | null };
export function blankProfile(person: Member): Profile {
  return { person_id: person.id, revision: 0, teams: person.is_she_team ? ['SHE'] : [],
    company_ids: [person.company_id], family: '', tier: '', province: '',
    status: person.is_active ? 'working' : 'inactive', effective_date: '',
    direct_manager: '', functional_manager: '', user_source: '', user_id: '',
    license_claims: '', notes: '', x: null, y: null };
}
export function scoreReview(scores: (number | null)[], weights: number[]) {
  if (scores.length !== 4 || weights.length !== 4 || scores.some(s => s === null || !Number.isFinite(s) || s < 1 || s > 5)
    || weights.some(w => !Number.isFinite(w) || w < 0 || w > 100) || Math.abs(weights.reduce((a,b)=>a+b,0)-100)>0.000001) return null;
  return scores.reduce<number>((total, s, i) => total + Number(s)*weights[i], 0)/100;
}
export function proposedGrade(score: number | null) {
  if (score === null) return '';
  return score >= 4.5 ? 'A' : score >= 3.5 ? 'B' : score >= 2.5 ? 'C' : score >= 1.5 ? 'D' : 'E';
}
export function validateReview(r: Review): string | null {
  if (!r || !r.person_id || !r.cycle?.trim() || !Object.hasOwn(FAMILIES, r.family)) return 'กรุณาระบุบุคคล รอบ และกลุ่มงาน';
  if (!Array.isArray(r.scores) || r.scores.length !== 4 || r.scores.some(s=>s!==null && (typeof s!=='number'||!Number.isFinite(s)||s<1||s>5))) return 'คะแนนต้องอยู่ระหว่าง 1–5 หรือเว้นว่าง';
  if (!Array.isArray(r.weights) || r.weights.length!==4 || r.weights.some(w=>typeof w!=='number'||!Number.isFinite(w)||w<0||w>100) || Math.abs(r.weights.reduce((a,b)=>a+b,0)-100)>0.000001) return 'น้ำหนักต้องรวม 100%';
  if (!Array.isArray(r.evidence) || r.evidence.length!==4 || r.evidence.some(e=>typeof e!=='string')) return 'ต้องมีช่องหลักฐาน P1–P4';
  if (!['draft','calibration','final'].includes(r.state)) return 'สถานะประเมินไม่ถูกต้อง';
  if (r.final_grade && !['A','B','C','D','E'].includes(r.final_grade)) return 'เกรดไม่ถูกต้อง';
  if (r.state !== 'draft' && (scoreReview(r.scores,r.weights)===null || r.evidence.some(e=>!e.trim()) || !r.reviewer?.trim())) return 'ก่อนทบทวน ต้องมีคะแนน หลักฐาน 4 ด้าน และผู้ประเมินครบ';
  if (r.state==='final' && !r.final_grade) return 'กรุณาระบุเกรดสุดท้าย';
  if (r.final_grade && r.final_grade !== proposedGrade(scoreReview(r.scores,r.weights)) && !r.adjustment_reason?.trim()) return 'กรุณาระบุเหตุผลที่ปรับเกรด';
  return null;
}
export function validateProfile(p: Profile, people: Member[], profiles: Profile[]): string | null {
  if (p?.in_scope !== undefined && typeof p.in_scope !== 'boolean') return 'ขอบเขตความรับผิดชอบไม่ถูกต้อง';
  if (!p || !Object.hasOwn(STATUS,p.status)) return 'สถานะบุคลากรไม่ถูกต้อง';
  if (p.family && !Object.hasOwn(FAMILIES,p.family)) return 'กลุ่มงานไม่ถูกต้อง';
  if (!Array.isArray(p.teams)||p.teams.some(t=>!['SHE','ISO','DCC','Environment'].includes(t))) return 'ทีมไม่ถูกต้อง';
  if (!Array.isArray(p.company_ids)||!p.company_ids.length||p.company_ids.some(v=>typeof v!=='string'||!v)) return 'กรุณาเลือกบริษัทที่รับผิดชอบ';
  if (!['','A','B','C','-'].includes(p.tier)) return 'Site Tier ไม่ถูกต้อง';
  if ((p.user_id && !p.user_source)||(!p.user_id && p.user_source)||!['','company_users','tools_users'].includes(p.user_source)) return 'ข้อมูลบัญชีที่เชื่อมไม่ครบ';
  for (const field of ['direct_manager','functional_manager'] as const) {
    if (p[field] && !people.some(person=>person.id===p[field])) return 'ไม่พบผู้บังคับบัญชาที่เลือก';
    const lookup=new Map(profiles.map(row=>[row.person_id,row])); lookup.set(p.person_id,p);
    const seen=new Set([p.person_id]); let next=p[field];
    while(next) { if(seen.has(next)) return 'สายรายงานวนกลับหาตัวเอง'; seen.add(next); next=lookup.get(next)?.[field]||''; }
  }
  for (const value of [p.x,p.y]) if(value!==null && (typeof value!=='number'||!Number.isFinite(value)||value<0||value>20000)) return 'ตำแหน่งบนผังไม่ถูกต้อง';
  return null;
}
export function licenseStatus(license: License, today: string) {
  if (!license.has_license) return 'ระบุว่าไม่มีใบ';
  if (!license.expiry_date) return 'ไม่ทราบวันหมดอายุ';
  const days = Math.round((Date.parse(license.expiry_date.slice(0,10)+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
  if (!Number.isFinite(days)) return 'ไม่ทราบวันหมดอายุ';
  return days<0 ? 'หมดอายุ' : days<=90 ? 'ใกล้หมดอายุ' : 'ยังไม่หมดอายุ';
}
export function normalizeName(name: string) { return name.normalize('NFC').replace(/\s/g,'').toLowerCase(); }
export type ImportRow = { sourceRow: number; full_name: string; nick_name: string; company_id: string; bu: string; position: string; province: string; family: Family | ''; tier: string; license_claims: string; notes: string; matchedIds: string[] };
export function parseRoster(rows: unknown[][], people: Member[]): ImportRow[] {
  const header=rows[0];
  if (!header || header[1]!=='ชื่อ-นามสกุล' || header[8]!=='ครอบครัวงาน') throw new Error('เลือกชีต 01-รายชื่อและครอบครัวงาน ในรูปแบบไฟล์ที่ให้มา');
  const aliases: Record<string,string>={ HO:'ea-hq', KBN:'ea-kabin', AMT:'amt', ESM:'esm', 'ESN/ESLO':'esn' };
  return rows.flatMap((r,i)=>{
    if(i===0||typeof r[0]!=='number'||!r[1]) return [];
    const text=(j:number)=>String(r[j]??'').trim();
    const name=text(1); const family=text(8);
    if(!Object.hasOwn(FAMILIES,family)) throw new Error(`แถว ${i+1}: กลุ่มงานไม่ถูกต้อง`);
    const company=aliases[text(5)]||text(5).toLowerCase();
    return [{sourceRow:i+1,full_name:name,nick_name:text(2)==='-'?'':text(2),bu:text(3),company_id:company,province:text(6),position:text(7),family:family as Family,tier:text(9),license_claims:text(10),notes:text(12),matchedIds:people.filter(p=>normalizeName(p.full_name)===normalizeName(name)).map(p=>p.id)}];
  });
}
