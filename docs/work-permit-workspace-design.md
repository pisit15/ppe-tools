# Work Permit workspace design

The workspace separates operational tasks from document review. The dashboard shows scoped totals, actionable queues, search and a paginated register. The request editor keeps the original AMT PDF beside the form on large screens, with a preview action in the mobile save bar.

## Interaction rules

- SHE staff use their existing Tools account. Employees from other departments and contractors use permit-only requester accounts. The login account choice does not assign approval authority.
- The editor has four jump sections, one task selector and collapsible assessment groups. Counts mean fields entered; they never certify safety or approve work. Conditional controls remain tied to the actual hazard answers.
- Record actions appear before the full record. Only one contextual action is primary; its confirmation becomes primary when opened. Server authorization, signature requirements and ordered workflow remain authoritative.
- Preview warning links reveal collapsed ancestors before focusing their fields. Preview requests remain debounced, omit attachments/signature bytes and reject stale responses. Preview does not save a permit.
- The mobile preview launcher is portaled into the save bar, with a minimum 44px target beside Save. Text controls use 16px on mobile, and reduced-motion preferences are respected.
- Original-template PDF generation and source checksums are unchanged. Company template activation and signer setup still require the company's actual reviewed configuration.

## Original AMT tick fields

AHS-003 and AHS-004 canonical v2 render native, square tick choices instead of summarized text or dropdowns. AHS-003 uses the fourteen unchanged hazard pictograms extracted from the source PDF and preserves its hazard/control order. Y/N choices distinguish an unanswered hazard from an explicit negative answer; controls remain disabled until Y. AHS-004 uses equipment/PPE choices and pass/N/A/fail checks with required reasons where applicable. Printed selections use vector check marks contained inside the reviewed source boxes.

Existing summarized drafts offer an explicit upgrade when a verified active canonical replacement exists. Common job and text fields remain; new safety choices start blank. On save, a template replacement/removal archives the server-loaded prior document in the one appended edit event, without recursive events. A history disclosure exposes the prior labels and complete answers. Existing records are not silently rewritten when a template is activated.

## Loading and rendering

`PermitApp` bootstraps session, templates and directory once per company. Search, queue, pagination and background refresh fetch only the register. Existing rows remain visible while a replacement request is pending. Initial loading has a separate state from an empty register.

Request generations suppress late results and errors after a new query, company change, navigation or logout. Pages are clamped when filtered totals shrink. A linked permit is consumed before a manual company switch, and an inaccessible link reports an error without discarding a valid session.

Editor, record and settings views load in separate client chunks. PDF.js remains loaded on demand; the Thai variable font is hosted locally through `next/font/local`.

## Verification

Use the isolated fixture; never deploy the locally built test output because it contains test-only environment values.

```powershell
node tests/permit-build.cjs
$env:PERMIT_TEST_PRODUCTION='1'
$env:CI='1'
node node_modules/@playwright/test/cli.js test --config playwright.permit.config.cjs
node --test tests/permit.test.cjs tests/amt-forms.test.cjs tests/permit-amt-v2.test.cjs tests/permit-pdf.test.cjs tests/permit-text-layout.test.cjs tests/permit-preview-data.test.cjs tests/permit-template-upgrade.test.cjs
```

The design suite checks keyboard login, 320/390/760px layout and action targets, desktop preview, no metadata refetch during search, retained rows, and delayed-response races. The tick suite checks blank initial choices, native keyboard ticking, exact vector marks, hazard/control clearing and explicit legacy upgrades. The existing suites verify scoped permissions, the full signed lifecycle, original PDF mappings and measured Thai text overflow.

Screenshots use explicitly marked local test data and are written to `output/permit/design-*.png`. Production is built from source using the linked project's production environment.
