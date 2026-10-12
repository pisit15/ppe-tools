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
