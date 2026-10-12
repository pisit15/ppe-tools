# AMT seven-section poster template

Reference: user-provided `1 SITAP C-110.pdf` (one scanned A4 portrait page).

- Added `amt` as an independent layout; existing summary/AAB snapshots retain their renderer.
- AMT portrait: red frame, extracted original AMITA logo, seven coloured section bands, rounded product/ingredients panel, and lower-right document metadata table. Form default is AHS-002.
- The seed is restricted to company `amt`. Admin can copy, edit, scope or hide it using existing controls. Stable seed ID preserves later Admin edits on replay.
- Product names, safety instructions, document numbers, dates and signatures from the sample are not seeded. Registry data and user edits populate each poster. Issued/checked/approved remain plain fields, not approval workflows.
- PPE images/captions remain optional. Existing GHS and 16 mm SDS QR are supported. Precautions appear in storage; emergency contact appears below fire prevention. The preview and PDF use the same 300 DPI image with an overflow guard.
- Rev snapshots retain the template configuration and logo even if Admin later changes/hides the template. No registry or existing customer revisions are modified.

Verification: two isolated PostgreSQL tests passed; all three poster browser/API journeys passed. The AMT journey was rerun after ruled-line alignment refinement and passed, including company scope, save/reopen Rev1/2, optional PPE, frozen hidden-template snapshot, QR decoding, PDF download, overflow guard and mobile containment. TypeScript passed; targeted lint had no errors (existing bitmap img warnings only). Downloaded PDF: one portrait A4 page, matching preview; 16 mm SDS QR decoded and PDF URI annotation verified. PDF and PPE preview visually inspected.

Release uses the current main history via normal fast-forward push. Deploy the renderer before applying the additive seed so old clients cannot select an unsupported layout. After hosted apply, reconcile the generated migration version and record the domain deployment/compiled-client check under ignored `.verification/amt-poster/`.

## Production verification

Main commit 056891b039a0599f6652f33415ea083f95954fb5 deployed as dpl_C7EUEmhFmRTtR4kgYq8Rt4sYqa7T and the custom domain tools.eashe.org resolved to that exact Ready deployment. Hosted seed migration applied as 20261012063421_chemical_amt_poster_template; verified the visible AMT-scoped record, layout, form code and embedded logo. Local filename matches the hosted migration version.

Compiled production client passed registry-to-label, poster summary/AAB/AMT, and Admin editor navigation with no browser errors. All PDFs downloaded; AMT PDF was 410,419 bytes, its SDS QR decoded. Anonymous protected APIs returned 401. This smoke uses isolated browser API fixtures and does not write customer data; database scope and persisted revisions are covered by isolated real PostgreSQL tests. Production writes were limited to the new requested template seed. Follow-up commit only reconciles the migration filename/test fixture and release record; application source is identical to the verified deployment.
