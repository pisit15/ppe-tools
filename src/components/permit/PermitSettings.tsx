"use client";
import { useEffect, useState } from "react";
import {
  ROLE_LABELS,
  type PermitRole,
  type PermitTemplate,
} from "@/lib/permit/types";
import { PERMIT_SEEDS } from "@/lib/permit/catalog";
import { dateTime, localTime, permitApi, type DirectoryEntry } from "./api";
type Contractor = {
  id: string;
  username: string;
  display_name: string;
  contractor_name: string;
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
}: {
  company: string;
  tab: "templates" | "people";
  templates: PermitTemplate[];
  directory: DirectoryEntry[];
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [accounts, setAccounts] = useState<Contractor[]>([]),
    [staff, setStaff] = useState<{ key: string; name: string }[]>([]),
    [member, setMember] = useState(""),
    [role, setRole] = useState<PermitRole>("area_owner");
  const [editing, setEditing] = useState<Partial<PermitTemplate> | null>(null),
    [reviewed, setReviewed] = useState(false);
  const [account, setAccount] = useState({
    username: "",
    password: "",
    display_name: "",
    contractor_name: "",
    starts_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  async function loadPeople() {
    const [a, s] = await Promise.all([
      permitApi<{ data: Contractor[] }>("contractors", company),
      permitApi<{ data: { key: string; name: string }[] }>("members", company),
    ]);
    setAccounts(a.data);
    setStaff(s.data);
  }
  useEffect(() => {
    if (tab === "people")
      loadPeople().catch((e) =>
        setError(e.message),
      ); /* Requests contain a fixed company; component is keyed by company. */
  }, [tab, company]);
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
    <div className="wp-stack">
      <div className="wp-page-title">
        <div>
          <span className="wp-eyebrow">WORKSPACE SETTINGS</span>
          <h2>{tab === "templates" ? "แม่แบบเอกสาร" : "ผู้ใช้และผู้ลงนาม"}</h2>
          <p>ตั้งค่าสำหรับบริษัท {company.toUpperCase()}</p>
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
          <div className="wp-inline">
            {company === "amt" && (
              <button
                className="wp-primary"
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
            )}
            <button className="wp-secondary" onClick={() => setEditing(blank)}>
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
          <div className="wp-notice">
            แม่แบบนำเข้าเป็นฉบับรอตรวจทาน รายการดิจิทัลสรุปจากต้นฉบับ
            ผู้ดูแลต้องตรวจรายการย่อย Revision และผู้ลงนามก่อนเปิดใช้
            การแก้ไขสร้างเวอร์ชันใหม่และไม่เปลี่ยนเอกสารที่บันทึกไปแล้ว
          </div>
          {editing && (
            <form
              className="wp-panel"
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
                <div key={i} className="wp-template-field">
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
                              ? { ...x, kind: e.target.value as typeof x.kind }
                              : x,
                          ),
                        },
                      })
                    }
                  >
                    <option value="textarea">ข้อความหลายบรรทัด</option>
                    <option value="text">ข้อความ</option>
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
              <div className="wp-inline">
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
          <label className="wp-inline wp-panel">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            ข้าพเจ้าได้ตรวจทานเนื้อหา Revision
            และขั้นตอนลงนามของแม่แบบที่จะเปิดใช้แล้ว
          </label>
          <div className="wp-template-grid">
            {templates.map((t) => (
              <section key={t.id} className="wp-panel wp-template-card">
                <div className="wp-inline">
                  <span className="wp-code">{t.code}</span>
                  <span
                    className={`wp-status ${t.active ? "approved" : "draft"}`}
                  >
                    {t.active ? "เปิดใช้" : "รอตรวจทาน / ปิดใช้"}
                  </span>
                </div>
                <h3>{t.name}</h3>
                <p>
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
                    className="wp-primary"
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
          <section className="wp-panel">
            <h3>สร้างบัญชีผู้รับเหมาชั่วคราว</h3>
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
                        contractor_name: "บริษัทผู้รับเหมา",
                        username: "ชื่อเข้าสู่ระบบ",
                        password: "รหัสผ่าน (อย่างน้อย 12 ตัว)",
                      }[k]
                    }
                    <input
                      autoComplete="off"
                      type={k === "password" ? "password" : "text"}
                      required
                      value={account[k]}
                      onChange={(e) =>
                        setAccount({ ...account, [k]: e.target.value })
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
                สร้างบัญชีชั่วคราว
              </button>
            </form>
          </section>
          <section className="wp-panel">
            <h3>บัญชีผู้รับเหมา ({accounts.length})</h3>
            {!accounts.length && (
              <p className="wp-muted">ยังไม่มีบัญชีผู้รับเหมา</p>
            )}
            {accounts.map((a) => (
              <div className="wp-account-row" key={a.id}>
                <div>
                  <b>
                    {a.display_name} · {a.username}
                  </b>
                  <p>
                    {a.contractor_name} · หมดอายุ {dateTime(a.expires_at)}
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
          <section className="wp-panel">
            <h3>กำหนดผู้มีสิทธิ์ลงนาม</h3>
            <p className="wp-muted">
              ใช้บัญชีบุคลากรภายในที่มีอยู่ ผู้รับเหมาไม่มีสิทธิ์อนุมัติ
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
                  onChange={(e) => setRole(e.target.value as PermitRole)}
                >
                  {Object.entries(ROLE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button className="wp-primary" disabled={busy}>
                เพิ่มสิทธิ์ลงนาม
              </button>
            </form>
            {directory.map((m) => (
              <div className="wp-account-row" key={m.actor_key + m.role}>
                <span>
                  {m.display_name} · {ROLE_LABELS[m.role as PermitRole]}
                </span>
                <button
                  className="wp-link"
                  disabled={busy}
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
