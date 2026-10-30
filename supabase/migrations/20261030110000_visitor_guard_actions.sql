-- Guard-post follow-ups (owner decision 30 Oct 2026):
-- * a visitor who was announced but never came is marked "no show" per person;
-- * extra people who turn up with an approved group may be added by the guard (approval is for the
--   visit as a whole), flagged added_by_guard so SHE can see them.
alter table public.visitor_persons
  add column no_show_at timestamptz,
  add column added_by_guard boolean not null default false,
  add column added_at timestamptz;

alter table public.visitor_events drop constraint visitor_events_action_check;
alter table public.visitor_events add constraint visitor_events_action_check check (action in (
  'submitted','approved','rejected','need_info','resubmitted','cancelled',
  'arrived','left','undo_arrived','undo_left','no_show','undo_no_show','guard_added'
));

comment on column public.visitor_persons.no_show_at is 'Guard marked this person as not arrived (announced but did not come).';
comment on column public.visitor_persons.added_by_guard is 'Person was not on the approved list; added at the gate by the guard.';
