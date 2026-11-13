-- Guard board: "แจ้ง SHE ว่ามาถึงแล้ว" on a request still waiting for a decision is logged as an event (and rate-limited by it).
alter table public.visitor_events drop constraint visitor_events_action_check;
alter table public.visitor_events add constraint visitor_events_action_check check (action in (
  'submitted','approved','rejected','need_info','resubmitted','cancelled',
  'arrived','left','undo_arrived','undo_left','no_show','undo_no_show','guard_added','vehicle_decision','guard_notified'
));
