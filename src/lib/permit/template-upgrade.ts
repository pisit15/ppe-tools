import type { PermitData, PermitTemplate } from "./types";
import { AMT_V2_SEEDS } from "./amt-forms";

const transferableText = new Set(["equipment", "hazards", "additional", "access"]);
const isText = (kind: string) => kind === "text" || kind === "textarea";
const stable = (value: unknown): string => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item,
);

function isCanonicalActiveTemplate(template: PermitTemplate) {
  if (!template.active || template.company_id !== "amt") return false;
  const canonical = AMT_V2_SEEDS.find(seed =>
    seed.code === template.code && seed.source_code === template.source_code &&
    seed.revision === template.revision,
  );
  return Boolean(canonical &&
    template.config.layoutVersion === canonical.config.layoutVersion &&
    template.config.sourceSha256 === canonical.config.sourceSha256 &&
    stable(template.config.fields) === stable(canonical.config.fields));
}

export function getPermitTemplateUpgrades(data: PermitData, templates: PermitTemplate[]) {
  const available = templates.filter(isCanonicalActiveTemplate);
  return data.forms.flatMap(form => {
    const current = form.template;
    if (current.company_id !== "amt") return [];
    const replacement = available
      .filter(template => template.code === current.code &&
        template.source_code === current.source_code &&
        template.revision === current.revision &&
        template.id !== current.id && template.version > current.version)
      .sort((a, b) => b.version - a.version)[0];
    return replacement ? [{ current, replacement }] : [];
  });
}

// This is an explicit draft-editor operation. Broad legacy answers never become
// safety decisions for new individual checkboxes, even when their IDs coincide.
export function upgradePermitForms(data: PermitData, templates: PermitTemplate[]): PermitData {
  const upgrades = new Map(getPermitTemplateUpgrades(data, templates)
    .map(upgrade => [upgrade.current.id, upgrade.replacement]));
  if (!upgrades.size) return data;
  return {
    ...data,
    forms: data.forms.map(form => {
      const replacement = upgrades.get(form.template.id);
      if (!replacement) return form;
      const answers = Object.fromEntries(replacement.config.fields.map(field => {
        const previous = form.template.config.fields.find(candidate => candidate.id === field.id);
        const value = transferableText.has(field.id) && isText(field.kind) &&
          previous && isText(previous.kind) ? form.answers[field.id] || "" : "";
        return [field.id, value];
      }));
      return { template: structuredClone(replacement), answers };
    }),
  };
}

// Called with server-loaded data, not the browser's audit payload. The complete
// prior document remains recoverable without recursively copying audit events.
export function templateReplacementSnapshot(previous: PermitData, next: PermitData) {
  const replaced = previous.forms.some(before => !next.forms.some(after =>
    after.template.code === before.template.code && after.template.id === before.template.id,
  ));
  if (!replaced) return undefined;
  const { events, ...document } = structuredClone(previous);
  void events;
  return document;
}
