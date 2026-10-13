"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Pencil, X } from "lucide-react";
import {
  POSTER_TEXT_FIELDS,
  type PosterSnapshot,
  type PosterTextField,
} from "@/lib/chemical/poster";
import { editablePosterDraft } from "@/lib/chemical/poster-editing";
import {
  renderPoster,
  downloadPoster,
  type RenderedPoster,
  type PosterEditRegion,
} from "@/lib/chemical/poster-pdf";
export function PosterPreview({
  snapshot,
  sdsUrl = "",
  demo = false,
  disabled = false,
  onTextChange,
}: {
  snapshot: PosterSnapshot;
  sdsUrl?: string;
  demo?: boolean;
  disabled?: boolean;
  onTextChange?: (field: PosterTextField, value: string) => void;
}) {
  const [rendered, setRendered] = useState<
      (RenderedPoster & { snapshot: PosterSnapshot }) | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [waiting, setWaiting] = useState(true);
  const [editMode, setEditMode] = useState(true);
  const [active, setActive] = useState<{
    region: PosterEditRegion;
    field: PosterTextField;
  } | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const editable = editablePosterDraft(snapshot);
  useEffect(() => {
    if (active) editor.current?.focus();
  }, [active]);
  function closeEditor() {
    setActive(null);
    trigger.current?.focus();
  }
  useEffect(() => {
    let current = true;
    setWaiting(true);
    setError("");
    const timer = setTimeout(() => {
      renderPoster(snapshot, sdsUrl, demo)
        .then((r) => {
          if (current) setRendered({ ...r, snapshot });
        })
        .catch((e) => {
          if (current) {
            setRendered(null);
            setError(e.message);
          }
        })
        .finally(() => {
          if (current) setWaiting(false);
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [snapshot, sdsUrl, demo]);
  async function download() {
    if (
      !rendered ||
      rendered.snapshot !== snapshot ||
      rendered.sdsUrl !== sdsUrl
    )
      return;
    setBusy(true);
    setError("");
    try {
      await downloadPoster(rendered, snapshot.draft.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้าง PDF ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white"
      aria-label="ตัวอย่างโปสเตอร์"
    >
      <div className="p-4 flex flex-wrap justify-between gap-3 items-center border-b border-gray-100">
        <div>
          <h2 className="font-bold">ตัวอย่างโปสเตอร์</h2>
          <p className="text-sm text-gray-600">
            A4{" "}
            {snapshot.template.config.layout === "aab" ? "แนวนอน" : "แนวตั้ง"} ·
            PDF 300 DPI
          </p>
        </div>
        <button
          type="button"
          disabled={
            disabled ||
            !!active ||
            waiting ||
            busy ||
            !rendered ||
            rendered.snapshot !== snapshot ||
            !!rendered.problems.length ||
            !snapshot.draft.name.trim()
          }
          onClick={() => void download()}
          className="bg-purple-700 text-white rounded-xl px-4 py-2 flex gap-2 items-center disabled:opacity-40"
        >
          <Download size={18} /> {busy ? "กำลังสร้าง…" : "ดาวน์โหลด PDF"}
        </button>
      </div>
      {onTextChange && (
        <div className="px-4 py-3 bg-purple-50 text-sm text-purple-900">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editMode}
              disabled={disabled}
              onChange={(e) => {
                setEditMode(e.target.checked);
                setActive(null);
              }}
            />
            <Pencil size={16} /> แก้ข้อความบนตัวอย่าง
          </label>
          <p className="mt-1 text-xs">
            คลิกช่องข้อความเพื่อพิมพ์เพิ่ม แก้ไข หรือลบ · กดเสร็จแล้วบันทึกเป็น
            Rev ใหม่เพื่อเก็บไว้
          </p>
        </div>
      )}
      {waiting && (
        <p role="status" className="p-3 text-sm text-purple-700">
          กำลังจัดหน้า…
        </p>
      )}
      {error && (
        <p role="alert" className="p-3 text-red-700">
          {error}
        </p>
      )}
      {!waiting && rendered?.problems.length ? (
        <div role="alert" className="p-3 bg-red-50 text-red-800 text-sm">
          <p className="font-semibold">
            ข้อความบางส่วนเกินพื้นที่ ยังดาวน์โหลด PDF ไม่ได้
          </p>
          <ul className="list-disc pl-5">
            {rendered.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="p-3 bg-slate-100">
        {rendered && (
          <div className="relative" data-testid="poster-edit-surface">
            <img
              data-testid="poster-preview"
              src={rendered.image}
              alt={`ตัวอย่างโปสเตอร์ ${snapshot.draft.name}`}
              className={`w-full h-auto shadow-md ${waiting ? "opacity-50" : ""}`}
            />
            {onTextChange &&
              editMode &&
              rendered.editRegions.map((region) => (
                <button
                  type="button"
                  key={region.id}
                  data-testid={`poster-edit-${region.fields[0]}`}
                  aria-label={`แก้บนโปสเตอร์: ${region.fields.map((f) => POSTER_TEXT_FIELDS[f]).join(" / ")}`}
                  title={`แก้ไข ${POSTER_TEXT_FIELDS[region.fields[0]]}`}
                  disabled={
                    disabled || waiting || rendered.snapshot !== snapshot
                  }
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setActive({ region, field: region.fields[0] });
                  }}
                  className="absolute border border-dashed border-purple-500/20 hover:border-purple-600 hover:bg-purple-100/30 focus-visible:outline-2 focus-visible:outline-purple-600 cursor-text disabled:pointer-events-none"
                  style={{
                    left: `${(region.x / rendered.width) * 100}%`,
                    top: `${(region.y / rendered.height) * 100}%`,
                    width: `${(region.width / rendered.width) * 100}%`,
                    height: `${(region.height / rendered.height) * 100}%`,
                  }}
                />
              ))}
            {active && onTextChange && editMode && (
              <div
                role="group"
                aria-label="แก้ไขข้อความบนโปสเตอร์"
                className="absolute z-10 w-[420px] max-w-full rounded-xl border-2 border-purple-600 bg-white p-3 shadow-xl"
                style={{
                  left: `min(${(active.region.x / rendered.width) * 100}%, max(0px, calc(100% - 420px)))`,
                  top: `min(${(active.region.y / rendered.height) * 100}%, max(0px, calc(100% - 360px)))`,
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    closeEditor();
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-purple-900">
                    แก้ข้อความบนโปสเตอร์
                  </span>
                  <button
                    type="button"
                    aria-label="ปิดช่องแก้ไข"
                    onClick={closeEditor}
                    className="p-1 rounded hover:bg-purple-50"
                  >
                    <X size={18} />
                  </button>
                </div>
                {active.region.fields.length > 1 && (
                  <select
                    aria-label="เลือกข้อความในช่องโปสเตอร์"
                    value={active.field}
                    onChange={(e) =>
                      setActive({
                        ...active,
                        field: e.target.value as PosterTextField,
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-2 py-2 mb-2 text-sm"
                  >
                    {active.region.fields.map((f) => (
                      <option key={f} value={f}>
                        {POSTER_TEXT_FIELDS[f]}
                      </option>
                    ))}
                  </select>
                )}
                <label
                  htmlFor="poster-inline-text"
                  className="block text-sm mb-1"
                >
                  {POSTER_TEXT_FIELDS[active.field]}
                </label>
                <textarea
                  ref={editor}
                  id="poster-inline-text"
                  aria-label={`ข้อความบนโปสเตอร์: ${POSTER_TEXT_FIELDS[active.field]}`}
                  rows={6}
                  maxLength={8000}
                  disabled={disabled}
                  value={editable[active.field]}
                  onChange={(e) => onTextChange(active.field, e.target.value)}
                  className="w-full border border-purple-300 rounded-lg p-2 text-sm leading-relaxed text-gray-900 bg-white resize-y focus:outline-2 focus:outline-purple-600"
                />
                <div className="mt-2 flex justify-between gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    className="text-red-700 text-sm px-2 py-2"
                    onClick={() => onTextChange(active.field, "")}
                  >
                    ล้างข้อความ
                  </button>
                  <button
                    type="button"
                    onClick={closeEditor}
                    className="bg-purple-700 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    เสร็จ
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  ข้อความปรับในโปสเตอร์นี้ · บันทึกเป็น Rev
                  ใหม่เพื่อใช้ครั้งถัดไป
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      <p className="p-3 text-xs text-gray-600">
        พิมพ์สี เลือกขนาดจริง 100% · ดาวน์โหลด PDF ไม่ได้บันทึก Rev ให้อัตโนมัติ
      </p>
    </section>
  );
}
