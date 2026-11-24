/**
 * First Aid dates. Shown and typed as day/month/year in the Christian era (ค.ศ.), because that is how the expiry date
 * is printed on a medicine box. A Buddhist-era year (พ.ศ.) that somebody types is still understood and converted.
 * The rest of EA SHE Tools shows Buddhist-era years; this module is the one place First Aid formats a date.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/**
 * ISO yyyy-mm-dd → "24 พ.ย. 2026". The year is always written with four digits: a two-digit year cannot be told apart
 * from a Buddhist-era one (71 = 2571 = 2028) by somebody used to the other calendar. `short` is kept for callers that
 * ask for the compact form and no longer changes the year.
 */
export function faDate(ymd: string | null | undefined, opts: { withDay?: boolean; short?: boolean } = {}) {
  if (!ymd) return '–';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '–';
  const day = opts.withDay ? `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ` : '';
  return `${day}${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}
/** 2026-11 → "พ.ย. 2026" (long: "พฤศจิกายน 2026"). */
export function faPeriod(period: string, long = false) {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`;
}
/** Timestamp → "24 พ.ย. 2026 18:32" in Bangkok time. */
export function faDateTime(iso: string | null | undefined) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  const bk = new Date(d.getTime() + 7 * 3600 * 1000).toISOString();
  return `${faDate(bk.slice(0, 10))} ${bk.slice(11, 16)}`;
}

/** ISO yyyy-mm-dd → "31/12/2027", the text shown in a date field. */
export function formatThaiInput(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/**
 * The year a person meant. Four digits: 2400 and above is the Buddhist era, otherwise the Christian era.
 * Two digits are read both ways (27 → 2027, or 2527 = 1984) and the year nearer to today wins — a box prints
 * "EXP 12/27" in the Christian era while some people still write "31/12/70" in the Buddhist era, and this reads both.
 * `buddhist` says the typed year was converted, so the field can tell the person.
 */
function resolveYear(raw: string, todayYear: number): { year: number; buddhist: boolean } | null {
  const n = Number(raw);
  if (raw.length === 4) return n >= 2400 ? { year: n - 543, buddhist: true } : { year: n, buddhist: false };
  if (raw.length !== 2) return null;
  const buddhist = 2500 + n - 543; const christian = 2000 + n;
  return Math.abs(buddhist - todayYear) < Math.abs(christian - todayYear) ? { year: buddhist, buddhist: true } : { year: christian, buddhist: false };
}

export type ParsedThaiDate = { iso: string; /** Only month and year were typed: the date is the last day of that month. */ monthOnly: boolean; /** The year was typed in the Buddhist era and converted. */ buddhist: boolean };

/**
 * Accepts 31/12/2027 · 31-12-27 · 31.12.2570 · 31122027 · 311227, and — when `monthOnly` is allowed (expiry dates) —
 * 12/2027 · 12/27 · 122027 · 1227, which mean the end of that month. Returns null for anything that is not a real date.
 */
export function parseThaiDate(text: string, opts: { monthOnly?: boolean; today?: string } = {}): ParsedThaiDate | null {
  const todayYear = Number((opts.today || new Date().toISOString()).slice(0, 4));
  const clean = text.trim().replace(/[.\-\s]+/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  if (!clean) return null;
  let day: string | null = null, month = '', year = '';
  const parts = clean.split('/');
  if (parts.some(p => !/^\d+$/.test(p))) return null;
  if (parts.length === 3) [day, month, year] = parts;
  else if (parts.length === 2 && opts.monthOnly) [month, year] = parts;
  else if (parts.length === 1) {
    const d = parts[0];
    const plausibleYear = (y: string) => { const n = Number(y); return (n >= 2400 && n <= 2699) || (n >= 1990 && n <= 2150); };
    if (d.length === 8) { day = d.slice(0, 2); month = d.slice(2, 4); year = d.slice(4); }
    else if (d.length === 6 && opts.monthOnly && plausibleYear(d.slice(2)) && Number(d.slice(0, 2)) >= 1 && Number(d.slice(0, 2)) <= 12) { month = d.slice(0, 2); year = d.slice(2); }
    else if (d.length === 6) { day = d.slice(0, 2); month = d.slice(2, 4); year = d.slice(4); }
    else if (d.length === 4 && opts.monthOnly) { month = d.slice(0, 2); year = d.slice(2); }
    else return null;
  } else return null;
  if (month.length > 2 || (day !== null && day.length > 2) || (year.length !== 2 && year.length !== 4)) return null;
  const resolved = resolveYear(year, todayYear); const m = Number(month);
  if (resolved === null) return null;
  const y = resolved.year;
  if (y < 1900 || y > 2200 || m < 1 || m > 12) return null;
  const d = day === null ? lastDay(y, m) : Number(day);
  if (d < 1 || d > lastDay(y, m)) return null;
  return { iso: `${y}-${pad(m)}-${pad(d)}`, monthOnly: day === null, buddhist: resolved.buddhist };
}
