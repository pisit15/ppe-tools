# Saved chemical label versions

Labels previously lost edited wording and print options when the page closed. Users can now save immutable V1, V2, V3 snapshots per substance, open the most recently saved version on another device, and select an older version to print or edit into a new version. Each save records the authenticated account and server time, with an optional label name such as “ขวด 500 มล.”. Company users share labels for their own company's substances; Tools administrators retain their existing cross-company access.

“เริ่มใหม่จากข้อมูลทะเบียน” fetches the current registry record and restores the default print options in the editor. It does not delete any version or automatically save a new one. A subsequent save preserves that reset as a new version. Merely downloading a PDF does not save a version. Unfinished label text can be saved; PDF validation and overflow protection still apply before export.

## Storage and authorization

- Migration `20261009163428_chemical_label_versions.sql` adds one RLS-enabled table and the service-only, security-invoker `chem_save_label_version` function. Anonymous/authenticated clients have no direct privileges; the service role can select/insert, but cannot update/delete saved snapshots. The CLI-created filename was synchronized to the actual hosted migration ID after application.
- Authenticated API GET/POST `/api/chemical/substances/[id]/labels` verifies the current account and actual active substance/company. POST uses existing same-origin CSRF checks, a strict schema, and server-derived creator details. Client company/creator values are ignored.
- A lock on the parent substance serializes version assignment without changing its `updated_at`. A per-substance request UUID makes retry after a lost response idempotent. Reusing that UUID with different content/creator is rejected.
- Only editable text, GHS selections, signal word and validated print settings are persisted. SDS destinations and demo status are derived from the current registry on reopening/recalling a version. QR codes continue to resolve the current SDS; a label version is not an archived SDS or archived PDF.
- History summaries are paged 50 at a time. A failed history fetch is shown as an error with retry, never as an empty history. Failed saves preserve the draft. Leaving with unsaved edits, changing versions, and reset have discard protection.

## Verification

One PostgreSQL/PGlite integration test verifies RLS/privileges, service-role immutability, RPC scoping and retry behavior. Ten browser/API tests passed: six existing PDF/preset/QR cases plus four version-history cases. Coverage includes cross-device reopening, V1 → V2 → recall V1 → V3, fresh-registry reset, history pagination past 50, spoofed attribution/QR rejection, inactive/foreign-company access, malformed payloads, simultaneous saves, lost-response retry and unsaved draft protection. Registry content/timestamps are unchanged by label saves.

Desktop and 390 px mobile layouts inspected. A reopened V3 generated an actual PDF; Poppler rendering confirmed the saved Thai title, container quantity, four-up layout and QR. Targeted TypeScript and ESLint checks passed. Test data are isolated local fixtures; no real customer records were changed for testing.

## Rollout

Live on https://tools.eashe.org/chemical on 2026-10-09. Application source commit `b359371`; deployment `dpl_6L5ZWnMr6S6Sb2d2yv6REeDupsqt` at https://ppe-tools-jo6tvwxg7-ea-she.vercel.app. The migration was applied and grants verified before promotion. Remote production compilation, TypeScript and all 53 static pages passed.

After promotion, anonymous history/registry APIs returned 401, and the current active Sulfuric acid attachment resolved publicly with a 307 redirect. The old Acetone demo returned 404 because its record is now inactive, confirmed by a read-only database query. A fresh isolated Chrome instance loaded the deployed client with browser-local synthetic session/substance/history responses: it restored V2, displayed the recorded author, decoded the QR, and downloaded a 94,757-byte PDF with no page errors. This client smoke check did not authenticate to live private APIs or write production label versions; the authenticated save/load/reset flow was exercised against the isolated local database. No error-level runtime logs were returned during rollout.

Supabase security advisors reported only the expected new [RLS enabled/no policy INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for this server-only table. Existing unrelated advisories were unchanged. Verified production privileges deny anonymous/authenticated reads/writes/RPC and service-role UPDATE/DELETE; service RPC remains enabled.

Rollback can promote the previous deployment `dpl_E4ujS7pofv49N35fDDroG4Uiq8go` while keeping saved versions intact; do not drop the history table.
