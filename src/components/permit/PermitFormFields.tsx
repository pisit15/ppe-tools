"use client";
import type { PermitForm, TemplateField } from "@/lib/permit/types";

export default function PermitFormFields({
  form,
  onAnswer,
  hideShared = false,
}: {
  form: PermitForm;
  onAnswer: (field: string, value: string) => void;
  hideShared?: boolean;
}) {
  const sections = new Map<string, TemplateField[]>();
  for (const field of form.template.config.fields) {
    if (hideShared && ["equipment", "hazards", "additional"].includes(field.id)) continue;
    if (field.id.startsWith("control_")) {
      const hazard = form.template.config.fields.find(candidate => candidate.id.startsWith("hazard_") && field.id.startsWith(`control_${candidate.id.slice(7)}_`));
      if (hazard && form.answers[hazard.id] !== "yes") continue;
    }
    if (field.id.endsWith("_text") && form.template.config.fields.some(candidate => candidate.id === field.id.slice(0,-5)) && form.answers[field.id.slice(0,-5)] !== "yes") continue;
    const section = field.section || "ข้อมูลและรายการตรวจ";
    sections.set(section, [...(sections.get(section) || []), field]);
  }
  function renderField(field: TemplateField) {
    const id = `${form.template.id}-${field.id}`;
    const value = form.answers[field.id] || "";
    const label = `${field.label}${field.required ? " *" : ""}`;
    if (field.kind === "check") {
      return (
        <div key={field.id} className="wp-check-row">
          <label htmlFor={id}>{label}</label>
          <select id={id} value={value.startsWith("na:") ? "na" : value}
            onChange={e => onAnswer(field.id, e.target.value === "na" ? "na:" : e.target.value)}>
            <option value="">ยังไม่ตรวจ</option>
            <option value="yes">ผ่าน / จัดให้มี</option>
            <option value="no">ไม่ผ่าน</option>
            <option value="na">ไม่เกี่ยวข้อง</option>
          </select>
          {value.startsWith("na:") && (
            <input aria-label={`เหตุผล: ${field.label}`} placeholder="ระบุเหตุผลที่ไม่เกี่ยวข้อง"
              value={value.slice(3)} onChange={e => onAnswer(field.id, "na:" + e.target.value)} />
          )}
        </div>
      );
    }
    if (field.kind === "choice") {
      return (
        <label key={field.id} className="wp-choice-field" htmlFor={id}>
          <span>{label}</span>
          <select id={id} value={value} onChange={e => onAnswer(field.id, e.target.value)}>
            <option value="">ยังไม่ระบุ</option>
            {(field.options || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      );
    }
    return (
      <label key={field.id} htmlFor={id}>
        {label}
        {field.kind === "text" ? (
          <input id={id} value={value} maxLength={5000} onChange={e => onAnswer(field.id, e.target.value)} />
        ) : (
          <textarea id={id} value={value} maxLength={5000} onChange={e => onAnswer(field.id, e.target.value)} />
        )}
      </label>
    );
  }
  return <div className="wp-structured-fields">{Array.from(sections.entries()).map(([section, fields]) => (
    <fieldset className="wp-fieldset" key={section}>
      <legend>{section}</legend>
      {fields.map(renderField)}
    </fieldset>
  ))}</div>;
}
