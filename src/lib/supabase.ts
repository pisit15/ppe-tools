import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client for sensitive operations
export const getSupabaseServer = () => {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, serviceRoleKey);
};

// Helper function to get current company from query params or context
export const getCompanyId = (searchParams?: Record<string, string>): string => {
  if (searchParams?.company_id) {
    return searchParams.company_id;
  }
  return 'default';
};

// Helper functions for common queries
export async function getProducts(companyId: string) {
  const { data, error } = await supabase
    .from('ppe_products')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');
  
  if (error) throw error;
  return data;
}

export async function getStockSummary(companyId: string) {
  const { data, error } = await supabase
    .from('ppe_stock_summary')
    .select('*')
    .eq('company_id', companyId)
    .order('name');
  
  if (error) throw error;
  return data;
}

export async function getTransactions(companyId: string, limit = 100) {
  const { data, error } = await supabase
    .from('ppe_transactions')
    .select('*')
    .eq('company_id', companyId)
    .order('transaction_date', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data;
}

export async function getEmployees(companyId: string) {
  const { data, error } = await supabase
    .from('ppe_employees')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name');
  
  if (error) throw error;
  return data;
}

export async function getLowStockProducts(companyId: string) {
  const { data, error } = await supabase
    .from('ppe_stock_summary')
    .select('*')
    .eq('company_id', companyId)
    .lt('current_stock', 'min_stock')
    .order('name');
  
  if (error) throw error;
  return data;
}
