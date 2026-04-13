-- PPE Products catalog
CREATE TABLE ppe_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ชิ้น',
  image_url TEXT,
  min_stock INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Stock transactions (both in and out)
CREATE TABLE ppe_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  product_id UUID REFERENCES ppe_products(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('stock_in', 'return', 'stock_out', 'borrow')),
  quantity INTEGER NOT NULL,
  unit TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  po_number TEXT,
  employee_code TEXT,
  employee_name TEXT,
  department TEXT,
  notes TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Current stock view (computed from transactions)
CREATE VIEW ppe_stock_summary AS
SELECT 
  p.id as product_id,
  p.company_id,
  p.name,
  p.type,
  p.unit,
  p.image_url,
  p.min_stock,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('stock_in', 'return') THEN t.quantity ELSE 0 END), 0) as total_in,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('stock_out', 'borrow') THEN t.quantity ELSE 0 END), 0) as total_out,
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('stock_in', 'return') THEN t.quantity ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN t.transaction_type IN ('stock_out', 'borrow') THEN t.quantity ELSE 0 END), 0) as current_stock
FROM ppe_products p
LEFT JOIN ppe_transactions t ON t.product_id = p.id AND t.company_id = p.company_id
WHERE p.is_active = true
GROUP BY p.id, p.company_id, p.name, p.type, p.unit, p.image_url, p.min_stock;

-- Employees
CREATE TABLE ppe_employees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  department TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, employee_code)
);

-- Indexes
CREATE INDEX idx_ppe_products_company ON ppe_products(company_id);
CREATE INDEX idx_ppe_transactions_company ON ppe_transactions(company_id);
CREATE INDEX idx_ppe_transactions_product ON ppe_transactions(product_id);
CREATE INDEX idx_ppe_transactions_date ON ppe_transactions(transaction_date);
CREATE INDEX idx_ppe_transactions_employee ON ppe_transactions(employee_code, company_id);
CREATE INDEX idx_ppe_employees_company ON ppe_employees(company_id);

-- Enable RLS for multi-company isolation
ALTER TABLE ppe_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppe_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppe_employees ENABLE ROW LEVEL SECURITY;
