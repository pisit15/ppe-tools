/**
 * Typed dates, the way they are written in Thailand: day/month/year, Buddhist era by default.
 * Used by the First Aid date field so nobody has to read a browser's month/day/year picker.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** ISO yyyy-mm-dd → "31/12/2570" (Buddhist era). */
export function formatThaiInput(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : '';
}

/**
 * The year a person meant. Four digits: 2400 and above is the Buddhist era, otherwise the Christian era.
 * Two digits are read both ways (69 → 2569 = 2026, or 2069) and the year nearer to today wins — medicine boxes
 * print "EXP 12/27" in the Christian era while people write "31/12/70" in the Buddhist era, and this reads both.
 */
function resolveYear(raw: string, todayYear: number): number | null {
  const n = Number(raw);
  if (raw.length === 4) return n >= 2400 ? n - 543 : n;
  if (raw.length !== 2) return null;
  const buddhist = 2500 + n - 543; const christian = 2000 + n;
  return Math.abs(buddhist - todayYear) <= Math.abs(christian - todayYear) ? buddhist : christian;
}

export type ParsedThaiDate = { iso: string; /** Only month and year were typed: the date is the last day of that month. */ monthOnly: boolean };

/**
 * Accepts 31/12/2570 · 31-12-70 · 31.12.2027 · 31122570 · 311270, and — when `monthOnly` is allowed (expiry dates) —
 * 12/2570 · 12/27 · 122570 · 1227, which mean the end of that month. Returns null for anything that is not a real date.
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
  const y = resolveYear(year, todayYear); const m = Number(month);
  if (y === null || y < 1900 || y > 2200 || m < 1 || m > 12) return null;
  const d = day === null ? lastDay(y, m) : Number(day);
  if (d < 1 || d > lastDay(y, m)) return null;
  return { iso: `${y}-${pad(m)}-${pad(d)}`, monthOnly: day === null };
}
