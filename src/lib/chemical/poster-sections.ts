import type { PosterDraft } from "./poster";
import { P_STATEMENTS } from "./ghs";

export type AmtSection =
  | "ppeNotes"
  | "firstAid"
  | "storage"
  | "spill"
  | "fire"
  | "precautions";
const CODE =
  /(?<![\p{L}\p{N}])P\d{3}(?:[ \t]*\+[ \t]*P\d{3})*(?![\p{L}\p{N}])/giu;
const PREFIX = /^P\d{3}(?:\s*\+\s*P\d{3})*\s*/i;

// Routes follow the *subject* of the statement, not just its P2xx/P3xx group.
// In particular, fire response is not first aid. Unrecognised/general/disposal
// text keeps its own heading; it must never silently become storage advice.
const ROUTES: Partial<Record<AmtSection, readonly number[]>> = {
  ppeNotes: [280, 281, 282, 283, 284, 285],
  firstAid: [
    101, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314,
    315, 316, 317, 318, 319, 320, 321, 322, 330, 331, 332, 333, 334, 335, 336,
    337, 338, 340, 341, 342, 350, 351, 352, 353, 360, 361, 362, 363, 364,
  ],
  storage: [
    102, 220, 221, 222, 223, 230, 231, 232, 233, 234, 235, 401, 402, 403, 404,
    405, 406, 407, 410, 411, 412, 413, 420, 422,
  ],
  spill: [273, 376, 390, 391],
  fire: [
    210, 211, 212, 240, 241, 242, 243, 244, 250, 251, 370, 371, 372, 373, 374,
    375, 377, 378, 380, 381,
  ],
};
function destination(codes: string[]): AmtSection {
  const targets = codes.map(
    (c) =>
      Object.entries(ROUTES).find(([, list]) =>
        list.includes(Number(c.slice(1))),
      )?.[0] as AmtSection | undefined,
  );
  // P370+P376: a leak instruction specifically conditional on a fire.
  if (
    codes.includes("P370") &&
    targets.every((t) => t === "fire" || t === "spill")
  )
    return "fire";
  return targets[0] && targets.every((t) => t === targets[0])
    ? targets[0]
    : "precautions";
}
function clean(value: string) {
  return value
    .trim()
    .replace(/^[•●▪\-–]\s+/, "")
    .replace(/[;,]\s*$/, "")
    .trim();
}
function normal(value: string) {
  // Keep negation, digits, units and punctuation inside the statement intact.
  return clean(value)
    .normalize("NFC")
    .replace(PREFIX, "")
    .replace(/[\s\u200b]+/g, "")
    .replace(/[.。]+$/, "")
    .toLowerCase();
}
function lines(value: string) {
  return value.split(/\r?\n/).map(clean).filter(Boolean);
}
function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = normal(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function entries(value: string) {
  // Accept several codes on one line and combined codes with spaces.
  // A code-less line remains general text, never guessed.
  const result: { text: string; codes: string[] }[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const matches = [...paragraph.matchAll(CODE)];
    if (!matches.length) {
      result.push(...lines(paragraph).map((text) => ({ text, codes: [] })));
      continue;
    }
    const prefix = paragraph.slice(0, matches[0].index);
    result.push(...lines(prefix).map((text) => ({ text, codes: [] })));
    matches.forEach((m, i) =>
      result.push({
        text: clean(paragraph.slice(m.index, matches[i + 1]?.index)),
        codes: m[0].toUpperCase().split(/\s*\+\s*/),
      }),
    );
  }
  return result;
}
const EXPOSURES: Record<string, RegExp> = {
  P301: /^(?:หาก)?กลืนกิน\s*:/,
  P302: /^(?:หากสัมผัส)?ผิวหนัง\s*:/,
  P303: /^(?:หากสัมผัส)?ผิวหนัง\s*\(หรือเส้นผม\)\s*:/,
  P304: /^(?:หาก)?สูดดม\s*:/,
  P305: /^(?:หาก)?เข้าตา\s*:/,
};
function body(value: string) {
  return clean(value).replace(PREFIX, "").trim();
}
function sameStatement(existing: string[], text: string, codes: string[]) {
  const key = normal(text);
  if (existing.some((v) => normal(v) === key)) return true;
  const exposure = EXPOSURES[codes[0]];
  if (!exposure) return false;
  const content = body(text);
  return (
    exposure.test(content) &&
    existing.some((v) => {
      const other = body(v);
      return (
        exposure.test(other) &&
        normal(other.replace(exposure, "")) ===
          normal(content.replace(exposure, ""))
      );
    })
  );
}
function omitRepeatedActions(
  text: string,
  codes: string[],
  existing: string[],
) {
  const exposure = EXPOSURES[codes[0]];
  if (!exposure || codes.length < 2 || codes.some((c) => !P_STATEMENTS[c]))
    return text;
  const standard = codes.map((c) => P_STATEMENTS[c]).join(" ");
  // Only split an unedited, recognised combination. Never reinterpret custom
  // SDS text or remove a clause just because its code appears elsewhere.
  if (normal(body(text)) !== normal(standard)) return text;
  const matching = existing
    .map(body)
    .filter((v) => exposure.test(v))
    .map((v) => v.replace(exposure, "").trim());
  const kept = codes.slice(1).filter(
    (c) =>
      !matching.some((v) => {
        const action = P_STATEMENTS[c];
        // Exact sentence, or an exact leading action separated from the next one.
        // This does not equate "rinse" with "do not rinse", or eye with skin advice.
        return normal(v) === normal(action) || v.startsWith(action + " ");
      }),
  );
  if (!kept.length) return "";
  if (kept.length === codes.length - 1) return text;
  return `${[codes[0], ...kept].join("+")} ${[codes[0], ...kept].map((c) => P_STATEMENTS[c]).join(" ")}`;
}

/** Pure display composition: registry and saved Rev snapshots remain untouched. */
export function amtSections(draft: PosterDraft): Record<AmtSection, string> {
  const sections: Record<AmtSection, string[]> = {
    ppeNotes: unique(lines(draft.ppeNotes)),
    firstAid: unique(lines(draft.firstAid)),
    storage: unique(lines(draft.storage)),
    spill: unique(lines(draft.spill)),
    fire: unique(lines(draft.fire)),
    precautions: [],
  };
  for (const entry of entries(draft.precautions)) {
    let target = destination(entry.codes);
    // Free text already present in a named section does not need a second copy.
    if (!entry.codes.length) {
      const duplicate = Object.entries(sections).find(
        ([key, values]) =>
          key !== "precautions" &&
          values.some((v) => normal(v) === normal(entry.text)),
      );
      if (duplicate) target = duplicate[0] as AmtSection;
    }
    if (sameStatement(sections[target], entry.text, entry.codes)) continue;
    const text =
      target === "firstAid"
        ? omitRepeatedActions(entry.text, entry.codes, sections[target])
        : entry.text;
    if (text && !sameStatement(sections[target], text, entry.codes))
      sections[target].push(text);
  }
  return Object.fromEntries(
    Object.entries(sections).map(([k, v]) => [k, v.join("\n")]),
  ) as Record<AmtSection, string>;
}
