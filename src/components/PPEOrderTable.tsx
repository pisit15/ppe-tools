import { ShoppingCart } from 'lucide-react';
import { monthLabelTH, type OrderRow } from '@/lib/ppe-order';
import { UNIT_TYPES } from '@/lib/constants';

type Draft = { remark: string; qty: string };
type Props = {
  rows: OrderRow[];
  months: [string, string, string];
  startIndex: number;
  remarks: Record<string, Draft>;
  onChange: (id: string, value: Draft) => void;
  onSave: (id: string) => void;
};
const fmt = (value: number) => value.toLocaleString('th-TH', { maximumFractionDigits: 2 });

export default function PPEOrderTable({ rows, months, startIndex, remarks, onChange, onSave }: Props) {
  const headers = ['No.', 'สินค้า', ...months.map(monthLabelTH), 'Stock on hand', 'ใช้ 3 เดือน', 'เฉลี่ย/เดือน', 'Safety Stock', 'MIN', 'MAX', 'AVG.', 'Re-order point', 'ต้องสั่ง', 'สั่งจริง'];
  return (
    <table data-testid="order-table" className="w-full table-fixed text-[11px] xl:text-xs">
      <colgroup><col style={{ width: '3%' }} /><col style={{ width: '23%' }} />{Array.from({ length: 12 }, (_, index) => <col key={index} style={{ width: '5.625%' }} />)}<col style={{ width: '6.5%' }} /></colgroup>
      <thead className="border-b border-slate-200 bg-slate-100 text-slate-600"><tr>{headers.map((label, index) => <th key={label} scope="col" className={`px-1 py-3 font-semibold leading-5 [overflow-wrap:anywhere] ${index === 1 ? 'text-left' : 'text-center'}`}>{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? <tr><td colSpan={15} className="py-10 text-center text-slate-500">ไม่พบรายการ</td></tr> : rows.map((row, index) => {
          const draft = remarks[row.product.id] || { remark: '', qty: '' };
          const metrics = [...row.usage, row.stockOnHand, row.usage3, row.avg3, row.safetyStock, row.minV, row.maxV, row.avgV, row.reorderPoint];
          const unit = UNIT_TYPES.find(item => item.value === row.product.unit)?.label || row.product.unit;
          return <tr key={row.product.id} data-testid="order-item" data-product-code={row.product.item_code || ''} className="hover:bg-blue-50/30">
            <td className="px-1 py-3 text-center tabular-nums text-slate-500">{startIndex + index + 1}</td>
            <td className="px-2 py-3 text-slate-800 [overflow-wrap:anywhere]"><div className="font-medium leading-5">{row.product.name}</div><div className="mt-0.5 text-[10px] text-slate-500">หน่วย: {unit}</div>{row.requiresOrder && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 font-semibold text-orange-700"><ShoppingCart size={11} aria-hidden="true" />ต้องสั่งซื้อ</span>}{!row.canReorder && <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">ไม่สั่งซื้อเพิ่ม</span>}</td>
            {metrics.map((value, metricIndex) => <td key={metricIndex} data-testid={metricIndex === 3 ? 'order-stock' : metricIndex === 10 ? 'order-reorder-point' : undefined} className={`px-1 py-3 text-center tabular-nums [overflow-wrap:anywhere] ${metricIndex === 3 ? 'font-semibold text-blue-700' : 'text-slate-700'}`}>{fmt(value)}</td>)}
            <td data-testid="order-need" className={`px-1 py-3 text-center font-semibold tabular-nums [overflow-wrap:anywhere] ${row.requiresOrder ? 'text-orange-700' : 'text-slate-600'}`}>{row.canReorder ? fmt(Math.ceil(Math.max(row.needToOrder, 0))) : '—'}</td>
            <td className="px-1 py-3 text-center">{row.canReorder ? <input type="number" min={0} aria-label={`สั่งจริง ${row.product.name}`} value={draft.qty} onChange={event => onChange(row.product.id, { ...draft, qty: event.target.value })} onBlur={() => onSave(row.product.id)} placeholder="—" className="min-h-9 w-full min-w-0 rounded-lg border border-slate-200 px-1 text-center text-xs text-slate-900" /> : <span data-testid="order-actual-disabled" className="text-slate-500">—</span>}</td>
          </tr>;
        })}
      </tbody>
    </table>
  );
}
