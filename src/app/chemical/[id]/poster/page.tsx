"use client";
export const dynamic = "force-dynamic";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Save, RotateCcw, Settings2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import type { ChemSubstance, ChemCompanySettings } from "@/lib/types";
import {
  POSTER_TEXT_FIELDS,
  type PosterDraft,
  type PosterTextField,
  type PosterTemplate,
  type PosterHistory,
} from "@/lib/chemical/poster";
import {
  posterRead,
  usePosterVersions,
} from "@/lib/chemical/usePosterVersions";
import { readPosterImage } from "@/lib/chemical/poster-pdf";
import { publicSdsUrl } from "@/lib/chemical/label";
import { GHS_PICTOGRAMS } from "@/lib/chemical/ghs";
import { PosterPreview } from "../../components/PosterPreview";
import { LabelPpePicker } from "../../components/LabelPpePicker";
import { inputCls, labelCls } from "../../components/ui";
const groups: { title: string; keys: PosterTextField[]; large?: boolean }[] = [
  {
    title: "เอกสารและแบบฟอร์ม",
    keys: [
      "documentCode",
      "documentRevision",
      "effectiveDate",
      "formCode",
      "formRevision",
      "company",
      "department",
      "issued",
      "checked",
      "approved",
    ],
  },
  {
    title: "ผลิตภัณฑ์",
    keys: [
      "name",
      "chemicalName",
      "cas",
      "un",
      "formula",
      "supplier",
      "sdsDate",
    ],
  },
  {
    title: "ข้อมูลความปลอดภัยจาก SDS",
    keys: [
      "hazards",
      "precautions",
      "firstAid",
      "storage",
      "storageClass",
      "fire",
      "spill",
      "ingredients",
      "physical",
      "ppeNotes",
      "emergency",
    ],
    large: true,
  },
];
type Loaded = {
  substance: ChemSubstance;
  history: PosterHistory;
  templates: PosterTemplate[];
  settings: ChemCompanySettings | null;
};
export default function PosterPage() {
  const { id } = useParams<{ id: string }>();
  return <PosterLoader key={id} id={id} />;
}
function PosterLoader({ id }: { id: string }) {
  const [data, setData] = useState<Loaded | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    (async () => {
      const [{ data: substance }, history] = await Promise.all([
        posterRead<{ data: ChemSubstance }>(`/api/chemical/substances/${id}`),
        posterRead<PosterHistory>(`/api/chemical/substances/${id}/posters`),
      ]);
      const [{ data: templates }, { data: settings }] = await Promise.all([
        posterRead<{ data: PosterTemplate[] }>(
          `/api/chemical/poster-templates?company_id=${substance.company_id}`,
        ),
        posterRead<{ data: ChemCompanySettings }>(
          `/api/chemical/settings?company_id=${substance.company_id}`,
        ),
      ]);
      if (current) setData({ substance, history, templates, settings });
    })().catch((e) => {
      if (current) setError(e.message);
    });
    return () => {
      current = false;
    };
  }, [id]);
  if (error)
    return (
      <p role="alert" className="text-red-700">
        {error}{" "}
        <button onClick={() => location.reload()} className="underline">
          ลองใหม่
        </button>
      </p>
    );
  if (!data) return <p role="status">กำลังโหลดโปสเตอร์…</p>;
  if (!data.templates.length && !data.history.latest)
    return (
      <p>
        ยังไม่มีแม่แบบโปสเตอร์ที่เปิดใช้{" "}
        <a
          href="/chemical/poster-templates"
          className="text-purple-700 underline"
        >
          จัดการแม่แบบ (Admin)
        </a>
      </p>
    );
  return <PosterEditor key={id} {...data} />;
}
function PosterEditor({ substance, history, templates, settings }: Loaded) {
  const state = usePosterVersions(substance, history, templates, settings),
    { snapshot, pending } = state;
  const d = snapshot.draft;
  const { user } = useAuth();
  const router = useRouter();
  const [imageError, setImageError] = useState("");
  const change = <K extends keyof PosterDraft>(key: K, value: PosterDraft[K]) =>
    state.setSnapshot((s) => ({ ...s, draft: { ...s.draft, [key]: value } }));
  const date = (v: string) =>
    new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(v));
  async function upload(file?: File) {
    if (!file) return;
    setImageError("");
    try {
      change("productImage", await readPosterImage(file));
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "โหลดรูปไม่สำเร็จ");
    }
  }
  const currentTemplate = templates.find(
    (t) =>
      t.id === snapshot.template.id &&
      t.revision === snapshot.template.revision,
  );
  return (
    <div className="max-w-[1800px] mx-auto">
      <button
        onClick={() => {
          if (state.discardOK())
            router.push(`/chemical?company_id=${substance.company_id}`);
        }}
        className="inline-flex gap-2 text-gray-600 items-center mb-5"
      >
        <ArrowLeft size={18} /> กลับทะเบียนสารเคมี
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-bold text-2xl flex gap-3 items-center">
            <FileText className="text-purple-700" /> โปสเตอร์สารเคมี
          </h1>
          <p className="text-gray-600 mt-1">
            {substance.name} · {substance.company_id.toUpperCase()}
          </p>
        </div>
        {user?.role === "admin" && (
          <a
            href="/chemical/poster-templates"
            target="_blank"
            rel="noopener noreferrer"
            className="border border-purple-200 text-purple-700 rounded-xl px-4 py-2 inline-flex gap-2"
          >
            <Settings2 size={18} /> จัดการแม่แบบ (Admin)
          </a>
        )}
      </div>
      <section
        className="bg-white border border-purple-200 rounded-2xl p-5 mb-5"
        aria-label="ประวัติโปสเตอร์"
      >
        <div className="flex flex-wrap justify-between gap-2">
          <h2 className="font-bold">โปสเตอร์ที่บันทึกไว้</h2>
          <span className="text-sm text-purple-800">
            {state.dirty
              ? "มีการแก้ไขที่ยังไม่บันทึก"
              : state.selected
                ? `กำลังใช้ Rev${state.selected.version}`
                : "เริ่มต้นจากทะเบียน — ยังไม่บันทึก"}
          </span>
        </div>
        <fieldset disabled={pending} className="mt-4 grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="poster-version" className={labelCls}>
              เลือก Rev โปสเตอร์
            </label>
            <select
              id="poster-version"
              value={state.selected?.version || ""}
              onChange={(e) => void state.choose(Number(e.target.value))}
              className={inputCls}
            >
              <option disabled value="">
                ยังไม่บันทึก
              </option>
              {state.versions.map((v) => (
                <option key={v.id} value={v.version}>
                  Rev{v.version}
                  {v.title ? ` · ${v.title}` : ""} · {date(v.created_at)} ·{" "}
                  {v.created_by.displayName}
                </option>
              ))}
            </select>
            {state.hasMore && (
              <button
                onClick={() => void state.loadMore()}
                className="mt-2 underline text-purple-700"
              >
                โหลด Rev ก่อนหน้า
              </button>
            )}
          </div>
          <div>
            <label htmlFor="poster-title" className={labelCls}>
              ชื่อ Rev / หมายเหตุ (ถ้ามี)
            </label>
            <input
              id="poster-title"
              maxLength={120}
              value={state.title}
              onChange={(e) => state.setTitle(e.target.value)}
              className={inputCls}
              placeholder="เช่น ใช้ที่คลังสารเคมี"
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              onClick={() => void state.save()}
              disabled={!!state.selected && !state.dirty}
              className="inline-flex gap-2 items-center bg-purple-700 text-white px-4 py-2.5 rounded-xl disabled:opacity-40"
            >
              <Save size={18} /> บันทึกเป็น Rev ใหม่
            </button>
            <button
              onClick={() => void state.reset()}
              className="inline-flex gap-2 items-center border border-gray-300 px-4 py-2.5 rounded-xl"
            >
              <RotateCcw size={18} /> เริ่มใหม่จากทะเบียน
            </button>
          </div>
        </fieldset>
        <p className="text-xs text-gray-600 mt-3">
          ทุก Rev เก็บข้อความ รูปภาพ และแม่แบบที่ใช้ไว้ · เปิดครั้งถัดไปใช้ Rev
          ล่าสุด · การแก้โปสเตอร์ไม่เปลี่ยนทะเบียนสารเคมี
        </p>
        <p className="text-xs text-gray-600 mt-1">
          เลข Rev ในประวัติเรียงอัตโนมัติ ส่วน Rev. บนเอกสารและ Rev.
          แบบฟอร์มกรอกตามระบบเอกสารของบริษัทได้
        </p>
        {pending && (
          <p role="status" className="text-purple-700 mt-2">
            กำลังดำเนินการ…
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-red-700 mt-2">
            {state.error} — ข้อความที่แก้ยังอยู่ในหน้านี้
          </p>
        )}
        {state.message && (
          <p role="status" className="text-green-700 mt-2">
            {state.message}
          </p>
        )}
      </section>
      <div className="grid xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)] gap-6 items-start">
        <fieldset disabled={pending} className="space-y-5 min-w-0">
          <section className="bg-white rounded-2xl border border-gray-200 p-5">
            <label htmlFor="poster-template" className={labelCls}>
              แม่แบบโปสเตอร์
            </label>
            <select
              id="poster-template"
              className={inputCls}
              value={currentTemplate?.id || "saved"}
              onChange={(e) => {
                const t = templates.find((t) => t.id === e.target.value);
                if (t) state.chooseTemplate(t);
              }}
            >
              {!currentTemplate && (
                <option value="saved">
                  {snapshot.template.name} · รูปแบบที่เก็บใน Rev นี้
                </option>
              )}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ·{" "}
                  {t.config.layout === "aab" ? "A4 แนวนอน" : "A4 แนวตั้ง"}
                </option>
              ))}
            </select>
            <label htmlFor="poster-font" className={`${labelCls} mt-4`}>
              ขนาดข้อความ
            </label>
            <select
              id="poster-font"
              className={inputCls}
              value={snapshot.fontSize}
              onChange={(e) =>
                state.setSnapshot((s) => ({
                  ...s,
                  fontSize: Number(e.target.value),
                }))
              }
            >
              {[7, 8, 9, 10, 11, 12].map((n) => (
                <option key={n} value={n}>
                  {n} pt
                </option>
              ))}
            </select>
          </section>
          {groups.map((g, i) => (
            <details
              key={g.title}
              open={i === 0}
              className="bg-white rounded-2xl border border-gray-200 p-5"
            >
              <summary className="font-bold cursor-pointer">{g.title}</summary>
              <div
                className={`mt-4 grid gap-4 ${g.large ? "" : "sm:grid-cols-2"}`}
              >
                {g.keys.map((k) => (
                  <div key={k}>
                    <label htmlFor={`poster-${k}`} className={labelCls}>
                      {POSTER_TEXT_FIELDS[k]}
                    </label>
                    {g.large ? (
                      <textarea
                        id={`poster-${k}`}
                        rows={4}
                        maxLength={8000}
                        className={inputCls}
                        value={d[k]}
                        onChange={(e) => change(k, e.target.value)}
                      />
                    ) : (
                      <input
                        id={`poster-${k}`}
                        className={inputCls}
                        maxLength={500}
                        value={d[k]}
                        onChange={(e) => change(k, e.target.value)}
                        placeholder={
                          k === "effectiveDate" ? "เช่น 10/10/2025" : undefined
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
          <details className="bg-white rounded-2xl border border-gray-200 p-5">
            <summary className="font-bold cursor-pointer">
              สัญลักษณ์ GHS และคำสัญญาณ
            </summary>
            <div className="grid grid-cols-3 gap-2 my-4">
              {GHS_PICTOGRAMS.map((p) => (
                <label
                  key={p.code}
                  className="rounded-xl border border-gray-200 p-2 text-center text-xs cursor-pointer"
                >
                  <img
                    src={p.file}
                    alt=""
                    width={40}
                    height={40}
                    className="mx-auto mb-1"
                  />
                  <span className="block mb-1">{p.nameTh}</span>
                  <input
                    type="checkbox"
                    checked={d.pictograms.includes(p.code)}
                    onChange={(e) =>
                      change(
                        "pictograms",
                        e.target.checked
                          ? [...d.pictograms, p.code]
                          : d.pictograms.filter((c) => c !== p.code),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <label htmlFor="poster-signal" className={labelCls}>
              คำสัญญาณตาม SDS
            </label>
            <select
              id="poster-signal"
              className={inputCls}
              value={d.signal}
              onChange={(e) =>
                change("signal", e.target.value as PosterDraft["signal"])
              }
            >
              <option value="">ยังไม่ระบุ</option>
              <option value="Danger">อันตราย / DANGER</option>
              <option value="Warning">ระวัง / WARNING</option>
              <option value="None">ไม่มีคำสัญญาณ</option>
            </select>
          </details>
          <details className="bg-white rounded-2xl border border-gray-200 p-5">
            <summary className="font-bold cursor-pointer">
              รูป PPE และรูปผลิตภัณฑ์
            </summary>
            <div className="mt-4">
              <LabelPpePicker
                mode="poster"
                value={d.ppe}
                onChange={(v) => change("ppe", v)}
                showCaptions={d.showPpeCaptions}
                onCaptionsChange={(v) => change("showPpeCaptions", v)}
              />
              <label
                htmlFor="poster-productImage"
                className={`${labelCls} mt-4`}
              >
                รูปผลิตภัณฑ์ (ใช้ในแบบตาราง AAB)
              </label>
              <input
                id="poster-productImage"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              {d.productImage && (
                <div className="flex gap-2 mt-2 items-center">
                  <img
                    src={d.productImage}
                    alt="รูปผลิตภัณฑ์ที่เลือก"
                    className="w-24 h-24 object-contain"
                  />
                  <button
                    onClick={() => change("productImage", "")}
                    className="text-red-700 underline"
                  >
                    นำรูปออก
                  </button>
                </div>
              )}
              {imageError && (
                <p role="alert" className="text-red-700">
                  {imageError}
                </p>
              )}
            </div>
          </details>
        </fieldset>
        <div className="xl:sticky xl:top-4">
          <PosterPreview
            snapshot={snapshot}
            sdsUrl={
              state.source.sds_url || state.source.sds_file_path
                ? publicSdsUrl(state.source.id)
                : ""
            }
            demo={!!state.source.is_demo}
          />
        </div>
      </div>
    </div>
  );
}
