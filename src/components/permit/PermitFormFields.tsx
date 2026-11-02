"use client";
import type { PermitForm, TemplateField } from "@/lib/permit/types";

// Keep the same conditional rules for the form and its completion indicator.
// An unanswered item is never treated as a negative answer.
export function visiblePermitFields(form: PermitForm, hideShared = false) {
  return form.template.config.fields.filter(field => {
    if (hideShared && ["equipment", "hazards", "additional"].includes(field.id)) return false;
    if (field.id.startsWith("control_")) {
      const hazard = form.template.config.fields.find(candidate => candidate.id.startsWith("hazard_") && field.id.startsWith(`control_${candidate.id.slice(7)}_`));
      if (hazard && form.answers[hazard.id] !== "yes") return false;
    }
    if (field.id.endsWith("_text") && form.template.config.fields.some(candidate => candidate.id === field.id.slice(0, -5)) && form.answers[field.id.slice(0, -5)] !== "yes") return false;
    return true;
  });
}

export function isPermitFieldEntered(field: TemplateField, value = "") {
  return value.startsWith("na:") ? value.slice(3).trim().length >= 3 : Boolean(value.trim());
}

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
  for (const field of visiblePermitFields(form, hideShared)) {
    const section = field.id.startsWith("hazard_") || field.id.startsWith("control_") ? "ประเมินอันตรายและกำหนดมาตรการ" : field.section || "ข้อมูลและรายการตรวจ";
    sections.set(section, [...(sections.get(section) || []), field]);
  }
  function renderField(field: TemplateField) {
    const id = `${form.template.id}-${field.id}`;
    const value = form.answers[field.id] || "";
    const label = `${field.label}${field.required ? " *" : ""}`;
    if (field.kind === "check") {
      return (
        <div key={field.id} className={`wp-check-row wp-entry-row${value === "no" ? " is-negative" : ""}`}>
          <label htmlFor={id}>{label}</label>
          <select id={id} data-entered={isPermitFieldEntered(field, value)} value={value.startsWith("na:") ? "na" : value}
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
        <div key={field.id} className={`wp-choice-field wp-entry-row${field.id.startsWith("hazard_") ? " wp-hazard-row" : ""}${field.id.startsWith("control_") ? " wp-control-row" : ""}`}>
          <label htmlFor={id}>{label}</label>
          <select id={id} data-entered={isPermitFieldEntered(field, value)} value={value} onChange={e => onAnswer(field.id, e.target.value)}>
            <option value="">ยังไม่ระบุ</option>
            {(field.options || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      );
    }
    return (
      <label key={field.id} className={`wp-note-field${field.id.startsWith("control_") ? " wp-control-row" : ""}`} htmlFor={id}>
        {label}
        {field.kind === "text" ? (
          <input id={id} aria-label={label} value={value} maxLength={5000} onChange={e => onAnswer(field.id, e.target.value)} />
        ) : (
          <textarea id={id} aria-label={label} value={value} maxLength={5000} onChange={e => onAnswer(field.id, e.target.value)} />
        )}
      </label>
    );
  }
  return <div className="wp-structured-fields">{Array.from(sections.entries()).map(([section, fields]) => {
    const required = fields.filter(field => field.required);
    const entered = required.filter(field => isPermitFieldEntered(field, form.answers[field.id]));
    return <details className="wp-field-group" key={section} open>
      <summary>
        <span>{section}</span>
        {required.length > 0 && <small>{entered.length}/{required.length} ระบุแล้ว</small>}
      </summary>
      <fieldset className="wp-field-group-body">
        <legend className="wp-sr-only">{section}</legend>
        {section === "ประเมินอันตรายและกำหนดมาตรการ" && <p className="wp-field-hint">พิจารณาทีละรายการ เมื่อมีอันตราย ระบบจะแสดงมาตรการที่ต้องระบุเพิ่มเติม</p>}
        {fields.map(renderField)}
      </fieldset>
    </details>;
  })}</div>;
}
