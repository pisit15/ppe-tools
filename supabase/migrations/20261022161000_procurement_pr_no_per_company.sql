-- Odoo numbers purchase requests per company: the same PR number (e.g. PR24000006) can exist in
-- several companies. odoo_id stays the key; pr_no + requester links quotations to a PR.
alter table public.proc_pr drop constraint if exists proc_pr_pr_no_key;
create index if not exists proc_pr_pr_no on public.proc_pr(pr_no);
create index if not exists proc_quotes_pr_requester on public.proc_quotes(pr_no, requester);
