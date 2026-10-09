# Chemical container labels

## Behavior

The register uses standard OSHA-published GHS artwork and labeled action tiles. The new **ฉลาก** action opens `/chemical/[id]/label`, using the existing authenticated, company-scoped substance API.

Users download an actual PDF without opening the browser print dialog. Default label dimensions are 90 × 120 mm, with editable width, height, font size and copies. A4 sheets use 10 mm margins and 4 mm gutters; a second mode produces one label per page with the selected physical page dimensions. Users should print in color at actual size / 100%.

Labels contain product identity, CAS/UN, selected GHS pictograms, signal word, all H/P statements, supplier and emergency contact. Container quantity and optional details can be entered separately; stock quantity is never copied as bottle contents. Changes on this page affect only the PDF draft, not the registry. Demo records remain visibly marked.

H/P defaults use the existing abbreviated Thai lookup dictionaries and are labeled accordingly in the editor. Unknown codes and incomplete template placeholders remain visible until replaced with wording from the product SDS. Long content is never silently truncated or auto-shrunk: the preview shows all text, reports required height and blocks export until the label fits. There is no assessment or review workflow and no database migration.

The browser's Thai text shaping and locally hosted OFL-licensed Noto Sans Thai render one 300 DPI bitmap reused in both preview and PDF. PDF label text is rasterized, not searchable. jsPDF is lazy-loaded on download. Missing font or pictogram assets stop export instead of silently producing incomplete labels. Artwork and font sources/licenses are recorded under public/ghs and public/fonts.

## Verification

- TypeScript and targeted ESLint passed.
- Four browser/API tests passed: register action, real PDF downloads, unchanged source data and mobile layout; long/unknown statements and demo marking; company isolation and missing pictograms; missing Thai font.
- A4 sample: 210 × 297 mm, two pages with 4 + 1 labels. Individual-page sample: 150 × 130 mm landscape, two pages with one label each. Physical sizes and image placement counts were checked with pypdf.
- Poppler-rendered PDFs were visually inspected for Thai typography, GHS symbols, wrapping and margins. Sample files use an isolated test record, not a production chemical/SDS.
- Browser screenshots and sample PDFs are local verification artifacts under test-results, excluded from deployment.

Authenticated behavior was exercised against the isolated local API/database fixture. No production chemical record was modified for testing.

## Release

Live on https://tools.eashe.org/chemical on 2026-10-09. Source commit 3dbd3a9; deployment dpl_FS1zWg4jvwgAMNkEZvA8YTqB6hzD (https://ppe-tools-6694ekor6-ea-she.vercel.app).

Built remotely with the configured production environment and staged using --skip-domain. Compilation, TypeScript and all 53 static pages passed; the dynamic label route was included. Staged label/font requests returned 200, and an anonymous substance request returned 401 before promotion.

After promotion, the custom domain served all nine GHS images and the local font successfully. Anonymous session/substance requests remained 401. A fresh isolated Chrome browser ran the deployed client with synthetic session/substance responses intercepted locally in the browser, and downloaded a valid 151,281-byte PDF with no page errors. This verifies deployed rendering and lazy PDF loading, not authenticated access to live company records. The smoke script is tests/chemical-label-deployed.cjs; it makes no production writes. No error-level Vercel runtime logs were returned during the check.
