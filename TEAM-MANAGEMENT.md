# SHE / ISO Team Management

Implemented on `codex/she-iso-management` in an isolated clone of `pisit15/ppe-tools` at `9845302`.
The original Desktop checkout and its staged/untracked changes have not been modified.

## New routes

- `/team/manage`: core personnel CRUD plus SHE/ISO/DCC/Environment membership, multiple responsible companies, family F1–F6, site context, direct/functional reporting lines, status effective date and optional existing account link.
- `/team/org-chart`: drag to arrange, zoom, switch reporting-line type, edit a person, persist coordinates and export SVG. Core personnel names are reused. Layout changes do not change reporting lines.
- `/team/license-matrix`: existing legal-license records by person/type with expiry state, plus separate unverified claims from Excel. Editing continues through the existing license page.
- `/team/performance`: period-specific P1–P4 score/evidence, reviewer, goals, check-ins, preparation notes, calibration grade/reason and IDP. Uses the six family weight sets from the supplied workbook. Final reviews are locked.

Under localhost these paths are prefixed with `/superadmin` as in the existing console.

## Data and migration

Migration `supabase/migrations/20260908064658_team_management.sql` was installed on 2026-09-08 before the application release. The filename matches the recorded Supabase migration version. Source personnel have not been imported or reconciled automatically.

`she_personnel` remains the master for names, contact details, company and employment state. New private tables hold profile extensions, review snapshots and change history. Member saves update core fields, extensions and audit in one transaction. Core timestamps and profile revisions detect stale edits. Reporting-graph updates are serialized and checked for cycles in SQL as well as application code.

New tables have RLS enabled and no anonymous/authenticated grants. Server RPCs are SECURITY INVOKER, callable only by service_role. The API requires the existing super-admin guard and a server service-role client. Linked accounts are references only; this does not grant access to performance information or change login credentials.

The GET endpoint returns an explicit setup-required error until migration is installed. No private data or user workbook has been included as a seed in the repository.

## Excel analysis and import

The import template defines six job families and P1–P4 assessments. Preparation-sheet examples are not imported as real assessments. Source personnel details and staffing totals are kept outside this public repository.

The import UI reads `01-รายชื่อและครอบครัวงาน` locally and presents every candidate. The user selects an existing person or creates a new draft and reviews it before saving. It does not overwrite current contact details/status from notes in the workbook. License claims stay unverified until the existing license register is updated. Summary rows are excluded. Ambiguous name matches require selection.

Existing duplicates, departures and conflicting sources still need human reconciliation. The displayed record count is intentionally not labelled unique headcount. Sources with different scope cannot be reconciled by blindly deleting the difference.

## Verified

- `node --test tests/team-management.test.cjs`: six passing suites covering weight reconciliation, missing/out-of-range inputs, grade boundaries, evidence/final-grade conditions, cycles, expiry boundaries and ambiguous imports.
- TypeScript `--noEmit --incremental false`: passed.
- Targeted ESLint on the new library, API, component and pages: passed.
- Next.js 16.2.3 production build with webpack: passed with build-only placeholder connection settings.
- PostgreSQL 17 verification in a dedicated transaction/schema: member revision conflicts, cyclic managers, atomic failed writes, final-review lock, audit row counts and private grants passed. Transaction rolled back; readback confirmed the test schema was gone and production extension tables had not been created.
- Browser inspection with a temporary synthetic fixture harness: roster/filter controls, reporting chart, Thai text, license matrix and evaluation form rendered. Entering 4/4/3/5 for F2 displayed 3.95 and grade B. Fixture route removed from deliverable.

The production migration grants were verified after installation. The deployment must also be verified through the authenticated browser before release completion.

## Boundaries for this first version

- No automated merge of duplicate legacy personnel; review the Excel matches and existing IDs first.
- No automatic extraction of reporting edges from Canva. Reporting lines are explicitly selected in each profile.
- SVG export is implemented; PDF/PNG conversion and multiple named/versioned charts remain future work.
- Existing legal-license schema does not distinguish perpetual licenses from missing expiry dates; Matrix reports unknown dates conservatively. Attachment upload/renewal history has not been added in this change.
- Review weights are snapshotted from the workbook's default family weights. A shared configurable cycle policy, delegated reviewer access, notifications, structured multi-entry check-in history, post-finalization IDP updates and appeals remain future work.

Before publishing, review the diff against current remote main (the user's original checkout contains pending work), apply the migration through the project's normal deployment process, then verify a reversible test record through the authenticated console and both shared workforce views.
