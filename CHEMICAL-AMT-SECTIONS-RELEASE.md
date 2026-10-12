# AMT poster section routing fix

The AMT renderer previously appended every precautionary statement to Storage. It now composes PPE, first aid, storage, spill response and fire prevention separately. General, disposal, mixed-topic and unrecognised statements retain their own precaution heading.

Duplicate suppression uses matching text, not a shared P code or fuzzy similarity. Exposure routes and negation remain distinct. For an unchanged recognised combined first-aid statement, an identical action already present for the same exposure route is omitted from the added text; remaining actions and their codes stay visible. Registry data and saved Rev snapshots are not rewritten.

The AMT renderer reallocates spare row space to accommodate the correctly placed text. The document table stays clear, and overflow still prevents truncated PDF downloads. Summary/AAB layouts and label rendering are unchanged.

## Verification before release

- Five routing/deduplication unit cases: combinations, unknown codes, free text, repeated text, differing details, negation, exposure route and duration.
- Three existing browser journeys passed for poster Rev persistence, Admin templates, and the AMT PDF; AMT was rerun after the final layout bounds change.
- New browser regression checks the actual canvas text coordinates, absence of duplicate text, retained general precautions, PDF download, unchanged loaded snapshot, and mobile width.
- Read-only reproduction of the reported Silver nitrate Rev: correct sections, 9 pt on one A4 page, PDF download, no browser errors. No production chemical or poster records were modified.
- TypeScript and targeted ESLint passed (two existing image-element warnings). Both the reproduction PDF and regression PDF were rendered with Poppler and visually inspected.

## Release verification

Push the tested commit normally to main and codex/chemical-legal-system. Confirm tools.eashe.org is READY for that exact commit. Run tests/chemical-poster-sections-deployed.cjs against the production domain; all browser API calls are intercepted GET fixtures. The optional third argument is a private local snapshot JSON for read-only reproduction. Verification images and PDFs remain in ignored .verification/amt-sections.
