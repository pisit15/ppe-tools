# Chemical legal screening — production release

Status: v2 live on https://tools.eashe.org/chemical/legal on 2026-10-09. Current deployment (2026-10-10): dpl_BiX3bo5HsWaruLjkaDub7JGu9BFj (https://ppe-tools-77jqumzsd-ea-she.vercel.app), source commit c235d0b, catalog migration unchanged at 20261009084432. Recent additions are documented in CHEMICAL-SDS-IMPORT-RELEASE.md, HOME-CARDS-RELEASE.md, CHEMICAL-LABEL-RELEASE.md, CHEMICAL-LABEL-PRESETS-RELEASE.md, CHEMICAL-LABEL-VERSIONS-RELEASE.md CHEMICAL-LABEL-PPE-RELEASE.md CHEMICAL-LABEL-PPE-ARTWORK-RELEASE.md and CHEMICAL-LABEL-CAPTIONS-RELEASE.md.

## Initial release (historical)

Deployment: dpl_6iY74PA2vrxmBuEkgQ6x15qMYSTu (https://ppe-tools-95x175gcf-ea-she.vercel.app). Source commit: 32b598f. Hosted catalog migration: 20261009081023. Built remotely with production configuration, checked before promotion, then promoted with Vercel CLI.

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
- Read-only hosted schema inspection confirmed company_settings has PRIMARY KEY (company_id), matching the migration's foreign key. Hosted migration and reference seed are applied: 2,089 entries and 17 sources; all four new tables have RLS and no anon/authenticated grants. Application credentials can only read reference data and insert/read assessments. Existing 3 substances and 1 storage area are unchanged. The API body limit required seed transport in 24 batches; the release was activated only after count/status verification. The local migration embeds the same complete seed for reproducible clean installs. Production smoke checks passed: staged page HTTP 200; anonymous legal API HTTP 401; tools.eashe.org resolved to the new deployment; authenticated AMT register, Acetone detail/history read and external Toluene search loaded from hosted catalog with source PDF/page and conditions. No runtime error logs were returned for this deployment during the check. Saving/history and cross-company rejection were exercised by local E2E tests; no production assessment was created. Supabase security advisor reports RLS with no policies on the four new tables: this is intentional default-deny direct-client access, with authenticated server routes enforcing company scope and restricted service-role grants. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy .

## Local review

Preview: http://127.0.0.1:4310/chemical/legal?company_id=amt

Uses an isolated, in-memory PGlite test database and local-only test accounts. The original Excel, production company records and SDS files are unchanged. Restarting tests/chemical-preview.cjs resets the preview data.

## Deployment sequence

1. Confirm the intended Vercel/Supabase project and current migration history; review the remaining legal-data limitations.
2. Apply 20261009081023_chemical_legal_catalog.sql to that project's database. It adds four tables and a scoped-identity index; it does not modify existing substance rows.
3. Deploy the source with the project's actual configured environment. Do not publish the local placeholder build.
4. Verify login → same-company register lookup → source links → approved test assessment → database snapshot and cross-company denial.
5. Keep the reference release immutable; publish subsequent data corrections as new releases.

## Follow-up: reuse audited evidence; defer review workflows

Live: catalog applied in hosted migration 20261009084432; UI built remotely, smoke-checked and promoted to tools.eashe.org. Reference v2 reconciles 1,911 entries with existing dated audit evidence, yielding 1,970 verified / 85 pending / 34 conflicts. No old release or assessment is deleted. UI now focuses on register, SDS and source-backed legal lookup. Removed review-period settings, review counters/status, review checkbox, unreviewed poster banner and legal assessment form. Emergency settings, source links, conditions and CSV remain.

Validation for the follow-up: 15 unit/PostgreSQL tests and 11 browser scenarios passed; targeted ESLint passed. Production SQL confirms v2 is current, both immutable reference versions remain, and existing company substances (3) and assessments (0) are unchanged.

Production follow-up verification: remote Next.js build, TypeScript and 53 static pages passed. Staged page returned HTTP 200 and unauthenticated API returned HTTP 401. Authenticated browser checks on tools.eashe.org confirmed four register cards with no review policy/status, emergency-only settings, and verified Labour/exposure references for Hydrogen peroxide and Sodium hydroxide. No error-level runtime logs were returned during the smoke check. Screenshots are saved in ../outputs/chemical-legal-system/production-register-v2.png and production-settings-v2.png.

## Follow-up: use the EA SHE legal library

Source commit: 874e5f2. Reads the existing shared law_documents table to resolve 16 legal source groups to 22 library laws. Source, related-law and CSV links open the EA SHE library; document buttons use URLs maintained by that library. Hazardous-list entries link to their actual revision. Audited government URLs and original PDF page evidence remain immutable, with no new page anchor assumed for a library copy. NIST is explicitly a non-law identity reference. No database mutation or migration.

Validation: 17 unit/PostgreSQL tests, 6 legal browser scenarios and targeted ESLint passed. Tests cover the screenshot’s four Labour links, CSV, revision-specific mappings, safe URLs, missing links and edited library metadata. Read-only hosted SQL confirmed all mapped codes and existing service-role read permission. Production rollout verification is recorded below.

Live on tools.eashe.org: dpl_GZoRax2JWPUP1Cw4vD8SB7pnAuyZ (https://ppe-tools-aud6qza1s-ea-she.vercel.app). Remote production build, TypeScript and all 53 static pages passed. Staged page HTTP 200 and anonymous API HTTP 401 checked before promotion. Authenticated production Acetone Labour detail displays MOL-0261, MOL-0260, MOL-0262 and MOL-1117 links to eashe.org and document URLs identical to the shared library. Opening the MOL-0261 library URL returned its single matching law. No error-level deployment logs returned during verification. Screenshot: ../outputs/chemical-legal-system/production-library-links.png.

## Follow-up: direct Google Drive links

Live deployment dpl_8j7hBwd7AnhG6rjY3wgEdEKQAqrV, source 7ecaf96. Each law title now directly opens the Google Drive URL maintained in the shared EA SHE library. Removed duplicate document buttons and intermediate library links. CSV uses the same Drive destination. Missing Drive URLs remain plain text instead of a different destination. Audited catalog and company data unchanged.

Validation: 12 legal unit/PostgreSQL tests, the affected register-to-source-to-CSV browser scenario, and targeted ESLint passed. Remote production build, TypeScript and 53 static pages passed. Staged page HTTP 200 and anonymous API HTTP 401 checked before promotion. The computer-use browser could not launch due to a Windows runtime volume error; no new authenticated production UI verification is claimed. Local browser screenshot: tests output test-results/chemical-legal-desktop.png.
