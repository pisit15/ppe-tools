'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, FileDown, LoaderCircle, Ruler } from 'lucide-react';
import type { ChemSubstance } from '@/lib/types';
import { useChemicalData } from '@/lib/chemical/useChemicalData';
import { GHS_PICTOGRAMS, SIGNAL_WORDS } from '@/lib/chemical/ghs';
import { labelLayout, labelProblems, type LabelDraft, type LabelOptions } from '@/lib/chemical/label';
import type { LabelHistory } from '@/lib/chemical/label-versions';
import { useLabelVersions } from '@/lib/chemical/useLabelVersions';
import { LabelVersionControls } from '../../components/LabelVersionControls';
import { downloadChemicalLabel, renderChemicalLabel, type RenderedLabel } from '@/lib/chemical/label-pdf';
import { inputCls, labelCls } from '../../components/ui';
import { LabelFormatPicker, LabelSheetPreview } from '../../components/LabelFormatPicker';

export default function ChemicalLabelPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useChemicalData<{ data: ChemSubstance }>(`/api/chemical/substances/${id}`);
  const [retry, setRetry] = useState(0);
  const history = useChemicalData<LabelHistory>(`/api/chemical/substances/${id}/labels`, retry);
  if (loading || history.loading) return <p role="status">กำลังโหลดข้อมูลสารเคมีและฉลากที่บันทึกไว้…</p>;
  if (error || !data?.data) return <div role="alert" className="p-6 text-red-700">{error || 'ไม่พบสารเคมี'} <Link href="/chemical" className="underline">กลับทะเบียน</Link></div>;
  if (history.error || !history.data) return <div role="alert" className="p-6 text-red-700">โหลดประวัติฉลากไม่สำเร็จ: {history.error}<button onClick={() => setRetry(n => n + 1)} className="underline ml-2">ลองโหลดประวัติอีกครั้ง</button></div>;
  return <LabelEditor key={id} substance={data.data} history={history.data} />;
}

function LabelEditor({ substance, history }: { substance: ChemSubstance; history: LabelHistory }) {
  const versionState = useLabelVersions(substance, history);
  const { draft, setDraft, options, setOptions } = versionState;
  const [result, setResult] = useState<{ draft: LabelDraft; options: LabelOptions; value?: RenderedLabel; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const current = result?.draft === draft && result?.options === options;
  const preview = current ? result.value : undefined;
  const renderError = current ? result.error : '';
  let layout: ReturnType<typeof labelLayout> | undefined;
  try { layout = labelLayout(options); } catch { /* Renderer presents the validation message. */ }
  const problems = labelProblems(draft, options);
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
    <Link href={`/chemical?company_id=${encodeURIComponent(substance.company_id)}`} onClick={e => { if (!versionState.discardOK()) e.preventDefault(); }} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-purple-700 mb-5"><ArrowLeft size={16} /> กลับทะเบียนสารเคมี</Link>
    <header className="flex items-start gap-3 mb-6">
      <div className="p-3 rounded-2xl bg-purple-100 text-purple-700"><FileDown size={28} /></div>
      <div><h1 className="text-2xl font-bold">ฉลากสารเคมี PDF</h1><p className="text-sm text-gray-600 mt-1">{substance.name} · {substance.company_id.toUpperCase()}</p></div>
    </header>
    <LabelVersionControls state={versionState} />
    <fieldset disabled={versionState.pending} className="min-w-0 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
      <div className="space-y-5">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <h2 className="font-bold flex items-center gap-2"><Ruler size={19} className="text-purple-700" /> ขนาดและจำนวนฉลาก</h2>
          <LabelFormatPicker options={options} onChange={next => { setOptions(next); setDownloaded(false); setDownloadError(''); }} />
          <div className="border-t border-gray-100 pt-3 text-sm">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={options.includeQr && !!draft.sdsUrl} disabled={!draft.sdsUrl} onChange={e => configure('includeQr', e.target.checked)} className="accent-purple-700" /> ใส่ QR Code ไปยัง SDS ฉบับจริง</label>
            {draft.sdsUrl ? <><p className="text-xs text-gray-600 mt-2">สแกนเพื่อเปิด SDS ที่แนบอยู่ล่าสุดได้โดยไม่ต้องเข้าสู่ระบบ · ลิงก์ภายนอกใช้สิทธิ์ของเจ้าของไฟล์</p><a href={draft.sdsUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-purple-700 underline mt-1">ทดสอบเปิด SDS</a></> : <p className="text-xs text-amber-800 mt-2">สารนี้ยังไม่มี SDS แนบ จึงยังสร้าง QR ไม่ได้ เพิ่มไฟล์หรือลิงก์ SDS ในทะเบียนก่อน</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
          <div><h2 className="font-bold">ข้อมูลบนฉลาก</h2><p className="text-sm text-gray-600 mt-1">แก้ไขแล้วกด “บันทึกเป็นเวอร์ชันใหม่” เพื่อเรียกใช้ครั้งหน้า ข้อมูลในทะเบียนยังคงเดิม</p></div>
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
          {field('precautions', `ข้อควรระวัง (P)${options.content === 'compact' ? ' — ไม่พิมพ์ในฉลากย่อ' : ''}`, 7)}
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
          <LabelSheetPreview options={options} />
          {overflow && <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <p>ข้อความเกินความสูงที่เลือก ต้องใช้ความสูงอย่างน้อย {preview?.requiredHeight} มม. ตัวอย่างแสดงข้อความทั้งหมด ยังดาวน์โหลดขนาดนี้ไม่ได้</p>
            {preview && preview.requiredHeight <= 277 ? <button onClick={() => configure('height', preview.requiredHeight)} className="font-semibold underline mt-2">ปรับความสูงให้พอดี</button> : <p className="mt-2">เพิ่มความกว้างของฉลาก หรือเลือกข้อความสำหรับฉลากจาก SDS</p>}
            {options.content === 'full' && <button onClick={() => setOptions(o => ({ ...o, content: 'compact', fontSize: 8 }))} className="block font-semibold underline mt-2">ใช้ฉลากย่อสำหรับภาชนะเล็ก (8 pt)</button>}
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
    </fieldset>
  </div>;
}
