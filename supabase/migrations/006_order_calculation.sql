-- 006: Order calculation (Cal. Order) support
-- Replicates the team's "Calculation Order and PPE Stock record" Excel:
-- 3-month usage -> Safety Stock / MIN / MAX / AVG / Re-order point / Need to order.

-- Item code (e.g. 07-SPAM-0001) and unit price for the purchasing export
ALTER TABLE ppe_products ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE ppe_products ADD COLUMN IF NOT EXISTS unit_price NUMERIC;

-- Per-company lead time breakdown (days); total/30 = lead time in months
CREATE TABLE IF NOT EXISTS ppe_order_settings (
  company_id TEXT PRIMARY KEY,
  quotation_days NUMERIC NOT NULL DEFAULT 0.5,
  pr_days NUMERIC NOT NULL DEFAULT 0.5,
  wams_open_days NUMERIC NOT NULL DEFAULT 1,
  wams_process_days NUMERIC NOT NULL DEFAULT 14,
  delivery_days NUMERIC NOT NULL DEFAULT 14,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ppe_order_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select ppe_order_settings" ON ppe_order_settings FOR SELECT TO anon USING (true);

-- Remark per product per calculation period (period = end month of the
-- 3-month window, e.g. '2026-08'), with the actually-ordered quantity.
CREATE TABLE IF NOT EXISTS ppe_order_remarks (
  id SERIAL PRIMARY KEY,
  company_id TEXT NOT NULL,
  product_id UUID NOT NULL,
  period TEXT NOT NULL,
  remark TEXT NOT NULL DEFAULT '',
  actual_order_qty NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, product_id, period)
);
ALTER TABLE ppe_order_remarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon select ppe_order_remarks" ON ppe_order_remarks FOR SELECT TO anon USING (true);
