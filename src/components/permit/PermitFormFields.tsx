"use client";
import Image from "next/image";
import type { PermitForm, TemplateField } from "@/lib/permit/types";
import "@/app/permit/permit-ticks.css";

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

export function isPermitFieldEntered(_field: TemplateField, value = "") {
  return value.startsWith("na:") ? value.slice(3).trim().length >= 3 : Boolean(value.trim());
}

type FieldProps = {
  form: PermitForm;
  onAnswer: (field: string, value: string) => void;
  hideShared?: boolean;
};

export default function PermitFormFields({ form, onAnswer, hideShared = false }: FieldProps) {
  const originalTicks = form.template.company_id === "amt" &&
    form.template.config.layoutVersion === "amt-2026-11-v2" &&
    ["003", "004"].includes(form.template.source_code || "");
  if (originalTicks) return <OriginalTickFields form={form} onAnswer={onAnswer} hideShared={hideShared} />;
  return <StandardFields form={form} onAnswer={onAnswer} hideShared={hideShared} />;
}

function fieldLabel(field: TemplateField) {
  return `${field.label}${field.required ? " *" : ""}`;
}

function TextField({ form, field, onAnswer }: FieldProps & { field: TemplateField }) {
  const id = `${form.template.id}-${field.id}`;
  const label = fieldLabel(field);
  const value = form.answers[field.id] || "";
  return <label className={`wp-note-field${field.id.startsWith("control_") ? " wp-control-row" : ""}`} htmlFor={id}>
    {label}
    {field.kind === "text"
      ? <input id={id} aria-label={label} value={value} maxLength={5000} onChange={e => onAnswer(field.id, e.target.value)} />
      : <textarea id={id} aria-label={label} value={value} maxLength={5000} onChange={e => onAnswer(field.id, e.target.value)} />}
  </label>;
}

function ClearAnswer({ field, onAnswer }: { field: TemplateField; onAnswer: FieldProps["onAnswer"] }) {
  return <button type="button" className="wp-tick-clear" aria-label={`ล้างคำตอบ: ${field.label}`} onClick={() => onAnswer(field.id, "")}>ล้าง</button>;
}

function SquareChoices({
  form, field, onAnswer, disabled = false, hazard = false,
}: FieldProps & { field: TemplateField; disabled?: boolean; hazard?: boolean }) {
  const id = `${form.template.id}-${field.id}`;
  const value = form.answers[field.id] || "";
  const options = field.kind === "check"
    ? [{ value: "yes", label: "ผ่าน / จัดให้มี" }, { value: "na", label: "ไม่เกี่ยวข้อง" }, { value: "no", label: "ไม่ผ่าน" }]
    : field.options || [];
  const selected = value.startsWith("na:") ? "na" : value;
  const check = field.kind === "check";
  return <fieldset
    id={id}
    tabIndex={-1}
    className={`wp-tick-field${hazard ? " wp-tick-hazard-choice" : ""}${check ? " wp-tick-check-field" : ""}`}
    role="radiogroup"
    aria-label={fieldLabel(field)}
    disabled={disabled}
    data-entered={isPermitFieldEntered(field, value)}
    data-answer={selected || "unanswered"}
  >
    <legend className={hazard || !check ? "wp-sr-only" : "wp-tick-legend"}>{fieldLabel(field)}</legend>
    <div className="wp-tick-options">
      {options.map((option, index) => <label
        key={option.value}
        className={`wp-tick-option${index === 0 && !hazard && !check ? " wp-tick-clause" : ""}`}
        data-selected={selected === option.value}
        data-negative={option.value === "no"}
      >
        <input
          type="radio"
          id={`${id}-${option.value}`}
          name={id}
          value={option.value}
          checked={selected === option.value}
          aria-label={option.label}
          onChange={() => onAnswer(field.id, option.value === "na" ? "na:" : option.value)}
        />
        <span>{hazard ? (option.value === "yes" ? "Y" : "N") : !check && index === 0 ? fieldLabel(field) : option.label}</span>
      </label>)}
    </div>
    {check && value.startsWith("na:") && <label className="wp-tick-reason">
      เหตุผลที่ไม่เกี่ยวข้อง
      <input aria-label={`เหตุผล: ${field.label}`} value={value.slice(3)} maxLength={5000} placeholder="ระบุเหตุผลอย่างน้อย 3 ตัวอักษร" onChange={e => onAnswer(field.id, "na:" + e.target.value)} />
    </label>}
    {!hazard && !disabled && value && <ClearAnswer field={field} onAnswer={onAnswer} />}
  </fieldset>;
}

function Section({
  title, fields, form, children,
}: { title: string; fields: TemplateField[]; form: PermitForm; children: React.ReactNode }) {
  const required = fields.filter(field => field.required);
  const entered = required.filter(field => isPermitFieldEntered(field, form.answers[field.id]));
  return <details className="wp-field-group" open>
    <summary><span>{title}</span>{required.length > 0 && <small>{entered.length}/{required.length} ระบุแล้ว</small>}</summary>
    <div className="wp-field-group-body">{children}</div>
  </details>;
}

function HazardMatrix({ form, onAnswer }: FieldProps) {
  const hazards = form.template.config.fields.filter(field => field.id.startsWith("hazard_"));
  const visibleFields = visiblePermitFields(form).filter(field => field.id.startsWith("hazard_") || field.id.startsWith("control_"));
  return <Section title="B. ประเมินอันตรายและกำหนดมาตรการ" fields={visibleFields} form={form}>
    <p className="wp-tick-instructions">ติ๊ก Y เมื่อมีอันตราย หรือ N เมื่อไม่มีอันตราย แล้วเลือกมาตรการแต่ละข้อตามต้นฉบับ ช่องว่างหมายถึงยังไม่ได้ประเมิน</p>
    <table className="wp-tick-matrix">
      <caption className="wp-sr-only">ตารางประเมินอันตรายและมาตรการ AHS-003 ตามต้นฉบับ</caption>
      <colgroup><col className="wp-tick-yn-col" /><col className="wp-tick-yn-col" /><col className="wp-tick-hazard-col" /><col /></colgroup>
      <thead><tr><th scope="col">Y</th><th scope="col">N</th><th scope="col">อันตราย (Hazard)</th><th scope="col">มาตรการป้องกัน</th></tr></thead>
      <tbody>{hazards.map(hazard => {
        const prefix = `control_${hazard.id.slice(7)}_`;
        const fields = form.template.config.fields.filter(field => field.id.startsWith(prefix));
        const controls = fields.filter(field => field.kind === "choice");
        const isActive = form.answers[hazard.id] === "yes";
        const isNo = form.answers[hazard.id] === "no";
        return <tr key={hazard.id} data-hazard={hazard.id} data-assessment={form.answers[hazard.id] || "unanswered"}>
          <td colSpan={2} className="wp-tick-yn"><SquareChoices form={form} field={hazard} onAnswer={onAnswer} hazard /></td>
          <th scope="row" className="wp-tick-hazard-name">
            <Image src={`/permit-hazards/${hazard.id.slice(7)}.png`} width={44} height={44} alt="" className="wp-tick-hazard-icon" />
            <strong>{hazard.label.replace(/^มีอันตราย:\s*/, "")}</strong>
            <span>{isActive ? "มีอันตราย" : isNo ? "ไม่มีอันตราย" : "ยังไม่ประเมิน"}</span>
            {form.answers[hazard.id] && <ClearAnswer field={hazard} onAnswer={onAnswer} />}
          </th>
          <td className="wp-tick-controls">
            {!isActive && <p className="wp-tick-control-hint">{isNo ? "ไม่ใช้มาตรการกลุ่มนี้ เนื่องจากเลือก N" : "เลือก Y ก่อนติ๊กมาตรการ"}</p>}
            {controls.map(control => <div className="wp-tick-control" key={control.id}>
              <SquareChoices form={form} field={control} onAnswer={onAnswer} disabled={!isActive} />
              {fields.filter(field => field.id === `${control.id}_text`).map(note => isActive && form.answers[control.id] === "yes" ? <TextField key={note.id} form={form} field={note} onAnswer={onAnswer} /> : null)}
            </div>)}
          </td>
        </tr>;
      })}</tbody>
    </table>
  </Section>;
}

function OriginalTickFields({ form, onAnswer, hideShared = false }: FieldProps) {
  const visible = visiblePermitFields(form, hideShared);
  const sections = new Map<string, TemplateField[]>();
  for (const field of visible) {
    if (field.id.startsWith("hazard_") || field.id.startsWith("control_")) continue;
    const section = field.section || "ข้อมูลและรายการตรวจ";
    sections.set(section, [...(sections.get(section) || []), field]);
  }
  function renderSection(section: string, fields: TemplateField[]) {
    return <Section key={section} title={section} fields={fields} form={form}>
      <div className="wp-tick-section-fields">{fields.map(field =>
        field.kind === "check" || field.kind === "choice"
          ? <SquareChoices key={field.id} form={form} field={field} onAnswer={onAnswer} />
          : <TextField key={field.id} form={form} field={field} onAnswer={onAnswer} />)}</div>
    </Section>;
  }
  const mainSections = Array.from(sections.entries()).filter(([section]) => section !== "มาตรการเพิ่มเติม");
  const extraSections = Array.from(sections.entries()).filter(([section]) => section === "มาตรการเพิ่มเติม");
  return <div className="wp-structured-fields wp-ticks">
    {mainSections.map(([section, fields]) => renderSection(section, fields))}
    {form.template.source_code === "003" && <HazardMatrix form={form} onAnswer={onAnswer} />}
    {extraSections.map(([section, fields]) => renderSection(section, fields))}
  </div>;
}

function StandardFields({ form, onAnswer, hideShared = false }: FieldProps) {
  const sections = new Map<string, TemplateField[]>();
  for (const field of visiblePermitFields(form, hideShared)) {
    const section = field.id.startsWith("hazard_") || field.id.startsWith("control_") ? "ประเมินอันตรายและกำหนดมาตรการ" : field.section || "ข้อมูลและรายการตรวจ";
    sections.set(section, [...(sections.get(section) || []), field]);
  }
  function renderField(field: TemplateField) {
    const id = `${form.template.id}-${field.id}`;
    const value = form.answers[field.id] || "";
    const label = fieldLabel(field);
    if (field.kind === "check") return <div key={field.id} className={`wp-check-row wp-entry-row${value === "no" ? " is-negative" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} data-entered={isPermitFieldEntered(field, value)} value={value.startsWith("na:") ? "na" : value} onChange={e => onAnswer(field.id, e.target.value === "na" ? "na:" : e.target.value)}>
        <option value="">ยังไม่ตรวจ</option><option value="yes">ผ่าน / จัดให้มี</option><option value="no">ไม่ผ่าน</option><option value="na">ไม่เกี่ยวข้อง</option>
      </select>
      {value.startsWith("na:") && <input aria-label={`เหตุผล: ${field.label}`} placeholder="ระบุเหตุผลที่ไม่เกี่ยวข้อง" value={value.slice(3)} onChange={e => onAnswer(field.id, "na:" + e.target.value)} />}
    </div>;
    if (field.kind === "choice") return <div key={field.id} className={`wp-choice-field wp-entry-row${field.id.startsWith("hazard_") ? " wp-hazard-row" : ""}${field.id.startsWith("control_") ? " wp-control-row" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} data-entered={isPermitFieldEntered(field, value)} value={value} onChange={e => onAnswer(field.id, e.target.value)}><option value="">ยังไม่ระบุ</option>{(field.options || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    </div>;
    return <TextField key={field.id} form={form} field={field} onAnswer={onAnswer} />;
  }
  return <div className="wp-structured-fields">{Array.from(sections.entries()).map(([section, fields]) =>
    <Section key={section} title={section} fields={fields} form={form}>
      {section === "ประเมินอันตรายและกำหนดมาตรการ" && <p className="wp-field-hint">พิจารณาทีละรายการ เมื่อมีอันตราย ระบบจะแสดงมาตรการที่ต้องระบุเพิ่มเติม</p>}
      {fields.map(renderField)}
    </Section>)}</div>;
}
