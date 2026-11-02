# First Aid & Medicine Control

Production entry: `/first-aid`. Uses the existing EA SHE Tools login and company scope. The approved green workspace supports stock, lots/expiry, point inspections, per-point thresholds, staff issues, self-recorded collection, requester/recipient/recorder traceability, and reports.

## Initial setup

1. Sign in with an existing Tools account. Administrators select a company; other permitted accounts use their own company.
2. Create care points and medical item records. Choose one base unit per item and whether expiry is tracked.
3. Receive the actual opening stock, including lot and expiry; set each point's minimum quantities.
4. For open-access points, choose “ผู้เบิกบันทึกเอง”, create the collection link/QR, and place the label at that point. Rotating the link invalidates its prior QR.

No prototype records, employee medical information, or stale September workbook balances were seeded. Company employee names are looked up only on authenticated staff pages. Public collection supports manual names/organization and collection on behalf of another person; these identities are explicitly self-declared.

## Data and access

- New `fa_*` tables use RLS and deny direct `anon`/`authenticated` access. Existing signed Tools sessions are revalidated server-side; every staff query and write is company-scoped and requires the `first-aid` module.
- PPE requester accounts cannot access staff pages/APIs. Exact public QR routes remain available independently of an unrelated PPE session.
- Public links are high-entropy bearer capabilities, stored only as SHA-256 hashes. Their API exposes the selected point's stock, not employee directories, history, clinical records, or other points. The point must remain active and in self-service mode.
- Clinical services are optional and restricted to administrator accounts in this release. Stock accounts do not receive clinical records.
- All stock mutations are atomic server-side RPCs, serialized per company with nonnegative balances, actual-lot validation, FEFO, and idempotent document identifiers. Stable creation identifiers also protect item, point, inspection, and visit submissions.
- Existing stock/history prevents changes to an item's unit; positive undated stock prevents enabling expiry tracking. Create a new item to use another base unit.
- After an acknowledged save, a failed refresh shows a saved/stale warning and blocks further writes until reload. An uncertain submission keeps the same payload and identifier on retry.
- Usage totals aggregate all matching movements, independently of the latest-500 history view. History exports explicitly state that limit when additional history exists.

## Deployment

Uses the existing `ppe-tools` Vercel project and Supabase configuration; no new production secrets or services are required.

Applied database migrations:

- `20261102105832_first_aid_control.sql`
- `20261102111010_first_aid_inspection_ready.sql`
- `20261102111946_first_aid_home_card.sql` (applied after the application route is ready)

Application rollback: redeploy the prior production commit. The new schema is additive and can remain in place; do not delete medical/stock records to roll back application code.

## Verification

- Next.js production build and TypeScript checks.
- `npm run test:first-aid`: 18 database tests, 16 API/auth tests, and the public-path access test.
- Existing homepage card regression test.
- Live PostgreSQL service-role receipt/issue/idempotency/privilege checks in a transaction that was rolled back.
- Browser checks with an isolated fixture: editable HTML-looking strings remain text, a confirmed save followed by failed refresh cannot be resubmitted, and two retry attempts create only one item.
- No authenticated production write test is performed by impersonating an existing account.

The local fixture `node tests/first-aid-ui-preview.cjs` is separate from production and never connects to the database.
