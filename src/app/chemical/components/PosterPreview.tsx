"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import type { PosterSnapshot } from "@/lib/chemical/poster";
import {
  renderPoster,
  downloadPoster,
  type RenderedPoster,
} from "@/lib/chemical/poster-pdf";
export function PosterPreview({
  snapshot,
  sdsUrl = "",
  demo = false,
}: {
  snapshot: PosterSnapshot;
  sdsUrl?: string;
  demo?: boolean;
}) {
  const [rendered, setRendered] = useState<
      (RenderedPoster & { snapshot: PosterSnapshot }) | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [waiting, setWaiting] = useState(true);
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
      className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
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
          <img
            data-testid="poster-preview"
            src={rendered.image}
            alt={`ตัวอย่างโปสเตอร์ ${snapshot.draft.name}`}
            className={`w-full h-auto shadow-md ${waiting ? "opacity-50" : ""}`}
          />
        )}
      </div>
      <p className="p-3 text-xs text-gray-600">
        พิมพ์สี เลือกขนาดจริง 100% · ดาวน์โหลด PDF ไม่ได้บันทึก Rev ให้อัตโนมัติ
      </p>
    </section>
  );
}
