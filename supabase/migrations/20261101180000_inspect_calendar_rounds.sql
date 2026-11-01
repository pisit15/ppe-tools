-- Routine-inspection due state by calendar round (owner decision, 1 Nov 2026):
--   interval >= 28 days → rounds are calendar months (1 / 3 / 12 … months = round(interval / 30)):
--     ok      = inspected in the current round
--     due     = not yet inspected this round, but the previous round was done (grey "ยังไม่ตรวจรอบนี้")
--     overdue = a whole round was missed (last inspection before the previous round started)
--   interval < 28 days → day based: ok until last + interval, due for a 7-day grace, then overdue.
-- next_due_on = last day of the round in which the next inspection is due.
create or replace view public.insp_asset_status with (security_invoker = true) as
with base as (
  select
    a.id as asset_id, a.company_id, a.category_id, a.status, a.service_interval_months as asset_svc, a.last_service_on, a.mfg_year, a.mfg_month,
    c.inspection_interval_days, c.service_interval_months as cat_svc,
    li.inspected_on, li.overall, li.inspector_name,
    greatest(1, round(c.inspection_interval_days / 30.0))::int as months,
    (c.inspection_interval_days >= 28) as by_month
  from public.insp_assets a
  join public.insp_categories c on c.id = a.category_id
  left join lateral (
    select i.inspected_on, i.overall, i.inspector_name
    from public.insp_inspections i
    where i.asset_id = a.id
    order by i.inspected_on desc, i.created_at desc
    limit 1
  ) li on true
), rounds as (
  select b.*,
    -- first day of the current round (months-long rounds anchored to January)
    (date_trunc('month', current_date)::date - make_interval(months => ((extract(month from current_date)::int - 1) % b.months)))::date as round_start
  from base b
)
select
  r.asset_id,
  r.company_id,
  r.category_id,
  r.status,
  r.inspection_interval_days,
  r.inspected_on as last_inspected_on,
  r.overall as last_overall,
  r.inspector_name as last_inspector_name,
  case
    when r.inspected_on is null then null
    when r.by_month then
      case when r.inspected_on >= r.round_start
        then (r.round_start + make_interval(months => 2 * r.months) - interval '1 day')::date   -- done this round → end of next round
        else (r.round_start + make_interval(months => r.months) - interval '1 day')::date       -- still open → end of this round
      end
    else r.inspected_on + r.inspection_interval_days
  end as next_due_on,
  case
    when r.status <> 'active' then 'inactive'
    when r.inspected_on is null then 'never'
    when r.by_month then
      case
        when r.inspected_on >= r.round_start then 'ok'
        when r.inspected_on >= (r.round_start - make_interval(months => r.months))::date then 'due'
        else 'overdue'
      end
    else
      case
        when current_date < r.inspected_on + r.inspection_interval_days then 'ok'
        when current_date <= r.inspected_on + r.inspection_interval_days + 7 then 'due'
        else 'overdue'
      end
  end as due_state,
  coalesce(r.asset_svc, r.cat_svc) as effective_service_interval_months,
  case
    when coalesce(r.asset_svc, r.cat_svc) is null then null
    when r.last_service_on is not null then r.last_service_on + make_interval(months => coalesce(r.asset_svc, r.cat_svc))
    when r.mfg_year is not null then make_date(r.mfg_year, coalesce(r.mfg_month, 1), 1) + make_interval(months => coalesce(r.asset_svc, r.cat_svc))
    else null
  end::date as next_service_due_on,
  (select count(*) from public.insp_inspections f where f.asset_id = r.asset_id and f.overall = 'fail' and f.resolved_at is null) as open_failures
from rounds r;
