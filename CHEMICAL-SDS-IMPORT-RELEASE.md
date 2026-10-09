# SDS importer attribution

## Behavior

The chemical register and the SDS section of the edit page show who uploaded the current file or added the current link, with a timestamp in Bangkok time. Display names and account identifiers come from the signed server session. The form cannot set these fields.

Each successful upload records an append-only, company-scoped receipt before returning the file path. Attaching that path uses the receipt's original uploader, even if another person saves the substance. New or changed links record the user who saves the link. Unrelated edits preserve attribution; replacing the SDS updates it; removing the SDS clears the current attribution. This is current-document attribution, not a complete document-version history.

Historical SDS records have no importer evidence. They remain NULL and display “ไม่พบประวัติผู้นำเข้า SDS”; created_by is not used to invent a historical importer. No review or assessment controls are added.

## Database

Hosted migration: 20261009120114_chemical_sds_provenance.sql, applied to wdjhsalkmjbrujqzqllu on 2026-10-09.

- Nullable chem_substances.sds_import snapshot.
- chem_sds_uploads receipts with validated JSON identity, company FK and company/path consistency.
- RLS enabled; no anon/authenticated privileges; service_role can only INSERT and SELECT receipts. Signed-session routes enforce company scope.
- Production verification after migration: 3 original substances, 0 attributed historical rows, 0 receipts. No existing SDS or substance value was backfilled.

The security advisor's [RLS enabled with no policy notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is expected for this server-only table; direct clients are denied. The [unused index notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) reflects a newly created, empty table. Other advisor findings concern existing unrelated objects.

## Verification

- 18 unit/PostgreSQL tests passed, including forged metadata rejection, JSON constraints, company FK/path checks and immutable receipt permissions.
- 14 browser/API/database scenarios passed, including actual form upload and save, reload, a different editor, reusing another user's upload receipt, replacement, link attribution, legacy unknowns, removal, cross-company denial and storage rollback after receipt failure.
- Targeted ESLint and TypeScript checks passed.
- Local browser screenshots: test-results/chemical-sds-importer-register.png and chemical-sds-importer-details.png.
- Storage transport in local tests is a fixture; no test SDS was uploaded to production.
- The live computer-use browser is unavailable due to a Windows runtime volume authentication error. No authenticated production browser verification is claimed.

## Production rollout

Live on https://tools.eashe.org/chemical on 2026-10-09. Source commit 0dcda22; deployment dpl_2uEsEySgSYSrc1p1AKkEB9HTr6MG (https://ppe-tools-psnehfthl-ea-she.vercel.app).

Built remotely with the project's configured production environment, staged with --skip-domain, then promoted after checks. Production compilation, TypeScript and all 53 static pages passed. Staged register returned HTTP 200; anonymous register reads and SDS uploads returned HTTP 401. After promotion, the custom domain returned HTTP 200, all 10 referenced script assets loaded, and its delivered bundle contained the new importer UI. Both anonymous API checks still returned HTTP 401. No error-level runtime logs were returned during the check. Authenticated upload/save/database behavior was verified locally, not by creating a production test record.
