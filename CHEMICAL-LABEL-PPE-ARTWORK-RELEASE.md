# Clearer PPE artwork and label captions

## Change

The small custom respirator and front-facing boots were difficult to identify. Six locally bundled SVGs now use the Commons ISO 7010 drawings documented in public/ppe-label/README.md. A side-view high boot and a cup-shaped dust mask are original illustrations; the SCBA illustration retains its recognisable cylinder with a matching blue palette. Generic symbols are accompanied by the existing SDS-specific selection names, without claiming that a symbol certifies filter type or chemical compatibility.

The picker displays 52 px images and offers a separate enlarged preview. Native modal dialog behaviour supports keyboard focus, Escape, a close button, and returning focus to the trigger without changing the selection.

Both full and compact PDFs retain 10 mm PPE images and now add short 7 pt Thai captions in 20 mm cells. Captions reserve their own row height, wrap when necessary, and participate in the existing overflow guard. Selecting no PPE adds no PPE content. Stable codes keep saved label versions compatible; no schema or API changes are required.

## Verification - 2026-10-10

- TypeScript and targeted ESLint passed.
- All 12 label/version browser and API tests passed using isolated fictional records, including preview open/close with Escape and focus restoration, selection/persistence/clear, legacy versions, overflow, all eight A4 presets, and PDF downloads.
- Actual PDF bitmaps verified for 3/9/0 outer PPE circles at approximately 10 mm and QR link rectangles of 16/20/24 mm. The verifier distinguishes the outer disks from enclosed blue shapes inside the new artwork.
- QR decoded independently from every exported preset and PPE PDF; the decoded target matches the clickable SDS link.
- Poppler renders of the 4-up PDF and the all-nine-PPE PDF visually checked; Thai captions remain below the icons without overlap. Desktop selector screenshot inspected; mobile width assertion passed.
- SVGs checked to contain only local vector geometry without scripts or external references.

## Rollout

Live at https://tools.eashe.org/chemical on 2026-10-10. Source commit `ede67eb`; deployment `dpl_CXGmhsSZqzT4kWAEnZ2snPQwGSoy` at https://ppe-tools-e5318k57b-ea-she.vercel.app. Remote production compilation, TypeScript and all 53 static pages passed. The staged page returned 200 and the boot asset hash matched the tested file before promotion.

After promotion the browser smoke check compared all nine live SVG files byte-for-byte with the source, opened/closed the large boot preview, checked 52 px picker artwork, restored a legacy V2, selected respirator and boots, verified both captions, decoded the 16 mm QR, and downloaded a 112,514-byte PDF without page errors. Session/substance/history were synthetic responses only inside an isolated browser; no authenticated live API calls or production writes were made. Separately, real anonymous registry/history access remained 401 and the active uploaded SDS route returned 307. No error-level Vercel runtime logs were returned.

Previous live deployment: `dpl_H3uwyXWMajaMFJaCFLhT9rY9G7zd`. No database migration is required; rollback is application-only.
