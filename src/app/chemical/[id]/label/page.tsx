'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, FileDown, LoaderCircle, Ruler } from 'lucide-react';
import type { ChemSubstance } from '@/lib/types';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import { GHS_PICTOGRAMS, SIGNAL_WORDS } from '@/lib/chemical/ghs';
import { DEFAULT_LABEL_OPTIONS, labelDraft, labelLayout, labelProblems, type LabelDraft, type LabelOptions } from '@/lib/chemical/label';
import { downloadChemicalLabel, renderChemicalLabel, type RenderedLabel } from '@/lib/chemical/label-pdf';
import { inputCls, labelCls } from '../../components/ui';

export default function ChemicalLabelPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useChemicalData<{ data: ChemSubstance }>(`/api/chemical/substances/${id}`);
  if (loading) return <p role="status">กำลังโหลดข้อมูลสารเคมี…</p>;
  if (error || !data?.data) return <div role="alert" className="p-6 text-red-700">{error || 'ไม่พบสารเคมี'} <Link href="/chemical" className="underline">กลับทะเบียน</Link></div>;
  return <LabelEditor key={id} substance={data.data} />;
}

function LabelEditor({ substance }: { substance: ChemSubstance }) {
  const [draft, setDraft] = useState(() => labelDraft(substance));
  const [options, setOptions] = useState<LabelOptions>(DEFAULT_LABEL_OPTIONS);
  const [result, setResult] = useState<{ draft: LabelDraft; options: LabelOptions; value?: RenderedLabel; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const current = result?.draft === draft && result?.options === options;
  const preview = current ? result.value : undefined;
  const renderError = current ? result.error : '';
  let layout: ReturnType<typeof labelLayout> | undefined;
  try { layout = labelLayout(options); } catch { /* Renderer presents the validation message. */ }
  const problems = labelProblems(draft);
  const overflow = !!preview && preview.requiredHeight > options.height;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      renderChemicalLabel(draft, options).then(value => {
        if (!cancelled) setResult({ draft, options, value });
      }).catch(error => {
        if (!cancelled) setResult({ draft, options, error: error instanceof Error ? error.message : 'สร้างตัวอย่างไม่สำเร็จ' });
      });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [draft, options]);

  function change<K extends keyof LabelDraft>(key: K, value: LabelDraft[K]) {
    setDraft(d => ({ ...d, [key]: value })); setDownloaded(false); setDownloadError('');
  }
  function configure<K extends keyof LabelOptions>(key: K, value: LabelOptions[K]) {
    setOptions(o => ({ ...o, [key]: value })); setDownloaded(false); setDownloadError('');
  }
  async function download() {
    setBusy(true); setDownloadError(''); setDownloaded(false);
    try { await downloadChemicalLabel(draft, options); setDownloaded(true); }
    catch (error) { setDownloadError(error instanceof Error ? error.message : 'สร้าง PDF ไม่สำเร็จ'); }
    finally { setBusy(false); }
  }
  function field(key: 'name' | 'identity' | 'contents' | 'supplier' | 'emergency' | 'extra' | 'hazards' | 'precautions', label: string, rows?: number) {
    return <div>
      <label className={labelCls} htmlFor={`label-${key}`}>{label}</label>
      {rows ? <textarea id={`label-${key}`} className={inputCls} rows={rows} value={draft[key]} maxLength={8000} onChange={e => change(key, e.target.value)} />
        : <input id={`label-${key}`} className={inputCls} value={draft[key]} maxLength={500} onChange={e => change(key, e.target.value)} />}
    </div>;
  }

  return <div className="max-w-7xl mx-auto text-gray-900">
    <Link href={`/chemical?company_id=${encodeURIComponent(substance.company_id)}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-purple-700 mb-5"><ArrowLeft size={16} /> กลับทะเบียนสารเคมี</Link>
    <header className="flex items-start gap-3 mb-6">
      <div className="p-3 rounded-2xl bg-purple-100 text-purple-700"><FileDown size={28} /></div>
      <div><h1 className="text-2xl font-bold">ฉลากสารเคมี PDF</h1><p className="text-sm text-gray-600 mt-1">{substance.name} · {substance.company_id.toUpperCase()}</p></div>
    </header>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-bold flex items-center gap-2"><Ruler size={19} className="text-purple-700" /> ขนาดและจำนวนฉลาก</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="label-width" className={labelCls}>ความกว้าง (มม.)</label><input id="label-width" className={inputCls} type="number" min={50} max={190} value={options.width || ''} onChange={e => configure('width', Number(e.target.value))} /></div>
            <div><label htmlFor="label-height" className={labelCls}>ความสูง (มม.)</label><input id="label-height" className={inputCls} type="number" min={50} max={277} value={options.height || ''} onChange={e => configure('height', Number(e.target.value))} /></div>
            <div><label htmlFor="label-copies" className={labelCls}>จำนวนฉลาก (ดวง)</label><input id="label-copies" className={inputCls} type="number" min={1} max={100} value={options.copies || ''} onChange={e => configure('copies', Number(e.target.value))} /></div>
            <div><label htmlFor="label-font" className={labelCls}>ขนาดข้อความ</label><select id="label-font" className={inputCls} value={options.fontSize} onChange={e => configure('fontSize', Number(e.target.value))}>{[8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n} pt</option>)}</select></div>
          </div>
          <div><label htmlFor="label-layout" className={labelCls}>รูปแบบไฟล์ PDF</label><select id="label-layout" className={inputCls} value={options.layout} onChange={e => configure('layout', e.target.value as LabelOptions['layout'])}><option value="a4">A4 — จัดหลายดวงต่อหน้า สำหรับตัดติด</option><option value="single">หนึ่งดวงต่อหน้า — หน้ากระดาษเท่าขนาดฉลาก</option></select></div>
          <p className="text-xs text-gray-600">ค่าเริ่มต้น 90 × 120 มม. ปรับให้พอดีกับภาชนะได้ · A4 เว้นขอบ 10 มม. และช่องตัด 4 มม.</p>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <div><h2 className="font-bold">ข้อมูลบนฉลาก</h2><p className="text-sm text-gray-600 mt-1">แก้ไขสำหรับ PDF นี้เท่านั้น ข้อมูลในทะเบียนยังคงเดิม</p></div>
          {field('name', 'ชื่อสารเคมี / ผลิตภัณฑ์')}
          {field('identity', 'ชื่อทางเคมี / CAS / UN')}
          {field('contents', 'ปริมาณในภาชนะนี้ (ถ้ามี)')}
          <fieldset><legend className={labelCls}>สัญลักษณ์ GHS ตาม SDS</legend><div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {GHS_PICTOGRAMS.map(p => <label key={p.code} title={p.nameTh} className={`flex flex-col items-center gap-1 cursor-pointer rounded-xl border p-2 ${draft.pictograms.includes(p.code) ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.file} alt={p.nameTh} width={36} height={36} />
              <span className="text-xs">{p.code}</span><input type="checkbox" aria-label={`${p.code} ${p.nameTh}`} checked={draft.pictograms.includes(p.code)} onChange={e => change('pictograms', e.target.checked ? [...draft.pictograms, p.code] : draft.pictograms.filter(c => c !== p.code))} className="accent-purple-700" />
            </label>)}
          </div></fieldset>
          <div><label htmlFor="label-signal" className={labelCls}>คำสัญญาณ</label><select id="label-signal" className={inputCls} value={draft.signal} onChange={e => change('signal', e.target.value as LabelDraft['signal'])}><option value="">ยังไม่ระบุ</option>{SIGNAL_WORDS.map(s => <option value={s.value} key={s.value}>{s.labelTh}</option>)}</select></div>
          <p className="text-xs text-gray-600">ข้อความ H/P ที่เติมให้อัตโนมัติเป็นคำแปลย่อในระบบ สามารถแทนที่ด้วยข้อความบนฉลากจาก SDS ของผลิตภัณฑ์ได้โดยตรง</p>
          {field('hazards', 'ข้อความแสดงความเป็นอันตราย (H)', 5)}
          {field('precautions', 'ข้อควรระวัง (P)', 7)}
          {!draft.hazards.trim() && <p className="text-sm text-amber-800">ยังไม่มีข้อความแสดงความเป็นอันตราย กรุณาระบุตาม SDS หากมี</p>}
          {field('supplier', 'ผู้จำหน่าย / ผู้ผลิต')}
          {field('emergency', 'เบอร์ติดต่อฉุกเฉิน')}
          {field('extra', 'ข้อมูลเพิ่มเติม เช่น ผู้แบ่งบรรจุ / วันที่แบ่งบรรจุ', 2)}
        </section>
      </div>
      <section className="lg:sticky lg:top-4 rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <div className="flex justify-between gap-3 items-center"><h2 className="font-bold">ตัวอย่างฉลาก</h2><span className="text-xs text-gray-600">{options.width} × {options.height} มม.</span></div>
          <p className="text-xs text-gray-500 mt-1">ตัวอย่างย่อบนหน้าจอ · PDF คมชัด 300 DPI</p>
        </div>
        <div className="bg-slate-100 p-4 sm:p-6 max-h-[60vh] overflow-auto" aria-busy={!current}>
          {!current && <p role="status" className="text-sm text-gray-600 flex items-center gap-2"><LoaderCircle size={16} className="animate-spin" /> กำลังสร้างตัวอย่าง…</p>}
          {renderError && <p role="alert" className="text-red-700">{renderError}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview.image} alt={`ตัวอย่างฉลาก ${draft.name}`} data-testid="label-preview" className="block mx-auto shadow-md h-auto max-w-full" style={{ width: `${options.width}mm` }} />}
        </div>
        <div className="p-5 space-y-3">
          {overflow && <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p>ข้อความเกินความสูงที่เลือก ต้องใช้ความสูงอย่างน้อย {preview?.requiredHeight} มม. ตัวอย่างแสดงข้อความทั้งหมด ยังดาวน์โหลดขนาดนี้ไม่ได้</p>
            {preview && preview.requiredHeight <= 277 ? <button onClick={() => configure('height', preview.requiredHeight)} className="font-semibold underline mt-2">ปรับความสูงให้พอดี</button> : <p className="mt-2">เพิ่มความกว้างของฉลาก หรือเลือกข้อความสำหรับฉลากจาก SDS</p>}
          </div>}
          {problems.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{problems.map(p => <li key={p}>{p}</li>)}</ul>}
          {layout && <p className="text-sm text-gray-700">{options.copies} ดวง · {layout.perPage} ดวงต่อหน้า · PDF {layout.pages} หน้า</p>}
          <button disabled={busy || !preview || overflow || problems.length > 0} onClick={download} className="w-full inline-flex justify-center items-center gap-2 rounded-xl px-5 py-3 bg-purple-700 hover:bg-purple-800 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed">{busy ? <LoaderCircle size={19} className="animate-spin" /> : <Download size={19} />}{busy ? 'กำลังสร้าง PDF…' : 'ดาวน์โหลด PDF'}</button>
          {downloadError && <p role="alert" className="text-sm text-red-700">{downloadError}</p>}
          {downloaded && <p role="status" className="text-sm text-green-700">สร้างไฟล์ PDF แล้ว เปิดไฟล์เพื่อนำไปพิมพ์ได้เลย</p>}
          <p className="text-xs text-gray-600">เมื่อพิมพ์ เลือกขนาดจริง / Actual size 100% และพิมพ์สีเพื่อคงกรอบสีแดงของ GHS</p>
          {preview && <details className="text-xs text-gray-600"><summary className="cursor-pointer">อ่านข้อความบนฉลาก</summary><p className="whitespace-pre-wrap mt-2">{preview.lines.join('\n')}</p></details>}
        </div>
      </section>
    </div>
  </div>;
}
