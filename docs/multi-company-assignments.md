# Multi-company assignments

## Outcome

One personnel record can hold a primary role and multiple acting or additional roles. A supervisor is selected by person **and assignment**. Company charts show the role in that company, its assignment type, and the person's primary affiliation. Headcount deduplicates personnel IDs; role count is separate.

## Implementation plan

1. Add versioned assignments to the existing private profile payload. Keep the primary assignment ID equal to the personnel ID so legacy reporting references remain valid. Materialize legacy primary roles on read without inferring acting appointments from responsibility-company checkboxes.
2. Add an assignment editor with company, title, type, effective dates, and direct/functional supervisor assignments. Preserve saved appointments; end them with a date instead of deleting history. Group the supervisor options by company.
3. Render assignment nodes and date filters in the chart, including primary affiliation and acting labels in both UI and SVG. Show all roles for the selected person and warnings when a supervisor assignment has ended or is not yet effective.
4. Validate on the server and inside the existing serialized database transaction: stable ownership/IDs, one primary, real companies, valid dates, no self-reporting or reporting cycles, no deletion of saved assignments. Keep optimistic revisions, audit history, and Super Admin authorization. Legacy clients cannot overwrite assignment-aware profiles.
5. Verify a primary role plus four acting appointments, company-specific subordinates, date boundaries, permissions, cycles, concurrent edits, position persistence, and old-profile compatibility. Use synthetic data; do not assign real personnel without the administrator entering the appointment.
6. Create a GitHub PR and deploy after checks and database validation, using the authorization already provided in this task.

## Scope and semantics

- Assignment dates are inclusive, in the Asia/Bangkok calendar. Primary role has no separate end date; workforce status remains authoritative for current employment.
- Each role has its own current reporting links. An expired supervisor is not silently replaced. The UI flags the link for administrator review.
- The selected date filters recorded assignment periods; it does not reconstruct former names, employment status, or previous manager edits. Change history remains in the existing audit table.
- Solid lines mean direct reporting; dashed lines mean functional reporting. Acting status is a label, never a different reporting-line type.
- Responsibility-company metadata is preserved independently. It does not create unverified acting assignments.
- Existing duplicate personnel records are not automatically merged. “People” means distinct personnel IDs.
- No new notifications, employment permission changes, or automatic reassignment are introduced.

## Storage

Use `team_member_profiles.payload.assignments` with an explicit `assignment_version: 1`. This extends the existing atomic personnel/profile/audit save rather than introducing a second competing personnel registry. Database validation runs under the same advisory lock as legacy reporting mutations. New roles use UUIDs; the primary role uses the person's UUID. No production personnel data is backfilled or seeded.

## Verification

- Passed 20 assignment, management, and chart unit tests, plus 4 API tests covering authorization, origin checks, rejected payloads, and successful saves.
- Passed an isolated PostgreSQL/PGlite integration suite executing the real migrations and save function: primary plus four acting appointments, role-specific supervisors, inclusive date boundaries, invalid data, cycles, self-reporting, preservation of saved roles, atomic audit/rollback, stale and simultaneous revisions, legacy compatibility, and browser-role permission denial.
- Production Next.js webpack build (including TypeScript), ESLint on changed application files, and `git diff --check` passed.
- Browser QA used only synthetic local data: added, previewed, saved, and reloaded a fourth acting appointment; headcount stayed 34 while roles increased from 37 to 38. Verified EA-Kabin's subordinate references the EA-Kabin acting assignment, with AMT still shown as the primary affiliation. Moving two cards belonging to one person saved both positions in one profile write. Verified cancellation and a simulated failed save keep the editor available; desktop and 390px mobile layouts were inspected. No console errors occurred in the successful flow.
- Browser limitation: the Codex embedded browser crashed when opening its native date picker, and its date-field automation did not reliably commit edits. Date validation/filter semantics were tested in code/database; native calendar interaction remains a manual browser check.
- Applied the migration to production on 2026-09-22. All 16 existing profiles passed read-only validation. Counts stayed at 38 personnel, 16 profiles, and zero explicit assignment profiles: deployment did not create appointments. Both functions remain SECURITY INVOKER with fixed search paths; only the service role can execute them, not anonymous or authenticated browser roles.
- Security advisor findings are unchanged from baseline, with no new assignment-function findings. Existing unrelated findings cover a [security-definer view](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [RLS-disabled tables](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public), [mutable function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), and existing [anonymous](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)/[authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) function access. Team-table [RLS without browser policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) remains intentional for the server-only access model.
