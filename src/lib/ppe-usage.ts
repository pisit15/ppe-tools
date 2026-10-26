import { UNIT_TYPES } from './constants';
import type { PPEStockSummary, PPETransaction } from './types';

export type UsageMovement = PPETransaction & { ppe_products?: { name: string; unit: string } | null };
export type UsageView = 'dept' | 'product' | 'emp';
export type UsageRow = {
  company: string; department: string; productId: string; product: string;
  employee: string; employeeCode: string; unit: string; issued: number; borrowed: number;
};
export type UsageGroup = { key: string; name: string; company: string; subtitle: string; rows: UsageRow[] };
export function usageUnit(unit: string) { return UNIT_TYPES.find(u => u.value === unit || u.label === unit)?.label || unit || 'ไม่ระบุ'; }
export function reportPeriod(from: string, to: string) {
  const valid = (s: string) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(s);
  if (!valid(from) || !valid(to) || from > to) throw new Error('ช่วงเดือนไม่ถูกต้อง');
  const [fy, fm] = from.split('-').map(Number), [ty, tm] = to.split('-').map(Number);
  const months = (ty - fy) * 12 + tm - fm + 1;
  return { start: `${from}-01`, end: new Date(Date.UTC(ty, tm, 0)).toISOString().slice(0,10), previousStart: new Date(Date.UTC(fy, fm - 1 - months, 1)).toISOString().slice(0,10) };
}
export function usageRows(transactions: UsageMovement[], stocks: PPEStockSummary[], from: string, to: string): UsageRow[] {
  const { start, end } = reportPeriod(from, to);
  const products = new Map(stocks.map(s => [JSON.stringify([s.company_id,s.product_id]), s]));
  const rows = new Map<string, UsageRow>();
  for (const t of transactions) {
    if (!['stock_out','borrow'].includes(t.transaction_type) || t.transaction_date < start || t.transaction_date > end) continue;
    const p = products.get(JSON.stringify([t.company_id,t.product_id]));
    const unit = usageUnit(t.unit || t.ppe_products?.unit || p?.unit || '');
    const department = t.department?.trim() || 'ไม่ระบุแผนก';
    const employeeCode = t.employee_code?.trim() || '';
    const employee = t.employee_name?.trim() || employeeCode || 'ไม่ระบุพนักงาน';
    const key = JSON.stringify([t.company_id,department,t.product_id,unit,employeeCode || employee]);
    let row = rows.get(key);
    if (!row) {
      row = { company:t.company_id, department, productId:t.product_id, product:t.ppe_products?.name || p?.name || t.product_id, employee, employeeCode, unit, issued:0, borrowed:0 };
      rows.set(key,row);
    }
    row[t.transaction_type === 'stock_out' ? 'issued' : 'borrowed'] += Number(t.quantity);
  }
  return [...rows.values()];
}
export function usageGroups(rows: UsageRow[], view: UsageView, search = ''): UsageGroup[] {
  const groups = new Map<string, UsageGroup>();
  const sums = new Map<string, Map<string, UsageRow>>();
  const query = search.trim().toLocaleLowerCase('th');
  for (const r of rows) {
    const key = JSON.stringify([r.company, view === 'dept' ? r.department : view === 'product' ? r.productId : [r.employeeCode || r.employee,r.department]]);
    let group = groups.get(key);
    if (!group) {
      group = { key, name:view === 'dept' ? r.department : view === 'product' ? r.product : r.employee, company:r.company, subtitle:view === 'emp' ? [r.employeeCode,r.department].filter(Boolean).join(' · ') : '', rows:[] };
      groups.set(key,group); sums.set(key,new Map());
    }
    const rowKey = JSON.stringify([r.productId,r.department,r.unit]);
    const existing = sums.get(key)!.get(rowKey);
    if (existing) { existing.issued += r.issued; existing.borrowed += r.borrowed; }
    else sums.get(key)!.set(rowKey,{...r, ...(view !== 'emp' ? {employee:'',employeeCode:''} : {})});
  }
  for (const group of groups.values()) {
    const groupMatches = [group.name,group.company,group.subtitle].join(' ').toLocaleLowerCase('th').includes(query);
    group.rows = [...sums.get(group.key)!.values()].filter(r => groupMatches || [r.product,r.department,r.employee,r.employeeCode,r.unit].join(' ').toLocaleLowerCase('th').includes(query))
      .sort((a,b) => (view === 'product' ? a.department.localeCompare(b.department,'th') : a.product.localeCompare(b.product,'th')) || a.unit.localeCompare(b.unit,'th') || a.productId.localeCompare(b.productId));
  }
  return [...groups.values()].filter(g => g.rows.length).sort((a,b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name,'th') || a.key.localeCompare(b.key));
}
export function usageTotals(rows: Pick<UsageRow,'unit'|'issued'|'borrowed'>[]) {
  const totals = new Map<string,{unit:string;issued:number;borrowed:number}>();
  for (const r of rows) {
    const total = totals.get(r.unit) || {unit:r.unit,issued:0,borrowed:0};
    total.issued += r.issued; total.borrowed += r.borrowed; totals.set(r.unit,total);
  }
  return [...totals.values()].sort((a,b) => a.unit.localeCompare(b.unit,'th'));
}
