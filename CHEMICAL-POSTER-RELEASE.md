# Chemical poster templates and revisions

Production source reconciliation on 2026-10-12.

The original manual release below was replaced by the automatic `main` deployment `dpl_3JvYbibTn3uDoaQzmAu3ZLDYDmDN` (`6659f56`) minutes later. That branch still lacked the chemical label/legal/poster work, so the public domain returned the old registry and the poster-history API returned 404. The deployed client and routes had regressed; the hosted summary and AAB template records were still present.

The repair merges `origin/main` into the chemical feature branch, preserving the two newer commits which remove example placeholders from the chemical form. Release this combined history to `main` with a normal fast-forward push; do not force-push or replace the production branch setting. Future production work must start from updated `main`.

## Production release check

1. Fetch `origin` and confirm the release includes current `origin/main`. Integrate any new production changes before releasing.
2. Run the register/form, label-history and poster journeys against the isolated database.
3. Publish the combined tested commit to the production branch. Check that `tools.eashe.org` resolves to that exact commit after the Git deployment completes.
4. Run `node tests/chemical-poster-deployed.cjs https://tools.eashe.org .verification/poster-source.json`. This now starts at the register, follows the Label and Poster links, checks removed review controls stay absent, exports label/summary/AAB PDFs, and follows the Admin template link. Page API data is intercepted only inside the isolated browser; anonymous API checks, deployed assets and route rendering are real.
5. Confirm the domain still points at the intended commit after all pushes. A successful staging deployment or poster URL alone is not evidence that the public register is current.

Repair validation: 11 isolated browser/API journeys passed, including navigation from the registry into both editors, label V1–3, poster Rev1–3, reset/history, Admin template copy/scope/hide, and tenant/CSRF boundaries. TypeScript passed. Before the repair, the compiled-client check reproduced the public-domain failure: poster-history returned 404 instead of the expected unauthenticated 401. No production customer records were written during verification.

## Verified recovery

After explicit user approval to update `main`, the normal fast-forward push published combined commit `94dfdafc0b8b7efba75051d329f811a815dae760`. Vercel Git deployment `dpl_CE6JyvUEBemGnwAj6QYts9Pe7U8w` became Ready and `tools.eashe.org` resolved to that exact `main` commit.

The custom-domain compiled-client journey passed: register → label → register → poster → Admin template editor (a new tab). It exported the label PDF (104,610 bytes), summary PDF (498,571 bytes), and AAB PDF (617,320 bytes), decoded both poster SDS QR codes, verified protected APIs returned 401, and recorded no JavaScript errors. The smoke test uses context-level API fixtures so the Admin popup is isolated too. The follow-up changes only this release record and the smoke test's new-tab handling; application source is identical to the verified recovery deployment.

## Original staged release

Source commit: `99ac5d7`. Deployment: `dpl_5Ct3Qtx4igTetX2fhttceVXwdS6C` (https://ppe-tools-9nw5vc9s0-ea-she.vercel.app). Staged with production configuration, checked (page 200 / protected API 401), then promoted. Production compiled-client smoke exported both PDFs (498,571 / 617,269 bytes), decoded both SDS QR codes, and recorded no browser errors. Error-level deployment logs were empty. Hosted table/RPC grant checks passed. Browser/API persistence journeys ran against isolated PostgreSQL; production smoke did not write customer revisions.

- Editable A4 posters with a portrait summary and an AAB landscape table based on the supplied reference.
- Admin can create/copy/edit/hide templates, limit availability by company, edit headings/title/company/form defaults/accent, and upload a logo. These are configurable layouts, not an arbitrary drag-and-drop page builder.
- AAB document code, document revision, effective date, form code and form revision are editable. Department, issuer/checker/approver names are plain document fields; no approval workflow is introduced. Example signatures or product-specific safety data are not seeded.
- The AAB seed uses text branding; upload the original company logo in Admin to replace it. Reference screenshot borders are annotations, not part of the PDF.
- Users save append-only Rev1/2/3 snapshots per substance, reopen the latest, select older versions, and reset from the registry without deleting history. Template design and uploaded bitmaps are frozen in each snapshot. System history numbers are independent of editable document revision numbers.
- PPE selection and captions are optional; AAB uses checkboxes for the PPE checklist. The current SDS URL and demo marking are resolved from the current registry, including when an older snapshot is opened.
- Single-page A4 PDF at 300 DPI uses the same rendering as the preview, with Thai word wrapping and an overflow guard. QR codes link to the existing public SDS resolver. Bitmap uploads are limited, resized locally, and retained in snapshots.

## Security and migration

Migration: `20261012041236_chemical_poster_templates_versions.sql` (hosted migration applied successfully). Follow-up seed correction `20261012042316_chemical_aab_poster_form_code.sql` uses the exact reference identifier `AAB-AABX-OHS-FM-031`; it changes only the untouched seed and preserves any Admin edits.

Tables have RLS and no direct anon/authenticated grants. The existing signed Tools session controls tenant access in server routes. Template changes require a verified Admin account. Version inserts use a service-only RPC with a parent-row lock and idempotency key. Versions cannot be updated/deleted by the service role. Template updates check the expected revision to prevent lost updates. Clients cannot forge Admin template designs; old saved designs remain available only through a scoped previous snapshot.

Supabase advisor reports informational “RLS enabled, no policy” for both server-only tables; this is intentional with direct client privileges revoked. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Verification

- 2 real PostgreSQL/PGlite tests: RLS/grants, immutable versions, tenant and active-record checks, duplicate-request identity.
- 2 browser journeys: save/reopen Rev1–3, second browser session, reset, registry unchanged, PNG upload, portrait/landscape PDF, overflow and mobile layout; Admin copy/scope/edit/hide, optimistic conflict, frozen snapshots, 401/403/404 tenant/CSRF boundaries, forged design and invalid-image rejection.
- Production build and TypeScript completed successfully. ESLint has no errors; bitmap preview warnings are expected for canvas/data URLs.
- Downloaded PDFs rendered with Poppler: one A4 page in the correct orientation, matching visual preview and clickable SDS link.
- Compiled-client smoke uses isolated intercepted API responses and the read-only source record requested by the user. Both PDFs export with a decodable SDS QR and no JavaScript errors. No customer revisions are created for testing.
