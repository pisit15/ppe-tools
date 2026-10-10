# Optional PPE captions

The label editor now has an "แสดงคำกำกับใต้ภาพ PPE" checkbox. It controls the shared preview/PDF renderer in both full and compact mode. Turning captions off retains the selected 10 mm PPE images and uses a compact image-only row; turning them on reserves caption space as before. Picker names remain visible so equipment can still be identified while choosing it.

`showPpeCaptions` is an optional boolean in label options. New/default/reset labels and old snapshots without the property use true. Snapshot serialization preserves false explicitly, and server validation rejects non-boolean values. The option follows saved V1/V2 histories and survives changing the page preset. No database migration is needed.

## Verification - 2026-10-10

- TypeScript and targeted ESLint passed.
- Four relevant browser/API scenarios passed: existing PPE/QR/legacy behaviour; on/off PDF exports in both full and compact modes plus false/true save-reload, older-version recall, preset changes and reset; existing version lifecycle; API validation and scope isolation including string/null caption rejection.
- Four actual PDF downloads were checked: each contains four SDS link annotations, and on/off embedded artwork differs in both content modes. Poppler renders inspected for visible captions in full mode and compact icon-only rows with both icons retained.
- Test records use an isolated local database, not production customer data.

## Rollout

Live at https://tools.eashe.org/chemical on 2026-10-10. Source commit `c235d0b`; deployment `dpl_BiX3bo5HsWaruLjkaDub7JGu9BFj` at https://ppe-tools-77jqumzsd-ea-she.vercel.app. Remote compilation/TypeScript/53 static pages passed and the staged label page returned 200 before promotion.

The production browser smoke check restored a legacy synthetic snapshot with captions enabled by default, selected respirator and boots, confirmed their captions, then disabled captions and downloaded a 105,837-byte PDF with no page errors. The selected icons remained checked; the 16 mm QR decoded correctly. All 19 assets loaded; real anonymous registry/history APIs remained 401 and the active uploaded SDS route returned 307. Session/substance/history were mocked only inside the isolated browser; there were no authenticated production writes. No error-level runtime logs were returned.

Previous deployment: `dpl_CXGmhsSZqzT4kWAEnZ2snPQwGSoy`. Rollback is application-only; older builds always display PPE captions.
