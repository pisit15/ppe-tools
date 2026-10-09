# Saved chemical label versions

Labels previously lost edited wording and print options when the page closed. Users can now save immutable V1, V2, V3 snapshots per substance, open the most recently saved version on another device, and select an older version to print or edit into a new version. Each save records the authenticated account and server time, with an optional label name such as “ขวด 500 มล.”. Company users share labels for their own company's substances; Tools administrators retain their existing cross-company access.

“เริ่มใหม่จากข้อมูลทะเบียน” fetches the current registry record and restores the default print options in the editor. It does not delete any version or automatically save a new one. A subsequent save preserves that reset as a new version. Merely downloading a PDF does not save a version. Unfinished label text can be saved; PDF validation and overflow protection still apply before export.

## Storage and authorization

- Migration `20261009141355_chemical_label_versions.sql` adds one RLS-enabled table and the service-only, security-invoker `chem_save_label_version` function. Anonymous/authenticated clients have no direct privileges; the service role can select/insert, but cannot update/delete saved snapshots.
- Authenticated API GET/POST `/api/chemical/substances/[id]/labels` verifies the current account and actual active substance/company. POST uses existing same-origin CSRF checks, a strict schema, and server-derived creator details. Client company/creator values are ignored.
- A lock on the parent substance serializes version assignment without changing its `updated_at`. A per-substance request UUID makes retry after a lost response idempotent. Reusing that UUID with different content/creator is rejected.
- Only editable text, GHS selections, signal word and validated print settings are persisted. SDS destinations and demo status are derived from the current registry on reopening/recalling a version. QR codes continue to resolve the current SDS; a label version is not an archived SDS or archived PDF.
- History summaries are paged 50 at a time. A failed history fetch is shown as an error with retry, never as an empty history. Failed saves preserve the draft. Leaving with unsaved edits, changing versions, and reset have discard protection.

## Verification

One PostgreSQL/PGlite integration test verifies RLS/privileges, service-role immutability, RPC scoping and retry behavior. Ten browser/API tests passed: six existing PDF/preset/QR cases plus four version-history cases. Coverage includes cross-device reopening, V1 → V2 → recall V1 → V3, fresh-registry reset, history pagination past 50, spoofed attribution/QR rejection, inactive/foreign-company access, malformed payloads, simultaneous saves, lost-response retry and unsaved draft protection. Registry content/timestamps are unchanged by label saves.

Desktop and 390 px mobile layouts inspected. Targeted TypeScript and ESLint checks passed. Test data are isolated local fixtures; no real customer records were changed for testing.

## Rollout

Pending production rollout. Add the migration before promoting the new application. Rollback can promote the previous deployment while keeping saved versions intact; do not drop the history table.
