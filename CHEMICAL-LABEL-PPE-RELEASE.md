# Smaller QR and optional PPE illustrations

The label QR previously occupied a fixed 24 mm square. The default is now 16 mm; a selector also offers 20 and 24 mm. Header reservation and the centered SDS caption follow the selected size. All sizes retain four-module quiet zones and integer 300 DPI pixel modules. The PDF's clickable SDS rectangle matches the printed QR dimensions.

Nine original blue-and-white SVG illustrations are available in the label editor: goggles, face shield, chemical gloves, vapor/gas respirator, dust mask, coverall, apron, chemical-protective boots and SCBA. The selector is optional and starts empty, with a clear-selection button. Selected images print at 10 mm under a PPE heading in both full and compact mode; no PPE section or space is added when none are selected. Rows wrap as needed, and existing overflow protection blocks an undersized PDF rather than omitting icons. A failed selected-image load also blocks export with a specific error.

PPE codes and QR size are saved with each label version. Previous snapshots lacking these fields open with no PPE and a 16 mm QR. The server accepts old payload shapes and validates added fields against the fixed equipment catalog and allowed sizes. Registry PPE fields, GHS symbols, SDS access, and existing histories are unchanged. No database migration or new dependency is required.

## Verification

- Twelve browser/API tests passed, including label save/reopen, optional selection/clear, QR-size persistence, legacy payloads, malformed PPE/QR rejection, failed PPE assets, company isolation, all eight A4 presets, and existing PDF/version-history flows.
- QR decoded independently at native 300 DPI and downsampled 150 DPI for 16, 20 and 24 mm in the browser.
- pypdf verified A4 dimensions/counts and the new default 16 mm clickable rectangles for all eight presets. Exported images were independently decoded with jsQR.
- Actual exported PDF bitmaps checked for exactly three, nine and zero PPE circles, and their physical dimensions within 10 mm. Poppler-rendered PDFs and desktop/mobile screenshots visually inspected.
- TypeScript and targeted ESLint passed. Tests use isolated fictional records; no customer record was modified for verification.

## Rollout

Pending production deployment. Previous deployment: `dpl_6L5ZWnMr6S6Sb2d2yv6REeDupsqt`. Rollback is an application promotion only; no database rollback is needed. An older application will not render newly selected PPE.
