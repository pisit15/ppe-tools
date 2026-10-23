// Reporting periods for the procurement pages. Pure (no I/O): shared by API routes, pages and tests.
//
// Rules (one definition everywhere):
// - A period is a calendar year (Jan–Dec) or "all years".
// - The running year is cut at the data's as-of date (the day the Odoo data was imported, Bangkok time).
// - Every year is compared with the same span of the previous year (1 Jan – same day), never with a full year.
// - When the data for a measure starts late in a year, the page says so instead of showing a misleading change.

export const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export type PeriodSel = number | 'all';
export type Measure = 'pr' | 'po' | 'quote';
export type Coverage = Record<Measure, string | null>;
/** Period facts computed once per dataset and sent with every API response (inside ProcMeta). */
export type PeriodMeta = { as_of: string; years: number[]; coverage: Coverage };
export type Range = { from: string; to: string };
export type PeriodInfo = {
  sel: PeriodSel;
  range: Range | null; // null = all data
  prev: (Range & { year: number }) | null; // same span one year earlier, when there is data to compare with
  partial: boolean; // the selected year is still running
  label: string; // "ปี 2569 · 1 ม.ค. – 23 ต.ค. 2569"
  prevLabel: string | null; // "1 ม.ค. – 23 ต.ค. 2568"
  notes: string[]; // data-coverage warnings about the selected period
  compareNotes: string[]; // warnings about the comparison with last year
};

const MEASURE_NAME: Record<Measure, string> = { pr: 'PR', po: 'PO', quote: 'ใบเสนอราคา' };
/** Gaps shorter than this at the start of the data are normal (first document of the year), not a coverage problem. */
const COVERAGE_GRACE_DAYS = 45;

export const be = (y: number) => y + 543;

/** "2026-10-23" -> "23 ต.ค. 2569" (or "23 ต.ค." without the year) */
export function thaiDay(d: string, withYear = true) {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return '–';
  return `${day} ${MONTHS_TH[m - 1]}${withYear ? ` ${be(y)}` : ''}`;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const days = (a: string, b: string) => (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;

/** URL value -> period; anything that is not a year with data means "all years". */
export function parsePeriod(v: string | null | undefined, years: number[]): PeriodSel {
  if (!v || !/^\d{4}$/.test(v)) return 'all';
  const n = Number(v);
  return years.includes(n) ? n : 'all';
}

export function yearRange(year: number, asOf: string): Range {
  return { from: `${year}-01-01`, to: year === Number(asOf.slice(0, 4)) ? asOf.slice(0, 10) : `${year}-12-31` };
}

/** 1 Jan – the same day one year earlier (29 Feb becomes 28 Feb). */
export function prevRange(year: number, asOf: string): Range {
  const mmdd = yearRange(year, asOf).to.slice(5);
  const py = year - 1;
  return { from: `${py}-01-01`, to: mmdd === '02-29' && !isLeap(py) ? `${py}-02-28` : `${py}-${mmdd}` };
}

export function inRange(d: string | null | undefined, r: Range | null) {
  if (!r) return true;
  if (!d) return false;
  const day = d.slice(0, 10);
  return day >= r.from && day <= r.to;
}

export function periodInfo(sel: PeriodSel, meta: PeriodMeta, measure: Measure): PeriodInfo {
  const start = meta.coverage[measure];
  const name = MEASURE_NAME[measure];
  if (sel === 'all') {
    const first = start ?? (meta.years.length ? `${Math.min(...meta.years)}-01-01` : meta.as_of);
    return { sel, range: null, prev: null, partial: false, label: `ทุกปี · ${thaiDay(first)} – ${thaiDay(meta.as_of)}`, prevLabel: null, notes: [], compareNotes: [] };
  }
  const range = yearRange(sel, meta.as_of);
  const partial = range.to !== `${sel}-12-31`;
  const notes: string[] = [], compareNotes: string[] = [];
  const lateStart = (from: string) => !!start && start > from && days(from, start) > COVERAGE_GRACE_DAYS;
  if (lateStart(range.from) && start! <= range.to) notes.push(`ข้อมูล ${name} ในระบบเริ่ม ${thaiDay(start!)} — ปี ${be(sel)} มีข้อมูลไม่ครบปี`);
  let prev: PeriodInfo['prev'] = null;
  if (meta.years.includes(sel - 1)) {
    const pr = prevRange(sel, meta.as_of);
    if (start && start > pr.to) compareNotes.push(`ช่วงเดียวกันปี ${be(sel - 1)} ยังไม่มีข้อมูล ${name} ในระบบ — จึงไม่แสดงการเปลี่ยนแปลง`);
    else {
      prev = { ...pr, year: sel - 1 };
      if (lateStart(pr.from)) compareNotes.push(`ข้อมูล ${name} ปี ${be(sel - 1)} เริ่ม ${thaiDay(start!)} — ฐานเทียบไม่ครบ ตัวเลขเพิ่มขึ้นจะดูสูงกว่าความจริง`);
    }
  }
  const span = (r: Range) => (r.from.slice(5) === '01-01' && r.to.slice(5) === '12-31' ? `ทั้งปี ${be(Number(r.from.slice(0, 4)))}` : `${thaiDay(r.from, false)} – ${thaiDay(r.to)}`);
  return { sel, range, prev, partial, label: `ปี ${be(sel)} · ${span(range)}`, prevLabel: prev ? span(prev) : null, notes, compareNotes };
}

/** Percent change; null when there is no base to compare with. */
export function pctChange(cur: number, prev: number | null | undefined) {
  if (prev === null || prev === undefined || !(prev > 0)) return null;
  return ((cur - prev) / prev) * 100;
}

/** Years present in the data (newest first), never later than the as-of year. */
export function dataYears(dates: (string | null | undefined)[], asOf: string) {
  const max = Number(asOf.slice(0, 4));
  const set = new Set<number>();
  for (const d of dates) {
    const y = d ? Number(d.slice(0, 4)) : NaN;
    if (y && y <= max) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}
