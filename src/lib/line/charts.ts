// Bar charts drawn with Flex boxes (LINE has no chart component). Pure.
import { C, fmt, type Json } from './flex';

export const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// Same categories and order as the eashe.org monthly chart.
export const INCIDENT_SERIES = [
  { key: 'pd', label: 'ทรัพย์สินเสียหาย', color: '#3B6CB7' },
  { key: 'nlt', label: 'บาดเจ็บไม่หยุดงาน', color: '#EFD567' },
  { key: 'lt3', label: 'หยุดงาน ≤ 3 วัน', color: '#E3A42B' },
  { key: 'lt4', label: 'หยุดงาน > 3 วัน', color: '#C8443A' },
  { key: 'oth', label: 'อื่น ๆ / ไม่ระบุ', color: '#6B7280' },
] as const;

export type SeriesKey = (typeof INCIDENT_SERIES)[number]['key'];
export type MonthCounts = Record<SeriesKey, number>;

export function seriesOf(incidentType?: string | null): SeriesKey {
  const t = incidentType || '';
  if (t === 'ทรัพย์สินเสียหาย') return 'pd';
  if (t === 'บาดเจ็บ - ไม่หยุดงาน') return 'nlt';
  if (t === 'บาดเจ็บ - หยุดงาน ≤ 3 วัน') return 'lt3';
  if (t === 'บาดเจ็บ - หยุดงาน > 3 วัน' || t === 'เสียชีวิต (Fatality)') return 'lt4';
  return 'oth';
}

const CHART_H = 130; // px for the tallest bar

/**
 * Stacked monthly columns. `months[i] === null` means a future month (drawn as a dash).
 */
export function stackedMonthlyChart(months: (MonthCounts | null)[]): Json {
  const totals = months.map(m => (m ? INCIDENT_SERIES.reduce((s, x) => s + m[x.key], 0) : 0));
  const max = Math.max(1, ...totals);
  const cols: Json[] = months.map((m, i) => {
    const segs: Json[] = m
      ? INCIDENT_SERIES.filter(x => m[x.key] > 0)
          .reverse() // top of the stack first
          .map(x => ({
            type: 'box',
            layout: 'vertical',
            height: `${Math.max(2, Math.round((m[x.key] / max) * CHART_H))}px`,
            backgroundColor: x.color,
            contents: [],
          }))
      : [];
    return {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: [
        { type: 'text', text: m ? (totals[i] ? fmt(totals[i]) : '0') : '–', size: 'xxs', color: m ? C.text : C.faint, align: 'center', weight: 'bold' },
        { type: 'box', layout: 'vertical', height: `${CHART_H}px`, justifyContent: 'flex-end', margin: 'xs', contents: segs },
        { type: 'box', layout: 'vertical', height: '1px', backgroundColor: '#CCCCCC', contents: [] },
        { type: 'text', text: MONTHS_TH[i], size: 'xxs', color: C.sub, align: 'center', margin: 'xs' },
      ],
    } as Json;
  });
  return { type: 'box', layout: 'horizontal', spacing: '3px', contents: cols };
}

export function seriesLegend(months: (MonthCounts | null)[]): Json {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'lg',
    spacing: 'xs',
    contents: INCIDENT_SERIES.map(x => {
      const sum = months.reduce((s, m) => s + (m ? m[x.key] : 0), 0);
      return {
        type: 'box',
        layout: 'horizontal',
        alignItems: 'center',
        spacing: 'sm',
        contents: [
          { type: 'box', layout: 'vertical', width: '10px', height: '10px', backgroundColor: x.color, cornerRadius: '2px', contents: [] },
          { type: 'text', text: x.label, size: 'xs', color: C.text, flex: 1 },
          { type: 'text', text: fmt(sum), size: 'xs', color: C.text, weight: 'bold', align: 'end', flex: 0 },
        ],
      } as Json;
    }),
  };
}

/** Single-series vertical bars with the value above each bar (e.g. LTIFR by year). */
export function valueBars(labels: string[], values: (number | null)[], color: string, highlight = -1): Json {
  const max = Math.max(0.0001, ...values.map(v => v ?? 0));
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    contents: labels.map((label, i) => {
      const v = values[i];
      return {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        contents: [
          { type: 'text', text: v === null ? '–' : v.toFixed(2), size: 'xs', weight: 'bold', align: 'center', color: i === highlight ? color : C.text },
          {
            type: 'box',
            layout: 'vertical',
            height: '90px',
            justifyContent: 'flex-end',
            margin: 'xs',
            contents:
              v && v > 0
                ? [{ type: 'box', layout: 'vertical', height: `${Math.max(2, Math.round((v / max) * 90))}px`, backgroundColor: i === highlight ? color : `${color}99`, cornerRadius: '3px', contents: [] }]
                : [],
          },
          { type: 'box', layout: 'vertical', height: '1px', backgroundColor: '#CCCCCC', contents: [] },
          { type: 'text', text: label, size: 'xxs', color: i === highlight ? C.text : C.sub, align: 'center', margin: 'xs', weight: i === highlight ? 'bold' : 'regular' },
        ],
      } as Json;
    }),
  };
}
