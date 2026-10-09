# A4 label presets and public SDS QR

## User-visible behavior

The label editor offers eight ready-made layouts with diagrams instead of requiring manual dimensions. These are cut-your-own A4 layouts with 10 mm margins and 4 mm gutters, not vendor-specific adhesive-sheet templates.

| Label orientation | Per A4 | Label mm | Paper orientation |
| --- | --- | --- | --- |
| Landscape | 8 | 93 × 66.2 | Portrait |
| Landscape | 6 | 136.5 × 60.6 | Landscape |
| Landscape | 4 | 136.5 × 93 | Landscape |
| Landscape | 2 | 190 × 136.5 | Portrait |
| Landscape | 1 | 277 × 190 | Landscape |
| Portrait | 6 | 60.6 × 136.5 | Portrait |
| Portrait | 4 | 93 × 136.5 | Portrait |
| Portrait | 1 | 190 × 277 | Portrait |

Choosing a preset fills one sheet by default; users can change the total number of copies. Custom dimensions, paper orientation and individual-page PDFs remain available. The default is four portrait labels. Full mode retains all existing content. Compact mode is an explicit choice, initially using 8 pt type, and clearly lists the printed fields (identity, GHS, signal, all H statements, container quantity, emergency contact and SDS QR). It omits P statements, supplier and extra notes. Neither mode silently crops overflowing text or switches modes to force a fit.

## SDS access

The user explicitly requested that attached SDS documents be accessible without login. Printed QR codes point to a stable canonical URL, `https://tools.eashe.org/sds/[substance-id]`. PDF readers can also click the QR.

The public GET route resolves only the current attachment of an active chemical. For stored files it validates the company prefix and creates a fresh five-minute signed URL; for external SDS links it redirects to the stored HTTP(S) URL. File attachments take priority. QR codes contain no expiring signature, and continue to resolve after SDS replacement. Removing the attachment or retiring the record makes subsequent scans return 404. Already-issued signed links may work until their five-minute expiry.

SDS files are intentionally public through this route across active companies. The storage bucket remains private, tables are not granted anonymous access, and registry reads/edits/uploads retain their existing authorization. No database migration is needed. Upload and label screens explain public SDS access. External Drive/vendor links remain subject to the external owner's sharing controls. The route is no-store and noindex, and does not return inventory fields or accept arbitrary paths/redirect destinations.

## Verification

- Six browser/API tests passed, covering all eight downloads, overflow, missing fields/assets/fonts, QR decoding, mobile layout, anonymous document resolution, replacing a link with an uploaded file, attachment removal and retired/missing records. Authenticated registry and arbitrary storage APIs still reject anonymous access.
- PDF page dimensions, label counts and clickable-link rectangles checked for all eight presets with pypdf.
- QR codes independently decoded from the actual PDF-embedded images using jsQR, all eight pointing to the expected stable URL.
- Poppler-rendered 8-up landscape and 6-up portrait PDFs inspected visually. UI diagrams and preview inspected at desktop and mobile widths.
- Targeted TypeScript/ESLint checks passed. Supabase reads confirmed the existing live records; no production data was changed for these tests.

## Rollout

Live on https://tools.eashe.org/chemical on 2026-10-09. Source commit d824034; production deployment dpl_E4ujS7pofv49N35fDDroG4Uiq8go (https://ppe-tools-q1ydjq473-ea-she.vercel.app).

Remote production compilation, TypeScript and 53 static pages passed. Before promotion, the label route returned 200, an existing SDS route returned 307, the record without an SDS returned 404, and an anonymous registry API request remained 401.

After promotion, a fresh Chrome browser against the custom domain confirmed the public SDS redirect without a session. The deployed label client, using browser-local synthetic session/substance responses, generated a 95,745-byte PDF, decoded its preview QR to the expected stable URL, loaded all ten font/pictogram assets and reported no page errors. This synthetic client check is separate from the real anonymous SDS route check. The current production SDS records use external links; uploaded-file signing was tested using the local storage fixture, without creating production test records. No error-level runtime logs were returned during the check.
