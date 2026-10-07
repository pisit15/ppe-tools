// Year-to-date incident statistics per company for the LINE bot.
//
// Counting rules mirror the eashe.org incident dashboard so the numbers match:
//   - source of truth: pisit15/safety-env-dashboard src/lib/recordable.ts (TRC v2,
//     OSHA 1904.7, effective 2026-09-13) and src/app/projects/incidents/page.tsx
//   - work-related only (work_related === 'ใช่'), drafts excluded, employees + contractors
//   - incident month comes from incident_date (falls back to the month field)
//   - TRIR / LTIFR per 1,000,000 man-hours
// If the dashboard rules change, update this file too.

export type IncidentRow = {
  company_id: string;
  incident_type?: string | null;
  actual_severity?: string | null;
  recordable_override?: boolean | null;
  work_related?: string | null;
  incident_date?: string | null;
  month?: unknown;
};

export type ManHourRow = {
  company_id: string;
  month: number; // 1-12
  employee_manhours?: number | string | null;
  contractor_manhours?: number | string | null;
};

export type CompanyStats = {
  companyId: string;
  companyName: string;
  total: number;
  recordable: number;
  lti: number;
  firstAid: number;
  nearMiss: number;
  propertyDamage: number;
  fatalities: number;
  manHours: number;
  trir: number | null;
  ltifr: number | null;
};

const INJURY_TYPE_PARTS = ['บาดเจ็บ', 'เสียชีวิต', 'โรคจากการทำงาน'];
const NO_LOST_TIME_TYPE = 'บาดเจ็บ - ไม่หยุดงาน';

const typeOf = (i: IncidentRow) => i.incident_type || '';
const isInjuryCase = (i: IncidentRow) => INJURY_TYPE_PARTS.some(p => typeOf(i).includes(p));
const isFirstAidOnly = (i: IncidentRow) =>
  typeOf(i) === NO_LOST_TIME_TYPE &&
  (i.actual_severity || '').trim().startsWith('S1') &&
  i.recordable_override !== true;
export const isRecordable = (i: IncidentRow) => isInjuryCase(i) && !isFirstAidOnly(i);
export const isFirstAidCase = (i: IncidentRow) => isInjuryCase(i) && isFirstAidOnly(i);
export const isLtiCase = (i: IncidentRow) => {
  const t = typeOf(i);
  return (t.includes('หยุดงาน') && !t.includes('ไม่หยุดงาน')) || t === 'เสียชีวิต (Fatality)';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 0-based month, or -1 if unknown. */
export function incidentMonth(i: IncidentRow): number {
  const d = String(i.incident_date || '').match(/^\d{4}-(\d{2})-/);
  if (d && Number(d[1]) >= 1 && Number(d[1]) <= 12) return Number(d[1]) - 1;
  const n = Number(i.month);
  if (n >= 1 && n <= 12) return n - 1;
  return MONTHS.indexOf(String(i.month));
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param endMonth 0-based last month to include (the current month for YTD).
 */
export function computeCompanyStats(
  incidents: IncidentRow[],
  manHours: ManHourRow[],
  endMonth: number,
  companyNames: Record<string, string>,
): CompanyStats[] {
  const scoped = incidents.filter(i => {
    if (i.work_related !== 'ใช่') return false;
    const m = incidentMonth(i);
    return m >= 0 && m <= endMonth;
  });

  const ids = new Set<string>([...scoped.map(i => i.company_id), ...Object.keys(companyNames)]);
  const out: CompanyStats[] = [];
  for (const id of ids) {
    const inc = scoped.filter(i => i.company_id === id);
    const mh = manHours
      .filter(r => r.company_id === id && r.month >= 1 && r.month <= endMonth + 1)
      .reduce((s, r) => s + num(r.employee_manhours) + num(r.contractor_manhours), 0);
    const recordable = inc.filter(isRecordable).length;
    const lti = inc.filter(isLtiCase).length;
    out.push({
      companyId: id,
      companyName: companyNames[id] || id,
      total: inc.length,
      recordable,
      lti,
      firstAid: inc.filter(isFirstAidCase).length,
      nearMiss: inc.filter(i => i.incident_type === 'Near Miss').length,
      propertyDamage: inc.filter(i => i.incident_type === 'ทรัพย์สินเสียหาย').length,
      fatalities: inc.filter(i => typeOf(i).includes('เสียชีวิต')).length,
      manHours: mh,
      trir: mh > 0 ? (recordable / mh) * 1_000_000 : null,
      ltifr: mh > 0 ? (lti / mh) * 1_000_000 : null,
    });
  }
  return out.filter(s => s.total > 0 || s.manHours > 0).sort((a, b) => b.total - a.total || a.companyName.localeCompare(b.companyName, 'th'));
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const rate = (v: number | null) => (v === null ? '–' : v.toFixed(2));

export function formatIncidentStats(stats: CompanyStats[], year: number, endMonth: number, detailed: boolean): string {
  const period = `${year} · ม.ค.–${THAI_MONTHS[endMonth]} · เฉพาะจากการทำงาน`;
  if (stats.length === 0) return `สถิติอุบัติเหตุ ${period}\nไม่มีข้อมูล`;

  if (detailed && stats.length === 1) {
    const s = stats[0];
    return [
      `สถิติอุบัติเหตุ ${s.companyName}`,
      period,
      '',
      `เหตุการณ์ทั้งหมด ${s.total}`,
      `• บาดเจ็บที่บันทึก (TRC) ${s.recordable}`,
      `• หยุดงาน (LTI) ${s.lti}`,
      `• ปฐมพยาบาล ${s.firstAid}`,
      `• Near Miss ${s.nearMiss}`,
      `• ทรัพย์สินเสียหาย ${s.propertyDamage}`,
      `• เสียชีวิต ${s.fatalities}`,
      '',
      `TRIR ${rate(s.trir)} · LTIFR ${rate(s.ltifr)}`,
      s.manHours > 0 ? `ชั่วโมงทำงาน ${Math.round(s.manHours).toLocaleString('en-US')}` : 'ยังไม่มีชั่วโมงทำงาน จึงคำนวณอัตราไม่ได้',
    ].join('\n');
  }

  const sum = stats.reduce(
    (a, s) => ({ total: a.total + s.total, recordable: a.recordable + s.recordable, lti: a.lti + s.lti, mh: a.mh + s.manHours }),
    { total: 0, recordable: 0, lti: 0, mh: 0 },
  );
  const lines = [
    `สถิติอุบัติเหตุ แยกบริษัท`,
    period,
    `รวม ${sum.total} เหตุ · TRC ${sum.recordable} · LTI ${sum.lti}`,
    `TRIR ${rate(sum.mh > 0 ? (sum.recordable / sum.mh) * 1_000_000 : null)} · LTIFR ${rate(sum.mh > 0 ? (sum.lti / sum.mh) * 1_000_000 : null)}`,
    '',
    'บริษัท: เหตุ / TRC / LTI',
    ...stats.map(s => `• ${s.companyName}: ${s.total} / ${s.recordable} / ${s.lti}`),
  ];
  return lines.join('\n');
}
