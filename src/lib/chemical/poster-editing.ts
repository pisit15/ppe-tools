import type { PosterSnapshot, PosterTextField } from "./poster";
import { amtSections } from "./poster-sections";

/** Edit the displayed AMT text, including routed P statements, so deleted text
 * cannot reappear from the original precautions field on the next render. */
export function editablePosterDraft(snapshot: PosterSnapshot) {
  const draft = snapshot.draft;
  return snapshot.template.config.layout === "amt"
    ? { ...draft, ...amtSections(draft) }
    : draft;
}
export function editPosterText(
  snapshot: PosterSnapshot,
  field: PosterTextField,
  value: string,
): PosterSnapshot {
  return {
    ...snapshot,
    draft: { ...editablePosterDraft(snapshot), [field]: value },
  };
}
