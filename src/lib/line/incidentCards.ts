// Incident cards for the LINE bot: summary + monthly chart + LTIFR/TRIR, month list, detail.
// Counting rules come from incidentStats.ts (mirrors the eashe.org dashboard). Pure.
import { postbackAction } from './browse';
import { INCIDENT_SERIES, MONTHS_TH, seriesLegend, seriesOf, stackedMonthlyChart, valueBars, type MonthCounts } from './charts';
import { C, flex, fmt, header, pill, type Json, type LineMessage } from './flex';
import { incidentMonth, isFirstAidCase, isLtiCase, isRecordable, type IncidentRow, type ManHourRow } from './incidentStats';

export type IncidentListRow = IncidentRow & {
  id: string;
  year: number;
  incident_no?: string | null;
  area?: string | null;
  description?: string | null;
};

export type IncidentDetailRow = IncidentListRow & {
  incident_time?: string | null;
  activity?: string | null;
  report_status?: string | null;
  immediate_cause?: string | null;
  corrective_action_1?: string | null;
  ca1_status?: string | null;
  ca1_due_date?: string | null;
  corrective_action_2?: string | null;
  ca2_status?: string | null;
  ca2_due_date?: string | null;
};

const SITE = 'https://eashe.org/projects/incidents';
const workRelated = (i: IncidentRow) => i.work_related === 'ใช่';
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rate = (v: number | null) => (v === null ? '–' : v.toFixed(2));

export function thaiDate(d?: string | null): string {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d || '–';
  return `${Number(m[3])} ${MONTHS_TH[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

/** Last month (0-based) to include: the dashboard default for the current year, else the full year. */
export function endMonthFor(year: number, now: { year: number; month0: number }): number {
  if (year < now.year) return 11;
  return Math.max(0, now.month0 - 1);
}

/** Per-month stacked counts; months after `lastMonth` are null (future). */
export function monthlyCounts(incidents: IncidentRow[], year: number, lastMonth: number, yearOf: (i: IncidentRow) => number): (MonthCounts | null)[] {
  const out: (MonthCounts | null)[] = Array.from({ length: 12 }, (_, i) => (i <= lastMonth ? { pd: 0, nlt: 0, lt3: 0, lt4: 0, oth: 0 } : null));
  for (const i of incidents) {
    if (!workRelated(i) || yearOf(i) !== year) continue;
    const m = incidentMonth(i);
    const slot = m >= 0 ? out[m] : null;
    if (slot) slot[seriesOf(i.incident_type)] += 1;
  }
  return out;
}

export type YearRate = { year: number; trir: number | null; ltifr: number | null; recordable: number; lti: number; manHours: number };

export function yearRates(incidents: IncidentListRow[], manHours: (ManHourRow & { year: number })[], years: number[], endMonth: number): YearRate[] {
  return years.map(y => {
    const inc = incidents.filter(i => i.year === y && workRelated(i)).filter(i => {
      const m = incidentMonth(i);
      return m >= 0 && m <= endMonth;
    });
    const mh = manHours.filter(r => r.year === y && r.month >= 1 && r.month <= endMonth + 1).reduce((s, r) => s + num(r.employee_manhours) + num(r.contractor_manhours), 0);
    const recordable = inc.filter(isRecordable).length;
    const lti = inc.filter(isLtiCase).length;
    return { year: y, recordable, lti, manHours: mh, trir: mh > 0 ? (recordable / mh) * 1e6 : null, ltifr: mh > 0 ? (lti / mh) * 1e6 : null };
  });
}

function kpi(label: string, value: string, color: string): Json {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    alignItems: 'center',
    contents: [
      { type: 'text', text: value, size: 'xl', weight: 'bold', color },
      { type: 'text', text: label, size: 'xxs', color: C.sub },
    ],
  };
}

function line(label: string, value: string, color: string = C.text): Json {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: C.sub, flex: 3 },
      { type: 'text', text: value, size: 'sm', color, weight: 'bold', align: 'end', flex: 2 },
    ],
  };
}

export type StatsInput = {
  c: string; // company id or 'all'
  companyLabel: string;
  year: number;
  endMonth: number; // 0-based, for the selected year
  minYear: number;
  maxYear: number;
  incidents: IncidentListRow[]; // selected year and the comparison years
  manHours: (ManHourRow & { year: number })[];
  canPickCompany: boolean;
};

export function statsCarousel(s: StatsInput): LineMessage {
  const period = `ม.ค.–${MONTHS_TH[s.endMonth]} ${s.year}`;
  const months = monthlyCounts(s.incidents, s.year, s.endMonth, i => (i as IncidentListRow).year);
  const scoped = s.incidents.filter(i => i.year === s.year && workRelated(i)).filter(i => {
    const m = incidentMonth(i);
    return m >= 0 && m <= s.endMonth;
  });
  const years = [s.year - 3, s.year - 2, s.year - 1, s.year].filter(y => y >= s.minYear);
  const rates = yearRates(s.incidents, s.manHours, years, s.endMonth);
  const cur = rates[rates.length - 1];

  const yearNav: Json[] = [];
  if (s.year > s.minYear) yearNav.push({ type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`‹ ${s.year - 1}`, { a: 'inc', c: s.c, y: s.year - 1 }, `สถิติอุบัติเหตุ ${s.year - 1}`) });
  if (s.year < s.maxYear) yearNav.push({ type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`${s.year + 1} ›`, { a: 'inc', c: s.c, y: s.year + 1 }, `สถิติอุบัติเหตุ ${s.year + 1}`) });

  const summary: Json = {
    type: 'bubble',
    size: 'giga',
    header: header(`สถิติอุบัติเหตุ · ${period}`, s.companyLabel, C.primary),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'box', layout: 'horizontal', contents: [kpi('เหตุการณ์', fmt(scoped.length), C.primary), kpi('TRC', fmt(cur?.recordable ?? 0), '#3B6CB7'), kpi('LTI', fmt(cur?.lti ?? 0), '#C8443A')] },
        { type: 'box', layout: 'horizontal', margin: 'lg', contents: [kpi('TRIR', rate(cur?.trir ?? null), '#3B6CB7'), kpi('LTIFR', rate(cur?.ltifr ?? null), '#C8443A')] },
        { type: 'separator', margin: 'lg' },
        line('ปฐมพยาบาล (ไม่นับใน TRC)', fmt(scoped.filter(isFirstAidCase).length)),
        line('Near Miss', fmt(scoped.filter(i => i.incident_type === 'Near Miss').length)),
        line('ทรัพย์สินเสียหาย', fmt(scoped.filter(i => i.incident_type === 'ทรัพย์สินเสียหาย').length)),
        line('เสียชีวิต', fmt(scoped.filter(i => (i.incident_type || '').includes('เสียชีวิต')).length), C.danger),
        { type: 'text', text: cur && cur.manHours > 0 ? `ชั่วโมงทำงาน ${fmt(Math.round(cur.manHours))}` : 'ยังไม่มีชั่วโมงทำงาน จึงคำนวณอัตราไม่ได้', size: 'xxs', color: C.faint, margin: 'lg', wrap: true },
        { type: 'text', text: 'เฉพาะจากการทำงาน · TRC v2 (OSHA 1904.7) · ต่อ 1 ล้านชั่วโมง', size: 'xxs', color: C.faint, wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...(yearNav.length ? [{ type: 'box', layout: 'horizontal', spacing: 'sm', contents: yearNav } as Json] : []),
        ...(s.canPickCompany ? [{ type: 'button', style: 'secondary', height: 'sm', action: postbackAction('เลือกบริษัท', { a: 'incpick', c: 'all', y: s.year }, 'เลือกบริษัท') } as Json] : []),
        { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิด dashboard', uri: SITE } },
      ],
    },
  };

  // Tap a month (the label row) to list that month's incidents.
  const monthTaps: Json = {
    type: 'box',
    layout: 'horizontal',
    spacing: '3px',
    margin: 'md',
    contents: months.map((m, i) => ({
      type: 'box',
      layout: 'vertical',
      flex: 1,
      paddingTop: '4px',
      paddingBottom: '4px',
      cornerRadius: '4px',
      backgroundColor: m ? '#EEF3FA' : '#FFFFFF',
      ...(m ? { action: postbackAction(MONTHS_TH[i], { a: 'incm', c: s.c, y: s.year, m: i + 1 }, `อุบัติเหตุ ${MONTHS_TH[i]} ${s.year}`) } : {}),
      contents: [{ type: 'text', text: m ? 'ดู' : ' ', size: 'xxs', color: C.primary, align: 'center' }],
    })) as Json[],
  };

  const chart: Json = {
    type: 'bubble',
    size: 'giga',
    header: header(`จำนวนเหตุการณ์รายเดือน · ${s.year}`, s.companyLabel, C.primary),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        stackedMonthlyChart(months),
        monthTaps,
        { type: 'text', text: 'แตะ "ดู" ใต้เดือนเพื่อดูรายการเหตุ', size: 'xxs', color: C.faint, align: 'center', margin: 'xs' },
        seriesLegend(months),
      ],
    },
    ...(yearNav.length ? { footer: { type: 'box', layout: 'horizontal', spacing: 'sm', contents: yearNav } } : {}),
  };

  const labels = rates.map(r => String(r.year));
  const hi = rates.length - 1;
  const ratesBubble: Json = {
    type: 'bubble',
    size: 'giga',
    header: header(`อัตราต่อ 1 ล้านชั่วโมง · ม.ค.–${MONTHS_TH[s.endMonth]}`, s.companyLabel, C.primary),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'LTIFR', size: 'sm', weight: 'bold', color: C.text },
        valueBars(labels, rates.map(r => r.ltifr), '#C8443A', hi),
        { type: 'separator', margin: 'lg' },
        { type: 'text', text: 'TRIR', size: 'sm', weight: 'bold', color: C.text, margin: 'lg' },
        valueBars(labels, rates.map(r => r.trir), '#3B6CB7', hi),
        { type: 'text', text: 'เทียบช่วงเดียวกันของแต่ละปี · "–" = ไม่มีชั่วโมงทำงาน', size: 'xxs', color: C.faint, margin: 'lg', wrap: true },
      ],
    },
  };

  return flex(
    `สถิติอุบัติเหตุ ${s.companyLabel} ${period}: ${scoped.length} เหตุ · TRC ${cur?.recordable ?? 0} · LTI ${cur?.lti ?? 0}`,
    { type: 'carousel', contents: [summary, chart, ratesBubble] },
  );
}

const seriesColor = (t?: string | null) => INCIDENT_SERIES.find(x => x.key === seriesOf(t))?.color || C.faint;
// Yellow is too light for text on white; use a darker shade for labels.
const labelColor = (t?: string | null) => (seriesOf(t) === 'nlt' ? '#A88B1F' : seriesColor(t));
const shortType = (t?: string | null) => (t || 'ไม่ระบุ').replace('บาดเจ็บ - ', '').replace(/\s*\(.*\)$/, '');

/** Incidents in one month; tap a row for detail. */
export function monthListCard(rows: IncidentListRow[], c: string, companyLabel: string, year: number, month: number, showCompany: boolean): LineMessage {
  const list = rows.filter(workRelated).sort((a, b) => String(a.incident_date).localeCompare(String(b.incident_date)));
  const MAX = 15;
  const body: Json[] = list.length
    ? [
        { type: 'text', text: `${fmt(list.length)} เหตุการณ์ · แตะเพื่อดูรายละเอียด`, size: 'xs', color: C.faint },
        ...list.slice(0, MAX).flatMap((r, k) => {
          const row: Json = {
            type: 'box',
            layout: 'vertical',
            paddingTop: '10px',
            paddingBottom: '10px',
            action: postbackAction('รายละเอียด', { a: 'incd', c, id: r.id }, `เหตุ ${r.incident_no || thaiDate(r.incident_date)}`),
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                spacing: 'sm',
                alignItems: 'center',
                contents: [
                  { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: seriesColor(r.incident_type), contents: [] },
                  { type: 'text', text: `${thaiDate(r.incident_date)}${showCompany ? ` · ${r.company_id}` : ''}`, size: 'xs', color: C.sub, flex: 1 },
                  { type: 'text', text: shortType(r.incident_type), size: 'xxs', color: labelColor(r.incident_type), weight: 'bold', align: 'end', flex: 0 },
                ],
              },
              { type: 'text', text: (r.description || r.area || '–').replace(/\s+/g, ' ').slice(0, 120), size: 'sm', color: C.text, wrap: true, maxLines: 2, margin: 'xs' },
            ],
          };
          return k === 0 ? [row] : [{ type: 'separator' } as Json, row];
        }),
        ...(list.length > MAX ? [{ type: 'text', text: `และอีก ${fmt(list.length - MAX)} เหตุ ดูทั้งหมดใน dashboard`, size: 'xs', color: C.faint, margin: 'md', align: 'center' } as Json] : []),
      ]
    : [{ type: 'text', text: 'ไม่มีเหตุการณ์จากการทำงานในเดือนนี้', size: 'sm', color: C.sub }];

  return flex(`อุบัติเหตุ ${companyLabel} ${MONTHS_TH[month - 1]} ${year}: ${list.length} เหตุ`, {
    type: 'bubble',
    size: 'giga',
    header: header(`อุบัติเหตุ · ${MONTHS_TH[month - 1]} ${year}`, companyLabel, C.primary),
    body: { type: 'box', layout: 'vertical', contents: body },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`กลับไปสถิติ ${year}`, { a: 'inc', c, y: year }, `สถิติอุบัติเหตุ ${year}`) }] },
  });
}

function field(label: string, value?: string | null): Json[] {
  const v = (value || '').trim();
  if (!v) return [];
  return [
    { type: 'text', text: label, size: 'xs', color: C.faint, margin: 'lg' },
    { type: 'text', text: v.slice(0, 1200), size: 'sm', color: C.text, wrap: true },
  ];
}

function action(label: string, text?: string | null, status?: string | null, due?: string | null): Json[] {
  const t = (text || '').trim();
  if (!t) return [];
  const done = /เสร็จ|ปิด|closed|done|complete/i.test(status || '');
  return [
    { type: 'text', text: label, size: 'xs', color: C.faint, margin: 'lg' },
    { type: 'text', text: t.slice(0, 600), size: 'sm', color: C.text, wrap: true },
    {
      type: 'box',
      layout: 'horizontal',
      margin: 'xs',
      spacing: 'sm',
      contents: [
        ...(status ? [pill(status.slice(0, 20), done ? C.ok : C.warn, done ? C.okBg : C.warnBg)] : []),
        { type: 'text', text: due ? `กำหนด ${thaiDate(due)}` : ' ', size: 'xxs', color: C.faint, flex: 1, gravity: 'center' },
      ],
    },
  ];
}

/** One incident. Never includes injured persons' names (those live in injured_persons). */
export function incidentDetailCard(r: IncidentDetailRow, companyLabel: string): LineMessage {
  const color = seriesOf(r.incident_type) === 'nlt' ? '#C9A227' : seriesColor(r.incident_type);
  const when = [thaiDate(r.incident_date), (r.incident_time || '').slice(0, 5)].filter(Boolean).join(' · ');
  return flex(`เหตุ ${r.incident_no || ''} ${companyLabel}: ${shortType(r.incident_type)}`, {
    type: 'bubble',
    size: 'giga',
    header: header(`${companyLabel} · ${r.incident_no || 'ไม่มีเลขที่'}`, shortType(r.incident_type), color),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        line('วันเวลา', when || '–'),
        line('พื้นที่', (r.area || '–').slice(0, 60)),
        ...(r.actual_severity ? [line('ความรุนแรง', r.actual_severity.slice(0, 40))] : []),
        ...(r.report_status ? [line('สถานะรายงาน', r.report_status.slice(0, 40))] : []),
        { type: 'separator', margin: 'lg' },
        ...field('รายละเอียดเหตุการณ์', r.description),
        ...field('กิจกรรมขณะเกิดเหตุ', r.activity),
        ...field('สาเหตุทันที', r.immediate_cause),
        ...action('มาตรการแก้ไข 1', r.corrective_action_1, r.ca1_status, r.ca1_due_date),
        ...action('มาตรการแก้ไข 2', r.corrective_action_2, r.ca2_status, r.ca2_due_date),
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`กลับไป ${MONTHS_TH[Math.max(0, incidentMonth(r))]}`, { a: 'incm', c: r.company_id, y: r.year, m: Math.max(0, incidentMonth(r)) + 1 }, `อุบัติเหตุ ${MONTHS_TH[Math.max(0, incidentMonth(r))]} ${r.year}`) },
        { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิด dashboard', uri: SITE } },
      ],
    },
  });
}

/** Admin: pick a company for incident stats. */
export function incidentCompanyPicker(names: Record<string, string>, ids: string[], year: number): LineMessage {
  const sorted = [...ids].sort((a, b) => (names[a] || a).localeCompare(names[b] || b, 'th'));
  return flex('เลือกบริษัทเพื่อดูสถิติอุบัติเหตุ', {
    type: 'bubble',
    size: 'mega',
    header: header(`สถิติอุบัติเหตุ · ${year}`, 'เลือกบริษัท', C.primary),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'box', layout: 'horizontal', paddingBottom: '8px', action: postbackAction('ทุกบริษัท', { a: 'inc', c: 'all', y: year }, 'สถิติอุบัติเหตุ ทุกบริษัท'), contents: [{ type: 'text', text: 'ทุกบริษัท (รวม)', size: 'sm', weight: 'bold', color: C.primary }] },
        ...sorted.slice(0, 24).map(id => ({ type: 'box', layout: 'horizontal', margin: 'md', action: postbackAction(id, { a: 'inc', c: id, y: year }, `สถิติอุบัติเหตุ ${names[id] || id}`), contents: [{ type: 'text', text: names[id] || id, size: 'sm', color: C.text, flex: 1 }, { type: 'text', text: '›', size: 'sm', color: C.faint, flex: 0 }] }) as Json),
      ],
    },
  });
}

