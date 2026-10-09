# Chemical legal screening — local release candidate

Status: production deployment in progress on 2026-10-09. Hosted catalog migration 20261009081023 is applied and verified.

## Behavior

- New /chemical/legal page, sidebar link and per-register-row action. Search registered substances or external Thai/English names and CAS identifiers.
- Five law categories: hazardous type/agency/account/revision, วอ./อก.7, สอ.1, health examinations, and exposure limits. Each entry retains conditions and a source PDF/page.
- Separate source-verification status, legal repeal/replacement status, and company-context review status. Incomplete evidence never produces an exemption.
- All 21 amendment-8 changes are represented. This remains a partial reference release overall: 2,089 entries, 59 source-verified, 1,882 pending, 148 identity/CAS conflicts. See data/chemical-legal/README.md.
- Company-scoped assessment snapshots preserve the reference version, user context, actor, notes and server-computed screening result. Old snapshots and reference entries cannot be changed by application credentials.
- CSV export includes provenance/status/limitations. CSV should be imported with CAS columns treated as text.

## Verification

- 14 unit/PostgreSQL tests passed, including CAS checksums, conflict preservation, entry-specific repeal, amendment 8, separate TWA/peak/duration/ceiling, conditional reporting, constraints and direct-access denial.
- 5 existing Chemical browser scenarios passed. All 5 new legal browser scenarios passed after correcting selectors that initially matched both hazardous and reporting entries.
- A subsequent API test confirmed all 1,004 active AMT records were returned across pages, with foreign-company rows excluded.
- Browser tests checked persisted database snapshots, reload/history, CSV download, desktop/mobile layouts, stale writes, forged reviewer/results, anonymous/cross-site/cross-company rejection, source pagination and failed-load recovery.
- Targeted ESLint passed. Next.js production compilation, TypeScript and all 53 static pages passed with build-only placeholder configuration. No build output using these placeholders should be deployed.
- Read-only hosted schema inspection confirmed company_settings has PRIMARY KEY (company_id), matching the migration's foreign key. Hosted migration and reference seed are applied: 2,089 entries and 17 sources; all four new tables have RLS and no anon/authenticated grants. Application credentials can only read reference data and insert/read assessments. Existing 3 substances and 1 storage area are unchanged. The API body limit required seed transport in 24 batches; the release was activated only after count/status verification. The local migration embeds the same complete seed for reproducible clean installs. Deployment smoke checks remain.

## Local review

Preview: http://127.0.0.1:4310/chemical/legal?company_id=amt

Uses an isolated, in-memory PGlite test database and local-only test accounts. The original Excel, production company records and SDS files are unchanged. Restarting tests/chemical-preview.cjs resets the preview data.

## Deployment sequence

1. Confirm the intended Vercel/Supabase project and current migration history; review the remaining legal-data limitations.
2. Apply 20261009081023_chemical_legal_catalog.sql to that project's database. It adds four tables and a scoped-identity index; it does not modify existing substance rows.
3. Deploy the source with the project's actual configured environment. Do not publish the local placeholder build.
4. Verify login → same-company register lookup → source links → approved test assessment → database snapshot and cross-company denial.
5. Keep the reference release immutable; publish subsequent data corrections as new releases.
