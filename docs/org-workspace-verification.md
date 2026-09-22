# Organization workspace

The organization page now starts with a searchable company overview. A separate reporting canvas lets administrators inspect connected people, distinguish direct and functional reporting, and explicitly enter a position-editing mode. Independent trees wrap into compact rows rather than stretching every company to the deepest hierarchy.

Existing personnel records, reporting relationships, profile revisions, authorization and database schema are unchanged. Counts are explicitly records, not deduplicated people. Saved coordinates remain available through “ใช้ตำแหน่งที่บันทึก”; automatic layout is the default. Filtering reports when a manager lies outside the current scope.

## Validation (2026-09-22)

- Production build and TypeScript passed with `npm run build -- --webpack`. Local public Supabase values were placeholders; no production credentials were needed.
- ESLint passed for all changed TypeScript components and layout code.
- `node --test tests/team-org-chart.test.cjs tests/team-management.test.cjs`: 12 passing tests, including non-overlap, stable ordering, direct/functional hierarchy, hidden managers, cycles and existing profile validation.
- Browser checked at desktop and 390 px mobile widths: company overview, empty search, company scope including multi-company responsibility, details, related reporting network, fit control and keyboard close.
- Isolated fixture verified keyboard movement and pointer dragging create drafts without writes. Explicit save persisted coordinates; a simulated 503 retained the draft for successful retry. Dragging no longer opens the inspector and resizes the canvas.
- Existing personnel-management view still renders the fixture records. SVG export action completed without console errors; the embedded browser did not expose a completed download event, so the downloaded file was not independently opened.

## Reproduce browser QA

Run the app on `127.0.0.1:3110`, then `node tests/fixtures/org-workspace-proxy.cjs`, and open `http://127.0.0.1:3111/superadmin/team/org-chart`.

The fixture uses 34 synthetic records across 14 companies. Every `/api/` request is handled locally; cookies and authorization headers are removed from forwarded asset requests. `/__qa/state` reports fixture-only writes and `/__qa/fail-next` makes the next fixture save return 503. No production records are changed by this workflow.
