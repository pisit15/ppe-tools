export type PPEProduct = {
  id: string;
  company_id: string;
  name: string;
  type: string;
  unit: string;
  image_url: string | null;
  min_stock: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PPEStockSummary = {
  product_id: string;
  company_id: string;
  name: string;
  type: string;
  unit: string;
  image_url: string | null;
  min_stock: number;
  total_in: number;
  total_out: number;
  current_stock: number;
};

export type TransactionType = 'stock_in' | 'return' | 'stock_out' | 'borrow';

export type PPETransaction = {
  id: string;
  company_id: string;
  product_id: string;
  transaction_type: TransactionType;
  quantity: number;
  unit: string;
  transaction_date: string;
  po_number: string | null;
  employee_code: string | null;
  employee_name: string | null;
  department: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
};

export type PPEEmployee = {
  id: string;
  company_id: string;
  employee_code: string;
  name: string;
  position: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
};

export type CreateProductInput = Omit<PPEProduct, 'id' | 'created_at' | 'updated_at'>;
export type UpdateProductInput = Partial<CreateProductInput>;

export type CreateTransactionInput = Omit<PPETransaction, 'id' | 'created_at'>;
export type UpdateTransactionInput = Partial<CreateTransactionInput>;

export type CreateEmployeeInput = Omit<PPEEmployee, 'id' | 'created_at'>;
export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export type DashboardStats = {
  total_products: number;
  total_transactions: number;
  low_stock_count: number;
  total_stock_in: number;
  total_stock_out: number;
};
