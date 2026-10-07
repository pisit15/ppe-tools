// Waste management cards for the LINE bot. Pure.
// Rules mirror the eashe.org waste overview (pisit15/safety-env-dashboard src/lib/waste.ts):
//   - recycle = disposal_method is in WASTE_METHOD_GUIDE's recycle group or waste_methods.is_recycle
//   - everything else counts as disposal; tonnes = quantity_kg / 1000
//   - cost: positive = revenue, negative = expense
//   - targets: glide path from waste_targets (recycle up, disposal down by step % per year)
import { postbackAction } from './browse';
import { MONTHS_TH, legend, stackedChart, type Series } from './charts';
import { C, flex, fmt, header, type Json, type LineMessage } from './flex';

export type WasteRow = {
  id?: number | string;
  company_id: string;
  record_date: string;
  waste_category?: string | null;
  disposal_method?: string | null;
  waste_type?: string | null;
  waste_type_th?: string | null;
  quantity_kg?: number | string | null;
  cost?: number | string | null;
  disposal_company?: string | null;
};

export type WasteMethodRow = { method_name: string; method_name_th?: string | null; is_recycle?: boolean | null };

export type WasteTargetRow = {
  company_id: string;
  base_year: number;
  base_recycle_nonhaz_ton?: number | string | null;
  base_recycle_haz_ton?: number | string | null;
  base_disposal_nonhaz_ton?: number | string | null;
  base_disposal_haz_ton?: number | string | null;
  recycle_step_pct?: number | string | null;
  disposal_step_pct?: number | string | null;
};

// Method names in the recycle group of WASTE_METHOD_GUIDE, with their Thai labels.
const GUIDE: Record<string, { th: string; recycle: boolean }> = {
  Reuse: { th: 'ใช้ซ้ำ', recycle: true },
  Recycling: { th: 'รีไซเคิล', recycle: true },
  'Other recovery operations': { th: 'นำกลับมาใช้ประโยชน์ด้วยวิธีอื่น', recycle: true },
  'Incineration with energy recovery': { th: 'เผาเพื่อเอาพลังงาน', recycle: false },
  'Incineration without energy recovery': { th: 'เผาโดยไม่ได้พลังงาน', recycle: false },
  Landfilling: { th: 'ฝังกลบ', recycle: false },
  'Other disposal operations': { th: 'กำจัดด้วยวิธีอื่น', recycle: false },
};

export const WASTE_SERIES: Series[] = [
  { key: 'rec', label: 'รีไซเคิล / นำกลับใช้', color: '#59A14F' },
  { key: 'dis', label: 'กำจัด', color: '#9AA3AE' },
];

const SITE = 'https://eashe.org/projects/waste';
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ton = (r: WasteRow) => Math.max(0, num(r.quantity_kg)) / 1000;
export const fmtTon = (t: number) => t.toLocaleString('en-US', { minimumFractionDigits: t >= 100 ? 0 : 1, maximumFractionDigits: t >= 100 ? 0 : 1 });
const fmtBaht = (b: number) => `${b < 0 ? '−' : ''}${Math.abs(Math.round(b)).toLocaleString('en-US')} บาท`;

export function recycleSet(methods: WasteMethodRow[]): Set<string> {
  return new Set([...Object.entries(GUIDE).filter(([, g]) => g.recycle).map(([k]) => k), ...methods.filter(m => m.is_recycle).map(m => m.method_name)]);
}

export const methodTh = (m: string | null | undefined, methods: WasteMethodRow[]) =>
  !m ? 'ไม่ระบุวิธีจัดการ' : GUIDE[m]?.th || methods.find(x => x.method_name === m)?.method_name_th || m;

const monthOf = (r: WasteRow) => Number(String(r.record_date).slice(5, 7)) - 1;
const yearOf = (r: WasteRow) => Number(String(r.record_date).slice(0, 4));
const typeName = (r: WasteRow) => (r.waste_type_th || '').trim() || (r.waste_type || '').trim() || 'ไม่ระบุชนิด';

export type WasteSummary = { total: number; rec: number; dis: number; haz: number; nonhaz: number; income: number; expense: number; count: number };

export function summarize(rows: WasteRow[], rset: Set<string>): WasteSummary {
  const s: WasteSummary = { total: 0, rec: 0, dis: 0, haz: 0, nonhaz: 0, income: 0, expense: 0, count: rows.length };
  for (const r of rows) {
    const t = ton(r);
    s.total += t;
    if (rset.has(r.disposal_method || '')) s.rec += t;
    else s.dis += t;
    if (r.waste_category === 'Hazardous') s.haz += t;
    else if (r.waste_category === 'Non-Hazardous') s.nonhaz += t;
    const c = num(r.cost);
    if (c > 0) s.income += c;
    else s.expense += -c;
  }
  return s;
}

export function monthlyTon(rows: WasteRow[], year: number, lastMonth: number, rset: Set<string>): ({ rec: number; dis: number } | null)[] {
  const out = Array.from({ length: 12 }, (_, i) => (i <= lastMonth ? { rec: 0, dis: 0 } : null));
  for (const r of rows) {
    if (yearOf(r) !== year) continue;
    const slot = out[monthOf(r)];
    if (!slot) continue;
    if (rset.has(r.disposal_method || '')) slot.rec += ton(r);
    else slot.dis += ton(r);
  }
  return out;
}

/** Combined glide-path target for the year (summed over the given target rows). */
export function targetFor(targets: WasteTargetRow[], year: number): { rec: number; dis: number } | null {
  let rec = 0,
    dis = 0,
    any = false;
  for (const t of targets) {
    const n = year - t.base_year;
    if (n <= 0) continue;
    any = true;
    rec += (num(t.base_recycle_nonhaz_ton) + num(t.base_recycle_haz_ton)) * (1 + (num(t.recycle_step_pct) * n) / 100);
    dis += (num(t.base_disposal_nonhaz_ton) + num(t.base_disposal_haz_ton)) * (1 - (num(t.disposal_step_pct) * n) / 100);
  }
  return any ? { rec, dis } : null;
}

function kpi(label: string, value: string, color: string): Json {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    alignItems: 'center',
    contents: [
      { type: 'text', text: value, size: 'xl', weight: 'bold', color },
      { type: 'text', text: label, size: 'xxs', color: C.sub, align: 'center', wrap: true },
    ],
  };
}

function line(label: string, value: string, color: string = C.text): Json {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'sm',
    contents: [
      { type: 'text', text: label, size: 'sm', color: C.sub, flex: 3, wrap: true },
      { type: 'text', text: value, size: 'sm', color, weight: 'bold', align: 'end', flex: 2 },
    ],
  };
}

export type WasteStatsInput = {
  c: string; // company id or 'all'
  companyLabel: string;
  year: number;
  endMonth: number; // 0-based last month shown
  minYear: number;
  maxYear: number;
  rows: WasteRow[]; // the selected year
  methods: WasteMethodRow[];
  targets: WasteTargetRow[];
  canPickCompany: boolean;
};

export function wasteCarousel(s: WasteStatsInput): LineMessage {
  const rset = recycleSet(s.methods);
  const inYear = s.rows.filter(r => yearOf(r) === s.year && monthOf(r) <= s.endMonth);
  const sum = summarize(inYear, rset);
  const pct = sum.total > 0 ? (sum.rec / sum.total) * 100 : null;
  const target = targetFor(s.targets, s.year);
  const period = `ม.ค.–${MONTHS_TH[s.endMonth]} ${s.year}`;

  const yearNav: Json[] = [];
  if (s.year > s.minYear) yearNav.push({ type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`‹ ${s.year - 1}`, { a: 'wst', c: s.c, y: s.year - 1 }, `การจัดการขยะ ${s.year - 1}`) });
  if (s.year < s.maxYear) yearNav.push({ type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`${s.year + 1} ›`, { a: 'wst', c: s.c, y: s.year + 1 }, `การจัดการขยะ ${s.year + 1}`) });

  const summary: Json = {
    type: 'bubble',
    size: 'giga',
    header: header(`การจัดการขยะ · ${period}`, s.companyLabel, '#3E7C4A'),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: inYear.length
        ? [
            { type: 'box', layout: 'horizontal', contents: [kpi('ทั้งหมด (ตัน)', fmtTon(sum.total), C.primary), kpi('รีไซเคิล (ตัน)', fmtTon(sum.rec), '#59A14F'), kpi('กำจัด (ตัน)', fmtTon(sum.dis), '#6B7280')] },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              contents: [
                { type: 'text', text: `สัดส่วนรีไซเคิล ${pct === null ? '–' : `${pct.toFixed(1)}%`}`, size: 'sm', weight: 'bold', color: C.text },
                {
                  type: 'box',
                  layout: 'vertical',
                  height: '8px',
                  backgroundColor: '#E5E7EB',
                  cornerRadius: '4px',
                  margin: 'sm',
                  contents: pct ? [{ type: 'box', layout: 'vertical', width: `${Math.min(100, Math.max(1, Math.round(pct)))}%`, height: '8px', backgroundColor: '#59A14F', cornerRadius: '4px', contents: [] }] : [],
                },
              ],
            },
            { type: 'separator', margin: 'lg' },
            line('ของเสียอันตราย', `${fmtTon(sum.haz)} ตัน`, C.danger),
            line('ของเสียไม่อันตราย', `${fmtTon(sum.nonhaz)} ตัน`),
            line('รายรับจากการขาย', fmtBaht(sum.income), '#59A14F'),
            line('ค่าใช้จ่ายกำจัด', fmtBaht(-sum.expense), C.danger),
            ...(target
              ? [
                  { type: 'separator', margin: 'lg' } as Json,
                  { type: 'text', text: `เป้าหมายทั้งปี ${s.year}`, size: 'xs', color: C.faint, margin: 'lg' } as Json,
                  line('รีไซเคิล: จริง / เป้า', `${fmtTon(sum.rec)} / ${fmtTon(target.rec)}`, sum.rec >= target.rec ? '#59A14F' : C.warn),
                  line('กำจัด: จริง / เป้า (ไม่เกิน)', `${fmtTon(sum.dis)} / ${fmtTon(target.dis)}`, sum.dis <= target.dis ? '#59A14F' : C.danger),
                ]
              : []),
            { type: 'text', text: `${fmt(sum.count)} รายการบันทึก`, size: 'xxs', color: C.faint, margin: 'lg' },
          ]
        : [{ type: 'text', text: 'ยังไม่มีข้อมูลการจัดการขยะในช่วงนี้', size: 'sm', color: C.sub, wrap: true }],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        ...(yearNav.length ? [{ type: 'box', layout: 'horizontal', spacing: 'sm', contents: yearNav } as Json] : []),
        ...(s.canPickCompany ? [{ type: 'button', style: 'secondary', height: 'sm', action: postbackAction('เลือกบริษัท', { a: 'wstpick', c: 'all', y: s.year }, 'เลือกบริษัท') } as Json] : []),
        { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'เปิด dashboard', uri: SITE } },
      ],
    },
  };

  if (!inYear.length) return flex(`การจัดการขยะ ${s.companyLabel} ${period}: ยังไม่มีข้อมูล`, summary);

  const months = monthlyTon(s.rows, s.year, s.endMonth, rset);
  const chart: Json = {
    type: 'bubble',
    size: 'giga',
    header: header(`ปริมาณขยะรายเดือน (ตัน) · ${s.year}`, s.companyLabel, '#3E7C4A'),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        stackedChart(months, WASTE_SERIES, n => (n ? (n >= 10 ? Math.round(n).toString() : n.toFixed(1)) : '0')),
        {
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
            backgroundColor: m && m.rec + m.dis > 0 ? '#EEF6EC' : '#FFFFFF',
            ...(m && m.rec + m.dis > 0 ? { action: postbackAction(MONTHS_TH[i], { a: 'wstm', c: s.c, y: s.year, m: i + 1 }, `ขยะ ${MONTHS_TH[i]} ${s.year}`) } : {}),
            contents: [{ type: 'text', text: m && m.rec + m.dis > 0 ? 'ดู' : ' ', size: 'xxs', color: '#3E7C4A', align: 'center' }],
          })) as Json[],
        },
        { type: 'text', text: 'แตะ "ดู" ใต้เดือนเพื่อดูรายการ', size: 'xxs', color: C.faint, align: 'center', margin: 'xs' },
        legend(months, WASTE_SERIES, n => `${fmtTon(n)} ตัน`),
      ],
    },
  };

  // Top waste types by tonnage.
  const byType = new Map<string, { t: number; rec: number }>();
  for (const r of inYear) {
    const k = typeName(r);
    const v = byType.get(k) || { t: 0, rec: 0 };
    v.t += ton(r);
    if (rset.has(r.disposal_method || '')) v.rec += ton(r);
    byType.set(k, v);
  }
  const top = [...byType.entries()].sort((a, b) => b[1].t - a[1].t).slice(0, 8);
  const maxT = Math.max(1e-9, ...top.map(([, v]) => v.t));
  const types: Json = {
    type: 'bubble',
    size: 'giga',
    header: header(`ชนิดของเสียที่มากที่สุด · ${period}`, s.companyLabel, '#3E7C4A'),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        ...top.map(
          ([name, v], i) =>
            ({
              type: 'box',
              layout: 'vertical',
              margin: i ? 'lg' : 'none',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: name, size: 'sm', color: C.text, flex: 1, wrap: true, maxLines: 2 },
                    { type: 'text', text: `${fmtTon(v.t)} ตัน`, size: 'sm', weight: 'bold', color: C.text, align: 'end', flex: 0 },
                  ],
                },
                {
                  type: 'box',
                  layout: 'horizontal',
                  height: '6px',
                  margin: 'xs',
                  backgroundColor: '#F1F3F5',
                  cornerRadius: '3px',
                  contents: [
                    {
                      type: 'box',
                      layout: 'horizontal',
                      width: `${Math.max(2, Math.round((v.t / maxT) * 100))}%`,
                      height: '6px',
                      contents: [
                        ...(v.rec > 0 ? [{ type: 'box', layout: 'vertical', flex: Math.max(1, Math.round((v.rec / v.t) * 100)), backgroundColor: '#59A14F', contents: [] } as Json] : []),
                        ...(v.t - v.rec > 1e-9 ? [{ type: 'box', layout: 'vertical', flex: Math.max(1, Math.round(((v.t - v.rec) / v.t) * 100)), backgroundColor: '#9AA3AE', contents: [] } as Json] : []),
                      ],
                    },
                  ],
                },
              ],
            }) as Json,
        ),
        { type: 'text', text: 'เขียว = รีไซเคิล/นำกลับใช้ · เทา = กำจัด', size: 'xxs', color: C.faint, margin: 'lg' },
      ],
    },
  };

  return flex(
    `การจัดการขยะ ${s.companyLabel} ${period}: ${fmtTon(sum.total)} ตัน · รีไซเคิล ${pct === null ? '–' : pct.toFixed(1) + '%'}`,
    { type: 'carousel', contents: [summary, chart, types] },
  );
}

const thaiDate = (d: string) => {
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MONTHS_TH[Number(m[2]) - 1]} ${Number(m[1]) + 543}` : d;
};

/** Records in one month. */
export function wasteMonthCard(rows: WasteRow[], methods: WasteMethodRow[], c: string, companyLabel: string, year: number, month: number, showCompany: boolean): LineMessage {
  const rset = recycleSet(methods);
  const list = rows.filter(r => yearOf(r) === year && monthOf(r) === month - 1).sort((a, b) => a.record_date.localeCompare(b.record_date) || ton(b) - ton(a));
  const MAX = 15;
  const total = list.reduce((s, r) => s + ton(r), 0);
  const body: Json[] = list.length
    ? [
        { type: 'text', text: `${fmt(list.length)} รายการ · รวม ${fmtTon(total)} ตัน`, size: 'xs', color: C.faint },
        ...list.slice(0, MAX).flatMap((r, k) => {
          const rec = rset.has(r.disposal_method || '');
          const row: Json = {
            type: 'box',
            layout: 'vertical',
            paddingTop: '10px',
            paddingBottom: '10px',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: typeName(r), size: 'sm', weight: 'bold', color: C.text, flex: 1, wrap: true, maxLines: 2 },
                  { type: 'text', text: `${fmt(Math.round(num(r.quantity_kg)))} กก.`, size: 'sm', weight: 'bold', color: C.text, align: 'end', flex: 0 },
                ],
              },
              {
                type: 'text',
                text: [thaiDate(r.record_date), showCompany ? r.company_id : '', r.waste_category === 'Hazardous' ? 'อันตราย' : r.waste_category === 'Non-Hazardous' ? 'ไม่อันตราย' : ''].filter(Boolean).join(' · '),
                size: 'xxs',
                color: r.waste_category === 'Hazardous' ? C.danger : C.faint,
                margin: 'xs',
              },
              { type: 'text', text: `${methodTh(r.disposal_method, methods)}${r.disposal_company ? ` · ${r.disposal_company}` : ''}`, size: 'xs', color: rec ? '#3E7C4A' : C.sub, wrap: true, maxLines: 2 },
            ],
          };
          return k === 0 ? [row] : [{ type: 'separator' } as Json, row];
        }),
        ...(list.length > MAX ? [{ type: 'text', text: `และอีก ${fmt(list.length - MAX)} รายการ ดูทั้งหมดใน dashboard`, size: 'xs', color: C.faint, margin: 'md', align: 'center' } as Json] : []),
      ]
    : [{ type: 'text', text: 'ไม่มีรายการในเดือนนี้', size: 'sm', color: C.sub }];

  return flex(`ขยะ ${companyLabel} ${MONTHS_TH[month - 1]} ${year}: ${list.length} รายการ`, {
    type: 'bubble',
    size: 'giga',
    header: header(`การจัดการขยะ · ${MONTHS_TH[month - 1]} ${year}`, companyLabel, '#3E7C4A'),
    body: { type: 'box', layout: 'vertical', contents: body },
    footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'secondary', height: 'sm', action: postbackAction(`กลับไปภาพรวม ${year}`, { a: 'wst', c, y: year }, `การจัดการขยะ ${year}`) }] },
  });
}

/** Admin: pick a company (only companies that have waste records). */
export function wasteCompanyPicker(names: Record<string, string>, ids: string[], year: number): LineMessage {
  const sorted = [...ids].sort((a, b) => (names[a] || a).localeCompare(names[b] || b, 'th'));
  return flex('เลือกบริษัทเพื่อดูการจัดการขยะ', {
    type: 'bubble',
    size: 'mega',
    header: header(`การจัดการขยะ · ${year}`, 'เลือกบริษัท', '#3E7C4A'),
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'box', layout: 'horizontal', paddingBottom: '8px', action: postbackAction('ทุกบริษัท', { a: 'wst', c: 'all', y: year }, 'การจัดการขยะ ทุกบริษัท'), contents: [{ type: 'text', text: 'ทุกบริษัท (รวม)', size: 'sm', weight: 'bold', color: '#3E7C4A' }] },
        ...(sorted.length
          ? sorted.slice(0, 24).map(id => ({ type: 'box', layout: 'horizontal', margin: 'md', action: postbackAction(id, { a: 'wst', c: id, y: year }, `การจัดการขยะ ${names[id] || id}`), contents: [{ type: 'text', text: names[id] || id, size: 'sm', color: C.text, flex: 1 }, { type: 'text', text: '›', size: 'sm', color: C.faint, flex: 0 }] }) as Json)
          : [{ type: 'text', text: 'ยังไม่มีบริษัทที่บันทึกข้อมูลขยะ', size: 'sm', color: C.sub } as Json]),
      ],
    },
  });
}
