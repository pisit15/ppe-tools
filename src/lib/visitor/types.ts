// Visitor access module types. Mirrors supabase/migrations/20261030090000_visitor_access.sql.

export type VisitorStatus = 'submitted' | 'need_info' | 'approved' | 'rejected' | 'cancelled';
export type HasPermit = 'yes' | 'no' | 'unknown';
export type VisitorEventAction =
  | 'submitted' | 'approved' | 'rejected' | 'need_info' | 'resubmitted' | 'cancelled'
  | 'arrived' | 'left' | 'undo_arrived' | 'undo_left' | 'no_show' | 'undo_no_show' | 'guard_added';

export type VisitorLinkRow = {
  id: string;
  company_id: string;
  token: string;
  label: string;
  active: boolean;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
};

/** Per-company option lists for the request form (areas/departments differ by site). */
export type VisitorCompanyOptionsRow = {
  company_id: string;
  areas: string[];
  departments: string[];
  form_background: string | null; // JPEG data URL
  form_background_dim: number; // 0–95 (% light overlay)
  line_group_id: string | null; // LINE group that receives notifications
  notify_new: boolean;
  notify_decision: boolean;
  updated_at: string;
  updated_by: string | null;
};
export type VisitorBackground = { url: string; dim: number } | null;

/** What the public request form receives for a secret link. */
export type VisitorLinkInfo = { company: { id: string; name: string }; label: string; areas: string[]; departments: string[]; background: VisitorBackground };

export type VisitorPersonRow = {
  id: string;
  request_id: string;
  seq: number;
  name: string;
  detail: string;
  arrived_at: string | null;
  left_at: string | null;
  no_show_at: string | null;
  added_by_guard: boolean;
  added_at: string | null;
};

export type VisitorRequestRow = {
  id: string;
  company_id: string;
  request_no: string;
  track_code: string;
  link_id: string | null;
  status: VisitorStatus;
  informer_name: string;
  informer_employee_code: string;
  informer_phone: string;
  informer_department: string;
  visitor_company: string;
  arrival_date: string; // YYYY-MM-DD
  time_from: string; // HH:MM:SS
  time_to: string;
  purpose: string;
  purpose_other: string;
  work_areas: string[];
  work_area_detail: string;
  has_permit: HasPermit;
  permit_ref: string;
  note: string;
  decision_note: string;
  conditions: string;
  decided_by: string | null;
  decided_at: string | null;
  source: 'web' | 'jotform' | 'manual';
  created_at: string;
  updated_at: string;
};

export type VisitorEventRow = {
  id: number;
  request_id: string;
  at: string;
  actor: string;
  action: VisitorEventAction;
  note: string;
};

export type VisitorRequestWithPersons = VisitorRequestRow & { visitor_persons: VisitorPersonRow[] };
export type VisitorRequestDetail = VisitorRequestWithPersons & { visitor_events: VisitorEventRow[] };

/** Body accepted by POST /api/visitor/public/requests (also used for resubmit after need_info). */
export type CreateVisitorRequestInput = {
  token: string;
  informer_name: string;
  informer_employee_code: string;
  informer_phone: string;
  informer_department: string;
  visitor_company: string;
  arrival_date: string;
  time_from: string; // HH:MM
  time_to: string;
  purpose: string;
  purpose_other?: string;
  work_areas?: string[];
  work_area_detail?: string;
  has_permit?: HasPermit;
  permit_ref?: string;
  note?: string;
  persons: { name: string; detail?: string }[];
};

export type DecisionAction = 'approve' | 'reject' | 'need_info' | 'cancel';
export type DecisionInput = { action: DecisionAction; note?: string; conditions?: string };

/** What the public guard board receives — only approved requests for the requested days. */
export type BoardRequest = Pick<VisitorRequestRow,
  'id' | 'request_no' | 'visitor_company' | 'arrival_date' | 'time_from' | 'time_to' | 'purpose' | 'purpose_other'
  | 'work_areas' | 'work_area_detail' | 'informer_name' | 'informer_department' | 'informer_phone' | 'conditions' | 'has_permit' | 'permit_ref'>
  & { persons: Pick<VisitorPersonRow, 'id' | 'seq' | 'name' | 'detail' | 'arrived_at' | 'left_at' | 'no_show_at' | 'added_by_guard'>[] };

/** Guard board actions (POST /api/visitor/public/board/[company]). */
export type BoardAction = 'arrive' | 'leave' | 'undo_arrive' | 'undo_leave' | 'no_show' | 'undo_no_show';
export type BoardPost = { person_id: string; action: BoardAction } | { request_id: string; action: 'add_person'; name: string; detail?: string } | { request_id: string; action: 'no_show_all' };

export type BoardPayload = { company: { id: string; name: string }; today: string; requests: BoardRequest[]; background: VisitorBackground };

/** Public status view by track code — no phone numbers or decision details beyond the note. */
export type TrackPayload = Pick<VisitorRequestRow,
  'request_no' | 'status' | 'visitor_company' | 'arrival_date' | 'time_from' | 'time_to' | 'purpose' | 'decision_note' | 'conditions' | 'decided_at' | 'created_at'>
  & { company_name: string; persons: Pick<VisitorPersonRow, 'seq' | 'name' | 'detail'>[] };

export type LineGroupOption = { group_id: string; group_name: string; active: boolean; joined_at: string };
export type NotifyLogRow = { id: number; company_id: string; request_id: string | null; kind: 'new_request' | 'decision' | 'test'; group_id: string; http_status: number | null; error: string | null; sent_at: string };
