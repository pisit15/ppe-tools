"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Copy, Save } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  DEFAULT_POSTER_CONFIG,
  POSTER_SECTIONS,
  POSTER_TEXT_FIELDS,
  templateSnapshot,
  type PosterTemplate,
  type PosterTemplateConfig,
  type PosterDraft,
} from "@/lib/chemical/poster";
import { posterRead } from "@/lib/chemical/usePosterVersions";
import { readPosterImage } from "@/lib/chemical/poster-pdf";
import { PosterPreview } from "../components/PosterPreview";
import { inputCls, labelCls } from "../components/ui";
const empty = (): PosterTemplate => ({
  id: crypto.randomUUID(),
  name: "แม่แบบใหม่",
  company_id: "all",
  is_visible: true,
  revision: 1,
  config: structuredClone(DEFAULT_POSTER_CONFIG),
  updated_at: "",
});
function sample(t: PosterTemplate): PosterDraft {
  const d = Object.fromEntries(
    Object.keys(POSTER_TEXT_FIELDS).map((k) => [k, ""]),
  ) as Record<keyof typeof POSTER_TEXT_FIELDS, string>;
  return {
    ...d,
    name: "ชื่อผลิตภัณฑ์ / สารเคมี",
    company: t.config.subtitle,
    documentCode: "รหัสเอกสาร",
    documentRevision: "01",
    formCode: t.config.formCode,
    formRevision: t.config.formRevision,
    hazards: "ข้อความแสดงอันตรายจาก SDS ของผลิตภัณฑ์",
    precautions: "ข้อควรระวังจาก SDS ของผลิตภัณฑ์",
    firstAid: "ข้อมูลการปฐมพยาบาลจาก SDS",
    storage: "ข้อมูลการขนย้ายและจัดเก็บจาก SDS",
    signal: "",
    pictograms: [],
    ppe: [],
    showPpeCaptions: true,
    productImage: "",
  };
}
export default function PosterTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<PosterTemplate[]>([]),
    [draft, setDraft] = useState<PosterTemplate | null>(null),
    [baseline, setBaseline] = useState("");
  const [companies, setCompanies] = useState<
      { company_id: string; company_name: string }[]
    >([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const existing = templates.some((t) => t.id === draft?.id);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (user?.role !== "admin") return;
    let current = true;
    Promise.all([
      posterRead<{ data: PosterTemplate[] }>(
        "/api/chemical/poster-templates?manage=1",
      ),
      posterRead<typeof companies>("/api/companies"),
    ])
      .then(([r, c]) => {
        if (current) {
          setTemplates(r.data);
          setCompanies(c);
          const t = r.data[0] || empty();
          setDraft(t);
          setBaseline(JSON.stringify(t));
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [user?.role]);
  function select(t: PosterTemplate) {
    if (dirty && !window.confirm("ละทิ้งการแก้ไขแม่แบบที่ยังไม่บันทึกหรือไม่?"))
      return;
    setDraft(t);
    setBaseline(JSON.stringify(t));
    setError("");
    setMessage("");
  }
  function config<K extends keyof PosterTemplateConfig>(
    key: K,
    value: PosterTemplateConfig[K],
  ) {
    setDraft((t) => t && { ...t, config: { ...t.config, [key]: value } });
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    try {
      config("logo", await readPosterImage(file, 200000));
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดรูปไม่สำเร็จ");
    }
  }
  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { data } = await posterRead<{ data: PosterTemplate }>(
        "/api/chemical/poster-templates",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      setTemplates((list) =>
        [data, ...list.filter((t) => t.id !== data.id)].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setDraft(data);
      setBaseline(JSON.stringify(data));
      setMessage(
        "บันทึกแม่แบบแล้ว ผู้ใช้เลือกได้เมื่อเปิดหน้าโปสเตอร์ใหม่ ส่วน Rev ที่บันทึกไว้ยังคงรูปแบบเดิม",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  if (user?.role !== "admin")
    return <p role="alert">เฉพาะ Admin เท่านั้นที่จัดการแม่แบบโปสเตอร์ได้</p>;
  return (
    <div className="max-w-[1800px] mx-auto">
      <a
        href="/chemical"
        onClick={(e) => {
          if (
            dirty &&
            !window.confirm("ละทิ้งการแก้ไขแม่แบบที่ยังไม่บันทึกหรือไม่?")
          )
            e.preventDefault();
        }}
        className="inline-flex gap-2 mb-5 text-gray-600"
      >
        <ArrowLeft size={18} /> กลับทะเบียนสารเคมี
      </a>
      <h1 className="text-2xl font-bold mb-2">จัดการแม่แบบโปสเตอร์</h1>
      <p className="text-gray-600 mb-6">
        แม่แบบที่เปิดใช้ ทุกบริษัทเลือกได้ เลือกโครงหน้าแบบสรุป ตาราง AAB
        หรือแบบ AMT 7 หมวด แล้วปรับหัวข้อ สี และตราบริษัท
      </p>
      {error && (
        <p role="alert" className="bg-red-50 text-red-700 p-3 mb-4">
          {error}{" "}
          <button className="underline" onClick={() => location.reload()}>
            โหลดข้อมูลล่าสุด
          </button>
        </p>
      )}
      {message && (
        <p role="status" className="bg-green-50 text-green-800 p-3 mb-4">
          {message}
        </p>
      )}
      {!draft ? (
        <p>กำลังโหลดแม่แบบ…</p>
      ) : (
        <div className="grid xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)] gap-6 items-start">
          <fieldset
            disabled={busy}
            className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 min-w-0"
          >
            <div>
              <label htmlFor="admin-template" className={labelCls}>
                เลือกแม่แบบที่ต้องการแก้ไข
              </label>
              <select
                id="admin-template"
                className={inputCls}
                value={existing ? draft.id : ""}
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value);
                  if (t) select(t);
                }}
              >
                <option value="" disabled>
                  แม่แบบใหม่
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {!t.is_visible ? " (ซ่อน)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => select(empty())}
                className="border rounded-xl px-3 py-2 inline-flex gap-2"
              >
                <Plus size={18} /> สร้างแม่แบบ
              </button>
              <button
                onClick={() =>
                  select({
                    ...structuredClone(draft),
                    id: crypto.randomUUID(),
                    name: `${draft.name} (สำเนา)`.slice(0, 120),
                    revision: 1,
                    updated_at: "",
                  })
                }
                className="border rounded-xl px-3 py-2 inline-flex gap-2"
              >
                <Copy size={18} /> ทำสำเนา
              </button>
            </div>
            <div>
              <label htmlFor="template-name" className={labelCls}>
                ชื่อแม่แบบ
              </label>
              <input
                id="template-name"
                className={inputCls}
                value={draft.name}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="template-company" className={labelCls}>
                  บริษัทต้นแบบ
                </label>
                <select
                  id="template-company"
                  className={inputCls}
                  value={draft.company_id}
                  onChange={(e) =>
                    setDraft({ ...draft, company_id: e.target.value })
                  }
                >
                  <option value="all">แม่แบบกลาง</option>
                  {companies.map((c) => (
                    <option key={c.company_id} value={c.company_id}>
                      {c.company_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="template-layout" className={labelCls}>
                  โครงหน้า
                </label>
                <select
                  id="template-layout"
                  className={inputCls}
                  value={draft.config.layout}
                  onChange={(e) =>
                    config(
                      "layout",
                      e.target.value as PosterTemplateConfig["layout"],
                    )
                  }
                >
                  <option value="summary">สรุป · A4 แนวตั้ง</option>
                  <option value="aab">ตาราง AAB · A4 แนวนอน</option>
                  <option value="amt">AMT · SDS 7 หมวด · A4 แนวตั้ง</option>
                </select>
              </div>
            </div>
            {(
              [
                ["title", "ชื่อหัวโปสเตอร์"],
                ["subtitle", "ชื่อบริษัทเริ่มต้น"],
                ["brand", "ชื่อย่อแทนโลโก้ (แบบ AAB / AMT)"],
                ["formCode", "รหัสแบบฟอร์มเริ่มต้น"],
                ["formRevision", "Rev. แบบฟอร์มเริ่มต้น"],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label htmlFor={`template-${k}`} className={labelCls}>
                  {label}
                </label>
                <input
                  id={`template-${k}`}
                  className={inputCls}
                  maxLength={
                    k === "brand" || k === "formRevision"
                      ? 30
                      : k === "formCode"
                        ? 100
                        : 160
                  }
                  value={draft.config[k]}
                  onChange={(e) => config(k, e.target.value)}
                />
              </div>
            ))}
            <div className="flex items-center gap-3">
              <label htmlFor="template-accent">สีประจำแม่แบบ</label>
              <input
                id="template-accent"
                type="color"
                value={draft.config.accent}
                onChange={(e) => config("accent", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="template-logo" className={labelCls}>
                โลโก้บริษัท (PNG / JPEG)
              </label>
              <input
                id="template-logo"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              {draft.config.logo && (
                <div className="flex gap-3 items-center mt-2">
                  <img
                    src={draft.config.logo}
                    alt="โลโก้แม่แบบ"
                    className="w-24 h-20 object-contain"
                  />
                  <button
                    onClick={() => config("logo", "")}
                    className="text-red-700 underline"
                  >
                    นำโลโก้ออก
                  </button>
                </div>
              )}
            </div>
            <details>
              <summary className="font-semibold cursor-pointer">
                ปรับชื่อหัวข้อบนโปสเตอร์
              </summary>
              <div className="space-y-3 mt-4">
                {(
                  Object.keys(
                    POSTER_SECTIONS,
                  ) as (keyof typeof POSTER_SECTIONS)[]
                ).map((k) => (
                  <div key={k}>
                    <label htmlFor={`heading-${k}`} className={labelCls}>
                      {POSTER_SECTIONS[k]}
                    </label>
                    <input
                      id={`heading-${k}`}
                      className={inputCls}
                      maxLength={100}
                      value={draft.config.headings[k]}
                      onChange={(e) =>
                        config("headings", {
                          ...draft.config.headings,
                          [k]: e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </details>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.is_visible}
                onChange={(e) =>
                  setDraft({ ...draft, is_visible: e.target.checked })
                }
              />{" "}
              เปิดให้ผู้ใช้เลือกแม่แบบนี้
            </label>
            <p className="text-xs text-gray-600">
              ซ่อนแม่แบบได้โดยเอาเครื่องหมายออก · โปสเตอร์ Rev
              เดิมยังเปิดและดาวน์โหลดได้
            </p>
            <button
              onClick={() => void save()}
              disabled={!draft.name.trim() || (existing && !dirty)}
              className="inline-flex gap-2 items-center bg-purple-700 text-white rounded-xl px-4 py-2.5 disabled:opacity-40"
            >
              <Save size={18} /> {busy ? "กำลังบันทึก…" : "บันทึกแม่แบบ"}
            </button>
          </fieldset>
          <div className="xl:sticky xl:top-4">
            <p className="text-sm text-gray-600 mb-2">
              ตัวอย่างโครงหน้า — ผู้ใช้ใส่ข้อมูลจริงเมื่อสร้างโปสเตอร์ของสารเคมี
            </p>
            <PosterPreview
              snapshot={{
                schema: 1,
                template: templateSnapshot(draft),
                draft: sample(draft),
                fontSize: 9,
              }}
              demo
            />
          </div>
        </div>
      )}
    </div>
  );
}
