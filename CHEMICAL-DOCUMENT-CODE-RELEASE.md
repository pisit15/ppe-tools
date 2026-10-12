# Company document codes in the chemical register

User clarification: this is the company-assigned code/document number, not CAS or UN.

- Optional **รหัส / หมายเลขเอกสาร** field in new/edit substance forms, up to 120 characters, stored with the company-scoped substance.
- **รหัส / เลขเอกสาร** column sorts naturally (2 before 10) in either direction. Missing codes remain last; ties use name/id. Sorting applies before pagination and resets to page 1.
- Register search includes the code. Existing records remain blank until the company enters its own identifier; no code is guessed from a product name or chemical number.
- New/reset posters inherit the register code. Saved poster revisions retain their frozen document numbers.
- PATCH-style omitted fields preserve existing values; explicit blank/null clears the code. Server rejects non-text/oversized values. Existing company authorization and optimistic-write checks apply.

Migration `20261012055604_chemical_document_code.sql` applied to hosted project `wdjhsalkmjbrujqzqllu`. Read-only checks confirmed the nullable text column, RLS enabled, anonymous SELECT denied, service UPDATE permitted, and no inferred codes. Supabase advisor INFO for RLS-without-client-policy is the existing server-only model: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Validation: 9 browser/API journeys passed (4 document-code and 5 register regression cases), including persistence/reopen, natural ordering, blanks last, search, pagination, partial edits, invalid input, cross-company denial, and poster snapshot preservation. TypeScript and targeted ESLint passed. React check: labelled input, maxlength/help text, accessible sort headers, stable memoized comparator, copied arrays before sorting; mobile viewport has no page overflow.

Production verification: `node tests/chemical-document-code-deployed.cjs https://tools.eashe.org` checks the compiled public-domain register, both sort directions, code search, create/edit field and retained label/poster actions. This uses read-only page API fixtures in an isolated browser; no production customer records are written. Publish the tested combined source to `main` and verify the domain resolves to the resulting Git deployment.

Verified on the public domain on 2026-10-12: application commit `aaf20d2dc9325a67cf07b9d683da48bc126998eb`, Git production deployment `dpl_H3s9GqcerDFT7tJxzyaRYavhkPdP`. Natural ascending/descending order, missing-code placement, code search, create/edit fields, and label/poster actions passed with zero browser errors. The follow-up includes only this record and a read-only settings fixture for the deployed smoke test; application source is unchanged.
