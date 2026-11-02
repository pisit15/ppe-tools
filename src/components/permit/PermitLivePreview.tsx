"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import type { PermitData } from "@/lib/permit/types";

type Warning = { formCode: string; fieldId: string; label: string; page: number; annex: string };
type PreviewResponse = { pdf: string; warnings: Warning[] };
type LoadedPreview = { key: string; token: string; document: PDFDocumentProxy };
type Zoom = "fit" | 100 | 150 | 200;

// Keep file bytes and saved signatures out of live-preview requests. Template IDs
// are resolved by the server; none of the browser's layout metadata is trusted.
function printableData(data: PermitData) {
  return {
    title: data.title, location: data.location, locationId:data.locationId, detail: data.detail,
    contractorName: data.contractorName, phone: data.phone, workers: data.workers,
    workerCount: data.workerCount, startsAt: data.startsAt, endsAt: data.endsAt,
    fireImpact: data.fireImpact, project: data.project,
    forms: data.forms.map(f => ({ template: { id: f.template.id }, answers: f.answers })),
    approvers: data.approvers,
  };
}

export default function PermitLivePreview({ data, company, activeFormCode, launcherHost }: { data: PermitData; company: string; activeFormCode?: string; launcherHost?: HTMLElement | null }) {
  const requestBody = useMemo(() => JSON.stringify({ data: printableData(data) }), [data]);
  const requestKey = `${company}:${requestBody}`;
  const enabled = company === "amt" && data.forms.length > 0;
  const [response, setResponse] = useState<(PreviewResponse & { key: string; token: string }) | null>(null);
  const [loaded, setLoaded] = useState<LoadedPreview | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [expanded, setExpanded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(420);
  const [painted, setPainted] = useState<{ key: string; token: string; page: number; zoom: Zoom; width: number; cssWidth: number; cssHeight: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestGeneration = useRef(0);
  const renderGeneration = useRef(0);
  const restoreFocus = useRef<HTMLElement | null>(null);

  // A changed key makes the existing image stale during this very render, before
  // either the debounce timer or the next request has run.
  const current = enabled && painted?.key === requestKey && painted.page === pageNumber && painted.zoom === zoom && painted.width === viewportWidth;
  const error = failure?.key === requestKey ? failure.message : "";
  const pageCount = loaded?.key === requestKey ? loaded.document.numPages : 0;
  const currentWarnings = response?.key === requestKey ? response.warnings : [];
  const originalPageLabels = data.forms.flatMap(f => Array.from({ length: f.template.source_code === "005" ? 2 : 1 }, (_, n) => `${f.template.code}${f.template.source_code === "005" ? ` (${n + 1})` : ""}`));
  const formKey=data.forms.map(f=>f.template.id).join(',');
  let activeFormPage: number | undefined;
  let sourcePage = 1;
  for (const form of data.forms) {
    if (form.template.code === activeFormCode) activeFormPage = sourcePage;
    sourcePage += form.template.source_code === "005" ? 2 : 1;
  }
  const status = !data.forms.length ? "เลือกประเภทงานเพื่อดูแม่แบบจริง" : company !== "amt" ? "แม่แบบบริษัทนี้ยังไม่มีตัวอย่างตามต้นฉบับ" : error ? "ยังสร้างตัวอย่างล่าสุดไม่สำเร็จ" : current ? "ตัวอย่างตรงกับข้อมูลล่าสุด" : "กำลังอัปเดตตัวอย่าง — กรุณารอสักครู่";

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const controller = new AbortController();
    if (!enabled) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const result = await fetch(`/api/permit/preview?company_id=${encodeURIComponent(company)}`, {
          method: "POST", cache: "no-store", signal: controller.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({...JSON.parse(requestBody), requestKey:`preview-${generation}`}),
        });
        const body = await result.json();
        if (!result.ok) throw new Error(body.error || "สร้างตัวอย่างไม่สำเร็จ กรุณาลองใหม่");
        if (typeof body.pdf !== "string" || !Array.isArray(body.warnings)) throw new Error("ตัวอย่างเอกสารไม่สมบูรณ์ กรุณาลองใหม่");
        if (!controller.signal.aborted && generation === requestGeneration.current) {
          setFailure(null); setResponse({ key: requestKey, token:typeof body.requestKey==='string'?body.requestKey:`preview-${generation}`, pdf: body.pdf, warnings: body.warnings });
        }
      } catch (e) {
        if (!controller.signal.aborted && generation === requestGeneration.current)
          setFailure({ key: requestKey, message: e instanceof Error ? e.message : "สร้างตัวอย่างไม่สำเร็จ กรุณาลองใหม่" });
      }
    }, 700);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, company, requestBody, requestKey, retry]);

  useEffect(()=>{setPageNumber(1);},[formKey]);
  useEffect(()=>{
    if (activeFormPage) setPageNumber(activeFormPage);
  },[activeFormCode,formKey,activeFormPage]);

  useEffect(() => {
    if (!response) return;
    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;
    let document: PDFDocumentProxy | undefined;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        task = pdfjs.getDocument({ data: Uint8Array.from(atob(response.pdf), c => c.charCodeAt(0)) });
        document = await task.promise;
        if (cancelled) { await document.destroy(); return; }
        setLoaded({ key: response.key, token:response.token, document });
      } catch {
        if (!cancelled) setFailure({ key: response.key, message: "เปิดตัวอย่าง PDF ไม่สำเร็จ กรุณาลองใหม่" });
      }
    })();
    return () => { cancelled = true; void task?.destroy().catch(() => {}); };
  }, [response]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(entries => {
      const width = Math.floor(entries[0]?.contentRect.width || 0) - 24;
      if (width > 100) setViewportWidth(previous => Math.abs(previous - width) >= 1 ? width : previous);
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!loaded || loaded.key !== requestKey) return;
    const generation = ++renderGeneration.current;
    let cancelled = false;
    let task: RenderTask | undefined;
    (async () => {
      try {
        const page = await loaded.document.getPage(Math.min(pageNumber, loaded.document.numPages));
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const cssScale = zoom === "fit" ? viewportWidth / base.width : zoom / 100 * 4 / 3;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        // Render off screen so a cancelled older render can never paint into the
        // visible canvas after a newer response or a page/zoom change.
        const buffer = document.createElement("canvas");
        buffer.width = Math.ceil(viewport.width); buffer.height = Math.ceil(viewport.height);
        const context = buffer.getContext("2d");
        if (!context) throw new Error("ไม่สามารถแสดงตัวอย่างได้");
        task = page.render({ canvasContext: context, viewport });
        await task.promise;
        if (cancelled || generation !== renderGeneration.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        canvas.width = buffer.width; canvas.height = buffer.height;
        canvas.getContext("2d")?.drawImage(buffer, 0, 0);
        setPainted({ key: loaded.key, token:loaded.token, page: pageNumber, zoom, width: viewportWidth, cssWidth: viewport.width / pixelRatio, cssHeight: viewport.height / pixelRatio });
        setFailure(previous=>previous?.key===loaded.key?null:previous);
      } catch {
        if (!cancelled && generation === renderGeneration.current)
          setFailure({ key: loaded.key, message: "แสดงหน้าตัวอย่างไม่สำเร็จ กรุณาลองใหม่" });
      }
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [loaded, requestKey, pageNumber, zoom, viewportWidth]);

  useEffect(() => {
    if (!expanded) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setExpanded(false); }
      if (e.key !== "Tab") return;
      const controls = Array.from(asideRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), [href], [tabindex="0"]') || []).filter(el => el.offsetParent !== null);
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); document.body.style.overflow = originalOverflow; restoreFocus.current?.focus(); };
  }, [expanded]);

  function focusWarning(warning: Warning) {
    const form = data.forms.find(f => f.template.code === warning.formCode);
    const element = document.getElementById(`${form?.template.id}-${warning.fieldId}`) || document.getElementById(`wp-field-${warning.fieldId}`) || data.forms.map(f=>document.getElementById(`${f.template.id}-${warning.fieldId}`)).find(Boolean);
    setPageNumber(Math.min(Math.max(1, warning.page), pageCount || 1));
    if (element) {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      setExpanded(false);
      requestAnimationFrame(() => { element.focus({ preventScroll: true }); element.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); });
    }
  }

  const launcher = <button type="button" className="wp-preview-mobile-launch wp-primary" onClick={() => setExpanded(true)} aria-haspopup="dialog">ดูตัวอย่างแม่แบบจริง</button>;
  return <>
    {launcherHost ? createPortal(launcher, launcherHost) : launcher}
    {expanded && <div className="wp-preview-backdrop" aria-hidden="true" onClick={() => setExpanded(false)} />}
    <aside ref={asideRef} className={`wp-live-preview wp-no-print${expanded ? " is-expanded" : ""}`} role={expanded ? "dialog" : "complementary"} aria-modal={expanded ? true : undefined} aria-label="ตัวอย่างแม่แบบจริง" data-testid="permit-live-preview" data-preview-state={current ? "current" : error ? "error" : enabled ? "updating" : "empty"}>
      <div className="wp-preview-heading"><div><h3>ตัวอย่างแม่แบบจริง</h3><p>อัปเดตเมื่อหยุดพิมพ์ครู่หนึ่ง</p></div>
        {expanded ? <button type="button" ref={closeRef} className="wp-secondary" onClick={() => setExpanded(false)}>ปิดตัวอย่าง</button> : <button type="button" className="wp-secondary" onClick={() => setExpanded(true)}>ขยายตัวอย่าง</button>}
      </div>
      <p className={`wp-preview-status${current ? " is-current" : ""}`} role="status" aria-live="polite" data-testid="permit-preview-status">{status}</p>
      {error && <div className="wp-error" role="alert">{error}<button type="button" className="wp-link" onClick={() => setRetry(v => v + 1)}>ลองสร้างตัวอย่างอีกครั้ง</button></div>}
      <div className="wp-preview-toolbar">
        <button type="button" className="wp-secondary" aria-label="หน้าตัวอย่างก่อนหน้า" disabled={!pageCount || pageNumber <= 1} onClick={() => setPageNumber(v => v - 1)}>←</button>
        <label>หน้า<select aria-label="เลือกหน้าตัวอย่าง" value={pageCount ? pageNumber : ""} disabled={!pageCount} onChange={e => setPageNumber(Number(e.target.value))}>{pageCount ? Array.from({ length: pageCount }, (_, n) => <option key={n} value={n + 1}>{n + 1} / {pageCount} · {originalPageLabels[n] || "ภาคผนวก"}</option>) : <option value="">—</option>}</select></label>
        <button type="button" className="wp-secondary" aria-label="หน้าตัวอย่างถัดไป" disabled={!pageCount || pageNumber >= pageCount} onClick={() => setPageNumber(v => v + 1)}>→</button>
        <label>ขนาด<select aria-label="ขยายตัวอย่าง" value={zoom} onChange={e => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value) as Zoom)}><option value="fit">พอดีความกว้าง</option><option value={100}>100%</option><option value={150}>150%</option><option value={200}>200%</option></select></label>
      </div>
      <div className="wp-preview-viewport" ref={viewportRef} aria-busy={enabled && !current && !error}>
        {!enabled && <div className="wp-preview-empty">{status}<p>ตัวอย่างจะใช้แม่แบบ PDF เดียวกับที่พิมพ์</p></div>}
        {enabled && <div className="wp-preview-paper" data-stale={!current ? "true" : "false"}>
          <canvas ref={canvasRef} aria-label={`ตัวอย่าง PDF หน้า ${pageNumber}`} data-testid="permit-preview-canvas" data-preview-canvas-state={current ? "current" : "stale"} data-preview-page={pageNumber} data-request-key={painted?.token||''} style={{ width: painted?.cssWidth || "100%", height: painted?.cssHeight || "auto" }} />
          {!current && painted && <div className="wp-preview-stale-note">ภาพก่อนหน้า · กำลังอัปเดต</div>}
        </div>}
        {enabled && !painted && !error && <div className="wp-preview-empty">กำลังเตรียมแม่แบบจริง…</div>}
      </div>
      {!!currentWarnings.length && <div className="wp-preview-warnings" aria-label="ข้อความที่อยู่ในภาคผนวก"><strong>ข้อความส่วนนี้จะอยู่ในภาคผนวก</strong><ul>{currentWarnings.map((warning, i) => <li key={`${warning.formCode}-${warning.fieldId}-${i}`}><button type="button" onClick={() => focusWarning(warning)}>{warning.formCode} · {warning.label} → {warning.annex}</button></li>)}</ul></div>}
      <p className="wp-preview-footnote">ตัวอย่างขณะกรอก ยังไม่ได้บันทึกหรือส่งคำขอ · ข้อความเต็มที่ยาวเกินช่องจะเก็บในภาคผนวก</p>
    </aside>
  </>;
}
