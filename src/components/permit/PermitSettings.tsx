"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ROLE_LABELS,
  MEMBER_ROLE_LABELS,
  type PermitMemberRole,
  type PermitTemplate,
} from "@/lib/permit/types";
import { PERMIT_SEEDS } from "@/lib/permit/catalog";
import { dateTime, localTime, permitApi, type DirectoryEntry } from "./api";
type Contractor = {
  id: string;
  username: string;
  display_name: string;
  contractor_name: string;
  requester_type: "employee" | "contractor";
  department: string;
  starts_at: string;
  expires_at: string;
  active: boolean;
};
export default function PermitSettings({
  company,
  tab,
  templates,
  directory,
  onRefresh,
  globalAdmin = false,
}: {
  company: string;
  tab: "templates" | "people";
  templates: PermitTemplate[];
  directory: DirectoryEntry[];
  onRefresh: () => Promise<void>;
  globalAdmin?: boolean;
}) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [accounts, setAccounts] = useState<Contractor[]>([]),
    [staff, setStaff] = useState<{ key: string; name: string }[]>([]),
    [member, setMember] = useState(""),
    [role, setRole] = useState<PermitMemberRole>("area_owner");
  const [editing, setEditing] = useState<Partial<PermitTemplate> | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [account, setAccount] = useState({
    username: "",
    password: "",
    display_name: "",
    contractor_name: "",
    requester_type: "employee" as "employee" | "contractor",
    department: "",
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  const loadPeople = useCallback(async () => {
    const [a, s] = await Promise.all([
      permitApi<{ data: Contractor[] }>("contractors", company),
      permitApi<{ data: { key: string; name: string }[] }>("members", company),
    ]);
    setAccounts(a.data);
    setStaff(s.data);
  }, [company]);
  useEffect(() => {
    if (tab === "people")
      loadPeople().catch((e) =>
        setError(e.message),
      ); /* Requests contain a fixed company; component is keyed by company. */
  }, [tab, loadPeople]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage("บันทึกเรียบร้อย");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const blank: Partial<PermitTemplate> = {
    code: "",
    name: "",
    revision: "A",
    review_note: "",
    source_code: null,
    config: {
      roles: ["area_owner", "safety"],
      fields: [
        {
          id: "controls",
          label: "อันตรายและมาตรการควบคุม",
          kind: "textarea",
          required: true,
        },
      ],
    },
  };
  return (
    <div className={`wp-stack wps-settings ${tab === "people" ? "is-people" : "is-templates"}`}>
      <div className="wp-page-title">
        <div>
          <span className="wp-eyebrow">{company.toUpperCase()} · WORKSPACE SETTINGS</span>
          <h2>{tab === "templates" ? "แม่แบบเอกสาร" : "ผู้ใช้และผู้ลงนาม"}</h2>
          <p>{tab === "templates" ? "จัดการฉบับที่ใช้งาน พร้อมเก็บประวัติแม่แบบทุกเวอร์ชัน" : "จัดการบัญชีผู้ขออนุญาตและสิทธิ์ผู้ลงนามของบริษัท"}</p>
        </div>
        <div className="wps-summary" aria-label="สรุปการตั้งค่า">
          <div><strong>{tab === "templates" ? templates.filter(t => t.active).length : accounts.filter(a => a.active && Date.parse(a.starts_at) <= Date.now() && Date.parse(a.expires_at) > Date.now()).length}</strong><span>{tab === "templates" ? "แม่แบบเปิดใช้" : "บัญชีใช้งานได้"}</span></div>
          <div><strong>{tab === "templates" ? templates.length : new Set(directory.map(m => m.actor_key)).size}</strong><span>{tab === "templates" ? "แม่แบบทั้งหมด" : "ผู้มีสิทธิ์ลงนาม / ดูแล"}</span></div>
        </div>
      </div>
      {error && (
        <p role="alert" className="wp-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="wp-success">
          {message}
        </p>
      )}
      {tab === "templates" ? (
        <>
          <div className="wp-inline wps-template-tools">
            {company === "amt" && (
              <>
              <button
                className="wp-secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await permitApi("templates", company, "POST", {
                      action: "import",
                    });
                    await onRefresh();
                  })
                }
              >
                นำเข้าต้นแบบ AMITA 9 ประเภท
              </button>
              <button className="wp-secondary" disabled={busy} onClick={() => void run(async () => {await permitApi("templates", company, "POST", {action:"import_v2"});await onRefresh();})}>นำเข้า General + งานบนที่สูง แบบตรงช่อง</button>
              </>
            )}
            <button className="wp-primary" onClick={() => setEditing(blank)}>
              สร้างแม่แบบบริษัท
            </button>
            <label className="wp-inline">
              คัดลอกต้นแบบ
              <select
                aria-label="คัดลอกต้นแบบ"
                value=""
                onChange={(e) => {
                  const t = PERMIT_SEEDS.find((t) => t.code === e.target.value);
                  if (t)
                    setEditing({
                      ...structuredClone(t),
                      company_id: company,
                      source_code: company === "amt" ? t.source_code : null,
                    });
                }}
              >
                <option value="">เลือกประเภท</option>
                {PERMIT_SEEDS.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} · {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="wp-notice wps-template-notice">
            แม่แบบนำเข้าเป็นฉบับรอตรวจทาน รายการดิจิทัลสรุปจากต้นฉบับ
            ผู้ดูแลต้องตรวจรายการย่อย Revision และผู้ลงนามก่อนเปิดใช้
            การแก้ไขสร้างเวอร์ชันใหม่และไม่เปลี่ยนเอกสารที่บันทึกไปแล้ว
            รุ่น General + งานบนที่สูงแบบตรงช่องจะเริ่มปิดใช้ ให้เปิด PDF ต้นฉบับเทียบรายการและยืนยันตรวจทานก่อนเปิดใช้
          </div>
          {editing && (
            <form
              className="wp-panel wps-template-editor"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await permitApi("templates", company, "POST", editing);
                  setEditing(null);
                  await onRefresh();
                });
              }}
            >
              <h3>บันทึกแม่แบบเวอร์ชันใหม่</h3>
              <div className="wp-form-grid">
                {(["code", "name", "revision"] as const).map((k) => (
                  <label key={k}>
                    {k === "code"
                      ? "รหัสเอกสาร"
                      : k === "name"
                        ? "ชื่อแบบฟอร์ม"
                        : "Revision"}
                    <input
                      required
                      value={editing[k] || ""}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <label>
                ข้อสังเกตจากการทวนสอบ
                <textarea
                  value={editing.review_note || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, review_note: e.target.value })
                  }
                />
              </label>
              <h4>ช่องข้อมูลและรายการตรวจ</h4>
              {editing.config?.fields.map((f, i) => (
                <div key={i} className="wp-template-field-wrap">
                <div className="wp-template-field">
                  <input
                    aria-label={`ชื่อช่อง ${i + 1}`}
                    required
                    value={f.label}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        config: {
                          ...editing.config!,
                          fields: editing.config!.fields.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        },
                      })
                    }
                  />
                  <select
                    aria-label={`ชนิดช่อง ${i + 1}`}
                    value={f.kind}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        config: {
                          ...editing.config!,
                          fields: editing.config!.fields.map((x, j) =>
                            j === i
                              ? { ...x, kind: e.target.value as typeof x.kind, ...(e.target.value === "choice" && !x.options?.length ? {options:[{value:"yes",label:"ใช้ / เกี่ยวข้อง"},{value:"no",label:"ไม่ใช้ / ไม่เกี่ยวข้อง"}]} : {}) }
                              : x,
                          ),
                        },
                      })
                    }
                  >
                    <option value="textarea">ข้อความหลายบรรทัด</option>
                    <option value="text">ข้อความ</option>
                    <option value="choice">ตัวเลือกตามแบบฟอร์ม</option>
                    <option value="check">
                      ผ่าน / ไม่ผ่าน / ไม่เกี่ยวข้อง
                    </option>
                  </select>
                  <label className="wp-inline">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          config: {
                            ...editing.config!,
                            fields: editing.config!.fields.map((x, j) =>
                              j === i
                                ? { ...x, required: e.target.checked }
                                : x,
                            ),
                          },
                        })
                      }
                    />
                    จำเป็น
                  </label>
                  <button
                    type="button"
                    className="wp-link"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        config: {
                          ...editing.config!,
                          fields: editing.config!.fields.filter(
                            (_, j) => j !== i,
                          ),
                        },
                      })
                    }
                  >
                    ลบ
                  </button>
                </div>
                {f.kind === "choice" && <label>ตัวเลือก (หนึ่งรายการต่อบรรทัด: รหัส=ข้อความ)<textarea value={(f.options || []).map(o => `${o.value}=${o.label}`).join("\n")} onChange={e => setEditing({...editing,config:{...editing.config!,fields:editing.config!.fields.map((x,j) => j === i ? {...x,options:e.target.value.split("\n").map(line => {const equal=line.indexOf("=");return {value:equal >= 0 ? line.slice(0,equal).trim() : line.trim(),label:equal >= 0 ? line.slice(equal+1) : ""};})} : x)}})} /></label>}
                {f.section && <small className="wp-muted">หมวด: {f.section}</small>}
                </div>
              ))}
              <button
                type="button"
                className="wp-secondary"
                onClick={() =>
                  setEditing({
                    ...editing,
                    config: {
                      ...editing.config!,
                      fields: [
                        ...editing.config!.fields,
                        {
                          id: "f_" + crypto.randomUUID().replaceAll("-", ""),
                          label: "",
                          kind: "textarea",
                          required: true,
                        },
                      ],
                    },
                  })
                }
              >
                เพิ่มช่อง
              </button>
              <p className="wp-muted">
                ลำดับอนุมัติ: เจ้าของพื้นที่ → เจ้าหน้าที่ความปลอดภัย →
                ผู้จัดการโครงการ (กรณีงานโครงการ)
              </p>
              <div className="wp-inline wps-editor-actions">
                <button className="wp-primary" disabled={busy}>
                  บันทึกเวอร์ชันใหม่
                </button>
                <button
                  type="button"
                  className="wp-secondary"
                  onClick={() => setEditing(null)}
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
          <label className="wp-inline wp-panel wps-review-banner">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            ข้าพเจ้าได้ตรวจทานเนื้อหา Revision
            และขั้นตอนลงนามของแม่แบบที่จะเปิดใช้แล้ว
          </label>
          <div className="wp-template-grid wps-template-list">
            {templates.map((t) => (
              <section key={t.id} className="wp-panel wp-template-card wps-template-card">
                <div className="wp-inline">
                  <span className="wp-code">{t.code}</span>
                  <span
                    className={`wp-status ${t.active ? "approved" : "draft"}`}
                  >
                    {t.active ? "เปิดใช้" : "รอตรวจทาน / ปิดใช้"}
                  </span>
                </div>
                <h3>{t.name}</h3>
                <p className="wps-template-meta">
                  Rev.{t.revision} · เวอร์ชัน {t.version} ·{" "}
                  {t.config.fields.length} รายการ
                </p>
                <p className="wp-muted">{t.review_note}</p>
                <div className="wp-actions">
                  {t.source_code && company === "amt" && (
                    <a
                      className="wp-secondary"
                      target="_blank"
                      rel="noreferrer"
                      href={`/api/permit/sources/${t.source_code}?company_id=${company}`}
                    >
                      ดู PDF ต้นฉบับ
                    </a>
                  )}
                  <button
                    className="wp-secondary"
                    onClick={() => setEditing(structuredClone(t))}
                  >
                    แก้เป็นเวอร์ชันใหม่
                  </button>
                  <button
                    className={t.active ? "wp-secondary" : "wp-primary"}
                    disabled={busy || (!t.active && !reviewed)}
                    onClick={() =>
                      void run(async () => {
                        await permitApi("templates", company, "PATCH", {
                          id: t.id,
                          active: !t.active,
                          confirm: true,
                        });
                        await onRefresh();
                      })
                    }
                  >
                    {t.active ? "ปิดใช้" : "เปิดใช้แม่แบบ"}
                  </button>
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <section className="wp-panel wps-account-create">
            <details>
              <summary><span><strong>เพิ่มบัญชีผู้ขออนุญาต</strong><small>สำหรับพนักงานแผนกอื่นหรือผู้รับเหมา · กำหนดวันหมดอายุได้</small></span><span className="wps-disclosure-mark" aria-hidden="true">+</span></summary>
              <div className="wps-disclosure-body">
            <h3>สร้างบัญชีผู้ขออนุญาตทำงาน</h3>
            <p className="wp-muted">
              เข้าถึงเฉพาะ Work Permit และใบอนุญาตที่ตนสร้าง ·
              รหัสผ่านแสดงเฉพาะตอนกำหนด ไม่ส่งอีเมลอัตโนมัติ
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await permitApi("contractors", company, "POST", account);
                  setAccount({
                    ...account,
                    username: "",
                    password: "",
                    display_name: "",
                  });
                  await loadPeople();
                });
              }}
            >
              <label>ประเภทผู้ขออนุญาต
                <select value={account.requester_type} onChange={e => setAccount({...account, requester_type: e.target.value as "employee" | "contractor"})}>
                  <option value="employee">พนักงานบริษัท / แผนกอื่น</option>
                  <option value="contractor">ผู้รับเหมา</option>
                </select>
              </label>
              <div className="wp-form-grid">
                {(
                  [
                    "display_name",
                    "contractor_name",
                    "username",
                    "password",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {
                      {
                        display_name: "ชื่อผู้ใช้งานจริง",
                        contractor_name: account.requester_type === "employee" ? "แผนก (เช่น FMT)" : "บริษัทผู้รับเหมา",
                        username: "ชื่อเข้าสู่ระบบ",
                        password: "รหัสผ่าน (อย่างน้อย 12 ตัว)",
                      }[k]
                    }
                    <input
                      autoComplete="off"
                      type={k === "password" ? "password" : "text"}
                      required
                      value={k === "contractor_name" && account.requester_type === "employee" ? account.department : account[k]}
                      onChange={(e) =>
                        setAccount({ ...account, [k === "contractor_name" && account.requester_type === "employee" ? "department" : k]: e.target.value })
                      }
                    />
                  </label>
                ))}
                {(["starts_at", "expires_at"] as const).map((k) => (
                  <label key={k}>
                    {k === "starts_at" ? "เริ่มใช้งาน" : "หมดอายุ"}
                    <input
                      type="datetime-local"
                      required
                      value={localTime(account[k])}
                      onChange={(e) => {
                        if (e.target.value)
                          setAccount({
                            ...account,
                            [k]: new Date(e.target.value).toISOString(),
                          });
                      }}
                    />
                  </label>
                ))}
              </div>
              <button className="wp-primary" disabled={busy}>
                สร้างบัญชีผู้ขออนุญาต
              </button>
            </form>
              </div>
            </details>
          </section>
          <section className="wp-panel wps-accounts">
            <div className="wpd-section-title"><h3>บัญชีผู้ขออนุญาต</h3><span>{accounts.length} บัญชี</span></div>
            {!accounts.length && (
              <div className="wps-empty"><span aria-hidden="true">↗</span><p>ยังไม่มีบัญชีผู้ขออนุญาต</p><small>เพิ่มบัญชีให้แผนกภายในหรือผู้รับเหมาได้จากเมนูด้านบน</small></div>
            )}
            {accounts.map((a) => (
              <div className="wp-account-row" key={a.id}>
                <div>
                  <b>
                    {a.display_name} · {a.username}
                  </b>
                  <p>
                    {a.requester_type === "employee" ? `พนักงาน · ${a.department}` : `ผู้รับเหมา · ${a.contractor_name}`} · หมดอายุ {dateTime(a.expires_at)}
                  </p>
                  <span className="wp-muted">
                    {!a.active
                      ? "ระงับ"
                      : Date.parse(a.expires_at) <= Date.now()
                        ? "หมดอายุ"
                        : Date.parse(a.starts_at) > Date.now()
                          ? "ยังไม่ถึงวันเริ่ม"
                          : "ใช้งานได้"}
                  </span>
                </div>
                <button
                  className="wp-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await permitApi("contractors", company, "PATCH", {
                        id: a.id,
                        active: !a.active,
                      });
                      await loadPeople();
                    })
                  }
                >
                  {a.active ? "ระงับบัญชี" : "เปิดบัญชี"}
                </button>
              </div>
            ))}
          </section>
          <section className="wp-panel wps-signers">
            <h3>กำหนดผู้ดูแลและผู้มีสิทธิ์ลงนาม</h3>
            <p className="wp-muted">
              ใช้บัญชีผู้มีสิทธิ์ลงนามที่กำหนดไว้ บัญชีผู้ขออนุญาตไม่มีสิทธิ์อนุมัติ
            </p>
            <form
              className="wp-form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await permitApi("members", company, "POST", {
                    actor_key: member,
                    role,
                  });
                  await onRefresh();
                });
              }}
            >
              <label>
                บุคลากร
                <select
                  required
                  value={member}
                  onChange={(e) => setMember(e.target.value)}
                >
                  <option value="">เลือกบัญชี</option>
                  {staff.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                บทบาท
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as PermitMemberRole)}
                >
                  {Object.entries(globalAdmin ? MEMBER_ROLE_LABELS : ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button className="wp-primary" disabled={busy}>
                เพิ่มสิทธิ์
              </button>
            </form>
            {directory.map((m) => (
              <div className="wp-account-row" key={m.actor_key + m.role}>
                <span>
                  {m.display_name} · {MEMBER_ROLE_LABELS[m.role as PermitMemberRole] || m.role}
                </span>
                <button
                  className="wp-link"
                  disabled={busy || (m.role === "permit_admin" && !globalAdmin)}
                  onClick={() =>
                    void run(async () => {
                      await permitApi("members", company, "DELETE", {
                        actor_key: m.actor_key,
                        role: m.role,
                      });
                      await onRefresh();
                    })
                  }
                >
                  ถอนสิทธิ์
                </button>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
