-- Apply after the stock route uses the service-role company-scoped API.
revoke all on public.ppe_stock_summary from anon, authenticated;
grant select on public.ppe_stock_summary to service_role;
