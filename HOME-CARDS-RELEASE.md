# Tools homepage card management

Admins signed in to tools.eashe.org can choose “จัดการการ์ด” on the homepage to edit each card's name and description, hide it, or restore it. Hidden cards remain in the editor. Each card has its own save/cancel controls. These settings are global across companies and affect homepage presentation; tool routes and permissions remain application controlled.

Data is stored in tools_home_cards, separate from eashe.org's project_portal_settings. Migration 20261009122344 seeds the five existing cards with their original text and all visible. Public GET /api/home-cards returns only visible cards and excludes editor identity. No static fallback can briefly reveal a hidden card during loading or request failure.

GET/PATCH /api/admin/home-cards verifies the signed Tools session and active admin account, checks write origin, restricts editable fields and validates lengths/types. Updates match an integer revision atomically; a conflicting edit returns 409 without overwriting another admin's work. The editor preserves the unsaved draft and offers a reload. updated_by is derived from the verified account. RLS denies direct clients, and the server has SELECT plus UPDATE grants limited to editable/audit columns, with no INSERT/DELETE permission.

## Verification

- One real PostgreSQL/PGlite test passed for seed defaults, validation constraints and direct-client/service-role permissions.
- Four browser/API scenarios passed for edit/hide/restore and reload persistence, public projection, nonadmin and anonymous rejection, forged fields, cross-site writes, atomic concurrent edits, stale editor handling, loading/retry, all-hidden recovery, and a 390px mobile viewport.
- Targeted ESLint and TypeScript checks passed. Browser screenshots: test-results/home-cards-admin.png and home-cards-admin-mobile.png.
- Hosted SQL confirms all five original cards visible at revision 1, RLS enabled, no anon/authenticated privileges and the intended service-role column grants.
- Security advisor reports [RLS enabled with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), intentional for server-only access. No performance finding names the new table. Other advisor findings relate to pre-existing objects.

## Production rollout

Live on https://tools.eashe.org/ on 2026-10-09. Source commit 8bd090a; deployment dpl_J4emd2shUDTVjD4ZpSnLp478n1XD (https://ppe-tools-804r5n1rb-ea-she.vercel.app). Built remotely with production configuration, staged with --skip-domain, checked, and promoted.

Remote production compilation, TypeScript and 53 static pages passed. The staged public API returned the five original cards with HTTP 200; anonymous PATCH to the admin API returned HTTP 401. A fresh, signed-out Chrome browser on the custom domain then displayed all five cards, showed the admin login link with no management controls, and passed a 390px mobile overflow check with no JavaScript page errors. Admin GET and PATCH both returned HTTP 401. Screenshots: ../outputs/home-cards/production-homepage.png and production-homepage-mobile.png. No error-level runtime logs were returned during the check.

Admin editing/hiding/restoring was verified against the isolated local test database, not by modifying a production card. Hosted SQL after rollout confirms all five original cards remain visible at revision 1. Existing project_portal_settings remains at revision 4.
