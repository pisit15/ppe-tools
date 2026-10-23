import type { PPEOrderSettings, PPEProduct, PPEStockSummary, PPETransaction } from './types';

export type OrderRow = {
  product: PPEProduct;
  usage: [number, number, number];
  usage3: number;
  stockOnHand: number;
  avg3: number;
  safetyStock: number;
  minV: number;
  maxV: number;
  avgV: number;
  reorderPoint: number;
  needToOrder: number;
  canReorder: boolean;
  requiresOrder: boolean;
  isEmpty: boolean;
};

export function monthKey(y: number, m0: number): string {
  const date = new Date(y, m0, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabelTH(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
}

export function isOrderPeriod(value: string | null): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 2000 && year <= 2100;
}

/** The selected end month is included in the three-month usage window. */
export function orderMonths(endMonth: string): [string, string, string] {
  const [y, m] = endMonth.split('-').map(Number);
  return [monthKey(y, m - 3), monthKey(y, m - 2), monthKey(y, m - 1)];
}

export function orderDateRange(endMonth: string): { start: string; end: string } {
  const [y, m] = endMonth.split('-').map(Number);
  return {
    start: `${orderMonths(endMonth)[0]}-01`,
    end: `${endMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`,
  };
}

export function leadTimeDays(settings: PPEOrderSettings | null): number {
  return settings
    ? settings.quotation_days + settings.pr_days + settings.wams_open_days + settings.wams_process_days + settings.delivery_days
    : 30;
}

/** Shared purchasing eligibility and ranking for the dashboard, report and export. */
export function calculateOrderRows({ products, stocks, transactions, months, leadMonths }: {
  products: PPEProduct[];
  stocks: PPEStockSummary[];
  transactions: PPETransaction[];
  months: [string, string, string];
  leadMonths: number;
}): OrderRow[] {
  const stockMap = new Map(stocks.map(stock => [stock.product_id, stock.current_stock ?? 0]));
  const usageMap = new Map<string, [number, number, number]>();
  transactions.forEach(transaction => {
    if (transaction.transaction_type !== 'stock_out' && transaction.transaction_type !== 'borrow') return;
    if (!transaction.transaction_date || !transaction.product_id) return;
    const index = months.indexOf(transaction.transaction_date.slice(0, 7));
    if (index === -1) return;
    const usage: [number, number, number] = usageMap.get(transaction.product_id) || [0, 0, 0];
    usage[index] += transaction.quantity;
    usageMap.set(transaction.product_id, usage);
  });

  return products.filter(product => product.is_active !== false).map(product => {
    const usage = usageMap.get(product.id) || [0, 0, 0] as [number, number, number];
    const usage3 = usage[0] + usage[1] + usage[2];
    const stockOnHand = stockMap.get(product.id) ?? 0;
    const avg3 = usage3 / 3;
    const safetyStock = leadMonths * avg3;
    const minV = avg3 + safetyStock;
    const maxV = avg3 * leadMonths + safetyStock + minV;
    const avgV = (maxV + minV) / 2;
    const reorderPoint = avg3 * leadMonths + safetyStock;
    const needToOrder = avgV - stockOnHand;
    const canReorder = product.can_reorder !== false;
    const isEmpty = stockOnHand === 0 && usage.every(quantity => quantity === 0);
    const requiresOrder = canReorder && !isEmpty && stockOnHand <= reorderPoint;
    return { product, usage, usage3, stockOnHand, avg3, safetyStock, minV, maxV, avgV, reorderPoint, needToOrder, canReorder, requiresOrder, isEmpty };
  }).sort((a, b) => Number(a.isEmpty) - Number(b.isEmpty)
    || Number(b.canReorder) - Number(a.canReorder)
    || Number(b.requiresOrder) - Number(a.requiresOrder)
    || b.needToOrder - a.needToOrder
    || a.product.name.localeCompare(b.product.name, 'th'));
}
