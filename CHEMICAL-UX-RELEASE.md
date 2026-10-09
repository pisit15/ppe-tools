# Chemical UX and data integrity release

Prepared on 2026-10-09 on branch codex/chemical-ux-integrity. No production migration, record deletion, or deployment has been performed.

## Behavior

- Company identity follows the selected URL. Internal links preserve scope; full-page editors lock the originating company and block saving after an in-page scope change.
- Chemical APIs validate a signed HttpOnly session against the current active account and enforce company ownership. Storage areas and SDS paths must belong to the same company. Updates require the version initially opened and reject stale writes.
- Loading, empty results, and request errors are distinct. Requests from a previous company are cancelled and cannot replace the current results.
- SDS cards distinguish missing documents, missing dates, an unset review policy, and review due under the company's named policy. Dates use Bangkok calendar days; the default is no policy. Each card filters the register.
- Full-page form sections show recommended-field completion separately from human review. AI field provenance, review status, reviewer and review time persist. Content changes invalidate review; provenance remains after human review.
- Labels and action names are accessible. Matrices show symbols and conditions with row/column focus and hover indicators, including black-and-white printing. The chemical navigation collapses on mobile.
- Demonstration records use an explicit is_demo flag. Administrators can move records into or out of the demonstration view after confirmation without deleting their contents.

## Validation

Verified: 5 unit/database tests passed, all 5 browser acceptance scenarios passed (no skips/retries), targeted ESLint passed without warnings, and the full Next.js production build including TypeScript passed using isolated configuration.

Run from the repository root after npm ci:

~~~sh
npm run test:chemical
npm run test:chemical:e2e
~~~

The browser suite starts a local Next.js server on port 4310 and a disposable PostgreSQL database (PGlite) behind a limited PostgREST adapter on port 4311. Test credentials are synthetic and local-only. The adapter checks application requests but does not reproduce every hosted Supabase behavior. Browser scenarios verify actual inserted database rows, persisted human review, cross-company denial, optimistic concurrency, loading/error behavior, policies, mobile layout, matrix keyboard/print behavior, AI provenance and editor scope locking. AI extraction responses are fixtures; no paid AI requests are sent.

Do not run this preview against a shared or production database. For manual local inspection use npm run preview:chemical and sign in with audit-admin / local-test-only.

Hosted Supabase Storage uploads and real AI extraction still require a staging smoke test with a non-production SDS. The print check verifies symbols and unclipped overflow in print CSS, not a physical printer.

## Rollout

1. Back up the three chemical tables and record the current deployment. Confirm SUPABASE_SERVICE_ROLE_KEY is configured. TOOLS_SESSION_SECRET is recommended; otherwise the service role key signs sessions. This release requires users with old browser-only sessions to sign in again and uses 12-hour sessions.
2. Check existing storage-area relations before applying the migration:

~~~sql
select s.id, s.company_id, a.company_id as area_company_id
from public.chem_substances s
join public.chem_storage_areas a on a.id = s.storage_area_id
where s.company_id <> a.company_id;
~~~

Resolve any returned rows through an authorized data correction first; do not silently reassign them.
3. Apply supabase/migrations/20261009044828_chemical_integrity.sql and release the matching application together. The migration adds review/policy/demo fields, a composite company/area constraint, and removes direct client-table access. The new API join refers to that constraint, so do not activate the new app before the migration succeeds.
4. Confirm hosted session login, direct company links, one staging save and its database company_id, company switching, SDS access and poster settings. Configure each company's review policy from its approved internal document; no universal five-year expiry is assumed.
5. Prefer a forward fix if rollout fails. Keep the added data columns. Do not re-enable unrestricted client-table access as a rollback shortcut.

## Demonstration data decision

Read-only production inspection found three named examples. One already has a later updated_at, and another has a storage area linked. No automatic deletion or mass classification is included. Review their usage before an administrator explicitly marks individual records as demonstrations. The new flag is reversible and preserves files, relationships and review history.
