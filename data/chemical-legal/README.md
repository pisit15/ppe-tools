# Thai chemical legal reference release

`catalog-2026-10-09.json` is the versioned source for the first reference-data migration. It is a **partial, explicitly reviewed dataset**, not a certification of the user's complete legal obligations.

The original Amita Excel workbook is unchanged. No production data has been changed by creating this release.

## Provenance and coverage

Every entry carries a document ID, PDF page, legal account/item, original printed CAS, candidate canonical CAS, conditions, revision, legal status and independent review state. Source URLs point to Thai government documents, except the explicitly identified NIST chemical identity reference.

The import contains 2,089 reference entries, including historical text:

- 1,516 Labour Department list entries, compared to the official list by item number and printed CAS. Most still require individual verification. A name or CAS copied from a legal source is not automatically a correct chemical identity.
- 206 วอ./อก.7 entries matched by hazardous-list account/item. Only the explicitly verified subset can inform the screening rule.
- 324 main exposure-limit entries. Unreviewed extracted values and missing subsidiary rows are conspicuous; they cannot generate a confirmed limit result.
- All 21 changes in hazardous-list amendment 8 (17 replacements, 2 additions, 2 repeals), selected other hazardous entries, and historical cyanide/methanol text.
- Health-check criteria and selected explicit name mappings. No blanket automatic mapping of the 72 health entries to CAS numbers.

59 entries have source-verified status, 1,882 are pending, and 148 have unresolved identity/CAS parsing conflicts. `verified` means checked against the cited source; it does not mean a company is compliant, a formulation is in scope, or a lawyer has approved an assessment. The unresolved 7 October 2557 correction and other coverage gaps are shown in the application.

`source_cas` preserves what the document says. `cas_numbers` contains only complete CAS identifiers with valid check digits. No Excel serial/numeric value is guessed back into a CAS. The 2-aminopyridine Labour entry keeps printed `95-53--4`, candidate `504-29-0`, and conflict status with both sources.

Historical status is per legal account/item, not per CAS. In particular, repealing FDA 4.1 item 159 does not repeal all methanol uses. Unknown commencement dates remain null; they are not invented. The UI does not offer retrospective legal determinations for dates without a fully reconstructed timeline.

## Generating and validating the initial seed

Run `npm run build:chemical:legal-seed` to regenerate only the marked seed block of `20261009070004_chemical_legal_catalog.sql`. This migration was created with `supabase migration new chemical_legal_catalog`.

Run `npm run test:chemical`, `npm run test:chemical:e2e`, and `npm run test:chemical:build`. The build command uses non-production placeholders: validate compilation with it, but never deploy its prebuilt output. The local fixture applies actual PostgreSQL DDL using PGlite and serves a small test-only PostgREST adapter. It is not a hosted-Supabase integration test.

Once deployed, **never edit this migration or mutate the published release**. Create a new CLI-generated migration and new release ID, retaining previous releases and entries. Verify each changed entry against its PDF page and amendment chain, repair subsidiary rows, update coverage/counts, and atomically switch `is_current` inside one transaction. Application credentials cannot edit reference data or old assessment snapshots.

## Screening rules and access

- CAS is a search identity, not a legal verdict. Name matches require explicit candidate selection. Group controls are shown separately and are never represented as exact CAS matches.
- วอ./อก.7 requires a verified list entry plus user-confirmed applicable scope, half-year, and evidence of having/having had at least 100 kg in possession per listed name in that period. Current stock, annual consumption, litres and kilograms are not substituted for that evidence.
- สอ.1, hazardous type, health and exposure screens retain conditions instead of returning an unconditional YES/NO. No automatic medical examination selection or numeric exposure compliance verdict is produced.
- Authenticated API routes validate signed Tools sessions and company access. All four new tables have RLS; anon/authenticated have no direct privileges. The service role has read-only catalog privileges and insert/read assessment privileges. The composite company/substance foreign key prevents cross-company attachment.
- Save recomputes the snapshot on the server, binds the actor to the session, checks the current legal release afresh, and rejects stale register timestamps or a changed CAS. Client-supplied verdicts/reviewer identities are ignored. Context review never upgrades pending reference entries.
- CSV includes provenance, status and limitations and neutralizes formula-leading characters.

## Deployment boundary

Apply the legal migration to the intended hosted project **before** deploying the UI release. Without the schema/current release, the API returns an explicit 503; there is no silent empty-catalog or bundled-data fallback. After deployment verify both an authenticated same-company read and a foreign-company denial, save a designated test assessment, verify its database snapshot, and retain/delete only explicitly designated test data under an approved cleanup plan.
