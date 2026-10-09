# Thai chemical legal reference release

`catalog-2026-10-09-v2.json` is the current reference release. `catalog-2026-10-09.json` remains the immutable first release. It is a **partial, explicitly reviewed dataset**, not a certification of the user's complete legal obligations.

The original Amita Excel workbook is unchanged. The reference release is applied through a versioned migration; company substances and saved assessments are unchanged.

## Provenance and coverage

Every entry carries a document ID, PDF page, legal account/item, original printed CAS, candidate canonical CAS, conditions, revision, legal status and independent review state. Source URLs point to Thai government documents, except the explicitly identified NIST chemical identity reference.

The import contains 2,089 reference entries, including historical text:

- 1,516 Labour Department list entries, compared to the official list by item number and printed CAS. 1,482 are source-verified; 34 retain printed-CAS conflicts. A name or CAS copied from a legal source is not automatically a correct chemical identity.
- 206 วอ./อก.7 entries matched by hazardous-list account/item. 144 are source-verified; 62 still require mapping evidence. Only the verified subset can inform the screening rule.
- 324 main exposure-limit entries. 301 are source-verified; 23 retain unresolved units, identities or subsidiary rows and cannot generate a confirmed limit result.
- All 21 changes in hazardous-list amendment 8 (17 replacements, 2 additions, 2 repeals), selected other hazardous entries, and historical cyanide/methanol text.
- Health-check criteria and selected explicit name mappings. No blanket automatic mapping of the 72 health entries to CAS numbers.

Version 2 reuses the prior audit: 1,970 entries are source-verified, 85 still need specific mapping/table evidence, and 34 retain genuine printed-CAS conflicts. The first release had 59 verified, 1,882 pending and 148 conflicts because audited rows were not reconciled and blank/group CAS was treated as a conflict. `verified` means checked against the cited source; it does not mean a company is compliant, a formulation is in scope, or a lawyer has approved an assessment. The unresolved 7 October 2557 correction and other coverage gaps are shown in the application.

`source_cas` preserves what the document says. `cas_numbers` contains only complete CAS identifiers with valid check digits. No Excel serial/numeric value is guessed back into a CAS. The 2-aminopyridine Labour entry keeps printed `95-53--4`, candidate `504-29-0`, and conflict status with both sources.

Historical status is per legal account/item, not per CAS. In particular, repealing FDA 4.1 item 159 does not repeal all methanol uses. Unknown commencement dates remain null; they are not invented. The UI does not offer retrospective legal determinations for dates without a fully reconstructed timeline.

## Generating and validating the initial seed

Run `npm run build:chemical:legal-seed` to regenerate only the marked seed block of `20261009081023_chemical_legal_catalog.sql`. This migration was created with `supabase migration new chemical_legal_catalog`.

Run `npm run test:chemical`, `npm run test:chemical:e2e`, and `npm run test:chemical:build`. The build command uses non-production placeholders: validate compilation with it, but never deploy its prebuilt output. The local fixture applies actual PostgreSQL DDL using PGlite and serves a small test-only PostgREST adapter. It is not a hosted-Supabase integration test.

Once deployed, **never edit this migration or mutate the published release**. Create a new CLI-generated migration and new release ID, retaining previous releases and entries. Verify each changed entry against its PDF page and amendment chain, repair subsidiary rows, update coverage/counts, and atomically switch `is_current` inside one transaction. Application credentials cannot edit reference data or old assessment snapshots.

## Reference rules and access

- CAS is a search identity, not a legal verdict. Name matches require explicit candidate selection. Group controls are shown separately and are never represented as exact CAS matches.
- วอ./อก.7 requires a verified list entry plus user-confirmed applicable scope, half-year, and evidence of having/having had at least 100 kg in possession per listed name in that period. Current stock, annual consumption, litres and kilograms are not substituted for that evidence.
- สอ.1, hazardous type, health and exposure screens retain conditions instead of returning an unconditional YES/NO. No automatic medical examination selection or numeric exposure compliance verdict is produced.
- Authenticated API routes validate signed Tools sessions and company access. All four new tables have RLS; anon/authenticated have no direct privileges. The service role has read-only catalog privileges and insert/read assessment privileges. The composite company/substance foreign key prevents cross-company attachment.
- The retained assessment API (not exposed by the current UI) recomputes the snapshot on the server, binds the actor to the session, checks the current legal release afresh, and rejects stale register timestamps or a changed CAS. Client-supplied verdicts/reviewer identities are ignored. Context review never upgrades pending reference entries.
- CSV includes provenance, status and limitations and neutralizes formula-leading characters.

## Deployment boundary

Apply the legal migration to the intended hosted project **before** deploying the UI release. Without the schema/current release, the API returns an explicit 503; there is no silent empty-catalog or bundled-data fallback. After deployment verify authenticated register and legal-source reads, updated reference counts, anonymous denial, and the absence of deferred review workflows. Assessment writes are exercised only in isolated tests; no production assessment is required.

## Audit reconciliation and current product scope

Run `node scripts/reconcile-chemical-legal-audit.cjs` to reproduce the v2 catalog, evidence manifest and migration `20261009084432_chemical_legal_audit_reconciliation.sql`. The evidence package retains prior source rows and artifact SHA-256 values. Each promoted entry records which fields were checked. No numeric CAS is guessed; whitespace-only normalization preserves printed source CAS; blank CAS groups remain name-only; complex exposure subsidiary rows and reporting exception mappings are not auto-promoted. Both reference releases remain available for old snapshots.

The user requested a register/SDS/legal-reference workflow only. Review KPIs, SDS review-period settings, substance-review confirmation/status, unreviewed poster banners and legal-assessment forms are removed from the UI. Existing database review fields, policies and assessment history are preserved; they are not used as prerequisites for registry or legal search.
