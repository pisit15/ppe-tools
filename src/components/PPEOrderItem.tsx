import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, ShoppingCart } from 'lucide-react';
import { UNIT_TYPES } from '@/lib/constants';
import { monthLabelTH, type OrderRow } from '@/lib/ppe-order';

type PPEOrderItemProps = {
  row: OrderRow;
  index: number;
  months: [string, string, string];
  remark: { remark: string; qty: string };
  onChange: (value: { remark: string; qty: string }) => void;
  onSave: () => void;
};

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('th-TH', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export default function PPEOrderItem({ row, index, months, remark, onChange, onSave }: PPEOrderItemProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const quantityId = useId();
  const remarkId = useId();
  const unit = UNIT_TYPES.find(item => item.value === row.product.unit)?.label || row.product.unit;
  const details = [
    ...months.map((month, monthIndex) => ({ label: monthLabelTH(month), value: row.usage[monthIndex] })),
    { label: 'ใช้ 3 เดือน', value: row.usage3 },
    { label: 'เฉลี่ย/เดือน', value: row.avg3 },
    { label: 'Safety Stock', value: row.safetyStock },
    { label: 'MIN', value: row.minV },
    { label: 'MAX', value: row.maxV },
    { label: 'AVG.', value: row.avgV },
  ];

  return (
    <article
      data-testid="order-item"
      data-product-code={row.product.item_code || ''}
      className="min-w-0 border-b border-slate-100 bg-white last:border-b-0"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,.75fr)_minmax(0,1.5fr)] items-start gap-3 p-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,.75fr)_minmax(0,1.5fr)_2.75rem] xl:items-center">
        <div className="col-span-2 flex min-w-0 items-start gap-2.5 xl:col-span-1">
          <span className="pt-0.5 text-xs tabular-nums text-slate-400">{index}</span>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-medium leading-relaxed text-slate-900 [overflow-wrap:anywhere]">{row.product.name}</h3>
            <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-500 [overflow-wrap:anywhere]">
              {row.product.item_code || 'ไม่มี Item Code'} · หน่วย: {unit}
            </p>
            {row.requiresOrder && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                <ShoppingCart size={12} aria-hidden="true" /> ต้องสั่งซื้อ
              </span>
            )}
            {!row.canReorder && (
              <span className="mt-1.5 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                ไม่สั่งซื้อเพิ่ม
              </span>
            )}
          </div>
        </div>

        <dl className="col-span-2 grid min-w-0 grid-cols-3 gap-2 rounded-lg bg-slate-50 px-2 py-3 text-center xl:col-span-1 xl:bg-transparent xl:p-0">
          <div className="min-w-0">
            <dt className="mb-1 text-xs text-slate-500 xl:sr-only">คงเหลือ</dt>
            <dd data-testid="order-stock" className="break-words text-sm font-semibold tabular-nums text-blue-700 [overflow-wrap:anywhere]">{formatNumber(row.stockOnHand)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1 text-xs text-slate-500 xl:sr-only">จุดสั่งซื้อ</dt>
            <dd data-testid="order-reorder-point" className="break-words text-sm tabular-nums text-slate-700 [overflow-wrap:anywhere]">{formatNumber(row.reorderPoint)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="mb-1 text-xs text-slate-500 xl:sr-only">ต้องสั่ง</dt>
            <dd data-testid="order-need" className={`break-words text-sm font-semibold tabular-nums [overflow-wrap:anywhere] ${row.requiresOrder ? 'text-orange-700' : 'text-slate-600'}`}>
              {row.canReorder ? formatNumber(Math.ceil(Math.max(row.needToOrder, 0))) : '—'}
            </dd>
          </div>
        </dl>

        <div className="min-w-0">
          <label htmlFor={row.canReorder ? quantityId : undefined} className="mb-1.5 block text-xs text-slate-500 xl:sr-only">สั่งจริง</label>
          {row.canReorder ? (
            <input
              id={quantityId}
              type="number"
              min={0}
              aria-label={`สั่งจริง ${row.product.name}`}
              value={remark.qty}
              onChange={event => onChange({ ...remark, qty: event.target.value })}
              onBlur={onSave}
              placeholder="—"
              className="min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-center text-sm tabular-nums text-slate-900 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          ) : (
            <span data-testid="order-actual-disabled" className="flex min-h-11 items-center justify-center text-sm text-slate-400" title="รายการนี้ไม่สั่งซื้อเพิ่ม">—</span>
          )}
        </div>

        <div className="min-w-0">
          <label htmlFor={remarkId} className="mb-1.5 block text-xs text-slate-500 xl:sr-only">หมายเหตุ</label>
          <textarea
            id={remarkId}
            rows={1}
            aria-label={`หมายเหตุ ${row.product.name}`}
            value={remark.remark}
            onChange={event => onChange({ ...remark, remark: event.target.value })}
            onBlur={onSave}
            placeholder="เหตุผล / หมายเหตุ"
            className="block min-h-11 w-full min-w-0 resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          type="button"
          aria-label={`รายละเอียด ${row.product.name}`}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded(value => !value)}
          className="col-span-2 flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 xl:col-span-1 xl:w-11"
        >
          <span className="xl:hidden">{expanded ? 'ซ่อนรายละเอียด' : 'รายละเอียดการคำนวณ'}</span>
          {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
      </div>

      <div id={detailsId} data-testid="order-details" hidden={!expanded} className="min-w-0 border-t border-slate-100 bg-slate-50/70 px-4 py-4">
        <p className="mb-3 text-xs font-medium text-slate-600">รายละเอียดการคำนวณ · หน่วย: {unit}</p>
        <dl className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
          {details.map(detail => (
            <div key={detail.label} className="min-w-0">
              <dt className="break-words text-xs text-slate-500">{detail.label}</dt>
              <dd className="mt-1 break-words text-sm tabular-nums text-slate-800 [overflow-wrap:anywhere]">{formatNumber(detail.value)}</dd>
            </div>
          ))}
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">ราคา/หน่วย</dt>
            <dd className="mt-1 break-words text-sm tabular-nums text-slate-800 [overflow-wrap:anywhere]">
              {row.product.unit_price != null ? `฿${formatNumber(row.product.unit_price)}` : '—'}
            </dd>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-5">
            <dt className="text-xs text-slate-500">นโยบายสั่งซื้อ</dt>
            <dd className="mt-1 text-sm text-slate-700">{row.canReorder ? 'สั่งซื้อเพิ่มได้' : 'ไม่สั่งซื้อเพิ่ม'}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
