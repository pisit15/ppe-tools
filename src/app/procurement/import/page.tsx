'use client';
export const dynamic = 'force-dynamic';

import { useRef, useState } from 'react';
import { Check, FileUp, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { previewImport } from '@/lib/procurement/import-preview';
import { importPlan, importTables, type FinalizeBody } from '@/lib/procurement/payload';
import { type ProcMeta, type ProcRows, type ProcTable } from '@/lib/procurement/types';
import { Card, FetchError, VIZ, getJson, int, thaiDate } from '../_components/ui';

const LABEL: Record<ProcTable, string> = {
  proc_pr: 'PR', proc_pr_lines: 'รายการใน PR', proc_po_lines: 'รายการใน PO', proc_quotes: 'ใบเสนอราคา', proc_quote_items: 'รายการในใบเสนอราคา',
};
const FILES = [
  { id: 'sync', label: 'ข้อมูล PR จาก Odoo', hint: 'odoosync_data.json หรือ _scripts\\last_odoosync_data.json', required: true },
  { id: 'po', label: 'รายการตาม PO', hint: 'odoosync_polines.json หรือ _scripts\\last_po_lines.json', required: true },
  { id: 'quotes', label: 'ใบเสนอราคาที่อ่านจาก PDF', hint: '_scripts\\quotes_extracted.json', required: false },
] as const;
type FileId = (typeof FILES)[number]['id'];
const post = <T,>(body: object) => getJson<T>('/api/procurement/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function ImportPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<Partial<Record<FileId, File>>>({});
  const [rows, setRows] = useState<ProcRows | null>(null);
  const [hasQuotes, setHasQuotes] = useState(false);
  const [meta, setMeta] = useState<ProcMeta | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [shrink, setShrink] = useState<{ msg: string; body: FinalizeBody } | null>(null);
  const inFlight = useRef(false);
  const quoteInput = useRef<HTMLInputElement>(null);
  const busy = checking || !!progress;
  const tables = importTables(hasQuotes);

  if (user?.role !== 'admin') return <Card><p className="text-sm">เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้</p></Card>;

  const selectFile = (id: FileId, file: File | undefined) => {
    if (inFlight.current) return;
    setFiles(previous => ({ ...previous, [id]: file }));
    setRows(null); setMeta(null); setConfirmed(false); setCompleted(false); setParseError(''); setShrink(null); setResult(null);
  };
  const removeQuoteFile = () => {
    if (inFlight.current) return;
    if (quoteInput.current) quoteInput.current.value = '';
    selectFile('quotes', undefined);
  };
  const validate = async () => {
    if (!files.sync || !files.po || inFlight.current) return;
    inFlight.current = true;
    setChecking(true); setRows(null); setParseError(''); setConfirmed(false); setResult(null);
    try {
      const [sync, po, quotes, snapshot] = await Promise.all([
        files.sync.text(), files.po.text(), files.quotes ? files.quotes.text() : Promise.resolve(null),
        getJson<{ meta: ProcMeta }>('/api/procurement/summary').catch(() => null),
      ]);
      const preview = previewImport(sync, po, quotes);
      setRows(preview.rows); setHasQuotes(preview.hasQuotes); setMeta(snapshot?.meta ?? null);
    } catch (error) {
      setParseError(error instanceof SyntaxError ? 'อ่าน JSON ไม่สำเร็จ กรุณาตรวจว่าเลือกไฟล์ส่งออกที่ถูกต้อง' : error instanceof Error ? error.message : 'อ่านไฟล์ไม่สำเร็จ');
    } finally { setChecking(false); inFlight.current = false; }
  };
  const finish = async (body: FinalizeBody, prCount: number) => {
    const res = await post<{ deleted: Record<string, number> }>(body);
    const removed = Object.values(res.deleted).reduce((a, b) => a + b, 0);
    setShrink(null); setCompleted(true); setConfirmed(false);
    setResult({ type: 'success', msg: `นำเข้าสำเร็จ ${int(prCount)} PR${removed ? ` · ลบรายการเก่าที่ไม่มีในชุดใหม่ ${int(removed)} แถว` : ''} · หน้าอื่นอาจใช้เวลาไม่เกิน 5 นาทีจึงเห็นข้อมูลใหม่` });
  };
  const fail = (error: unknown) => {
    setResult({ type: 'error', msg: `นำเข้าไม่สำเร็จ: ${error instanceof Error ? error.message : 'ไม่ทราบสาเหตุ'} · บางรายการอาจเพิ่มหรืออัปเดตแล้ว ตรวจสอบสาเหตุและลองใหม่ด้วยชุดไฟล์เดิมเพื่อให้ครบทุกขั้นตอน` });
  };
  const run = async () => {
    if (!rows || !confirmed || completed || shrink || inFlight.current) return;
    inFlight.current = true; setResult(null);
    try {
      const { upserts, finalize } = importPlan(rows, hasQuotes, `import: ${Object.values(files).map(f => f?.name).filter(Boolean).join(', ')}`);
      for (let i = 0; i < upserts.length; i++) {
        setProgress({ done: i, total: upserts.length + 1, label: `กำลังส่ง ${LABEL[upserts[i].table]}` });
        await post(upserts[i]);
      }
      setProgress({ done: upserts.length, total: upserts.length + 1, label: 'กำลังตรวจและลบรายการที่ไม่มีในชุดใหม่' });
      try { await finish(finalize, rows.proc_pr.length); }
      catch (error) {
        if (error instanceof FetchError && error.status === 409) { setShrink({ msg: error.message, body: finalize }); return; }
        throw error;
      }
    } catch (error) { fail(error); }
    finally { setProgress(null); inFlight.current = false; }
  };
  const confirmShrink = async () => {
    if (!shrink || !rows || inFlight.current) return;
    inFlight.current = true; setResult(null);
    setProgress({ done: 0, total: 1, label: 'กำลังลบรายการที่ไม่มีในชุดใหม่' });
    try { await finish({ ...shrink.body, allow_shrink: true }, rows.proc_pr.length); }
    catch (error) { fail(error); }
    finally { setProgress(null); inFlight.current = false; }
  };
  const step = rows ? (confirmed || completed || !!shrink ? 3 : 2) : 1;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: VIZ.primary }}><ShieldCheck size={14} />พื้นที่ผู้ดูแลระบบ</p>
        <h2 className="text-2xl font-semibold tracking-tight">นำเข้าข้อมูลจัดซื้อ</h2>
        <p className="mt-2 text-sm" style={{ color: VIZ.lightText }}>ตรวจความครบถ้วนของไฟล์และจำนวนรายการก่อนยืนยันแทนที่ข้อมูล</p>
      </div>
      <ol aria-label="ขั้นตอนนำเข้าข้อมูล" className="grid grid-cols-3 gap-3 text-sm">
        {['เลือกไฟล์', 'ตรวจสอบข้อมูล', 'ยืนยันนำเข้า'].map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className="flex items-center gap-2 border-b-2 pb-3" style={{ borderColor: step >= i + 1 ? VIZ.primary : VIZ.muted, color: step >= i + 1 ? VIZ.primary : VIZ.lightText }}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs" style={{ background: step > i + 1 ? VIZ.primary : VIZ.bg, color: step > i + 1 ? 'white' : undefined }}>{step > i + 1 ? <Check size={14} /> : i + 1}</span>{label}
          </li>
        ))}
      </ol>
      <Card className="space-y-5">
        <h3 className="font-semibold">1. เลือกชุดข้อมูลล่าสุด</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {FILES.map(file => (
            <div key={file.id} className="block rounded-lg border border-slate-200 p-4 text-sm">
              <label htmlFor={`import-file-${file.id}`}>
                <span className="flex items-center gap-2 font-medium"><FileUp size={16} style={{ color: VIZ.lightText }} />{file.label}</span>
                <span className="mt-1 block text-xs" style={{ color: VIZ.lightText }}>{file.required ? 'จำเป็น · ไฟล์ JSON' : 'ไม่บังคับ · หากไม่เลือกจะคงใบเสนอราคาเดิม'}</span>
              </label>
              <input id={`import-file-${file.id}`} ref={file.id === 'quotes' ? quoteInput : undefined} type="file" accept=".json,application/json" disabled={busy} className="mt-3 block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs disabled:opacity-50"
                onChange={event => selectFile(file.id, event.target.files?.[0])} />
              {file.id === 'quotes' && files.quotes && <button type="button" onClick={removeQuoteFile} disabled={busy} className="mt-3 text-xs font-medium underline underline-offset-4 disabled:opacity-40" style={{ color: VIZ.primary }}>นำไฟล์ใบเสนอราคาออก · คงข้อมูลเดิม</button>}
            </div>
          ))}
        </div>
        <details className="text-xs" style={{ color: VIZ.lightText }}><summary className="cursor-pointer">ชื่อไฟล์และแหล่งข้อมูลที่รองรับ</summary><ul className="mt-2 space-y-1">{FILES.map(file => <li key={file.id}>{file.label}: <code>{file.hint}</code></li>)}</ul></details>
        {parseError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm" style={{ color: VIZ.accent }}>{parseError}</p>}
        <button type="button" onClick={validate} disabled={!files.sync || !files.po || busy || !!shrink || completed} className="rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40" style={{ background: VIZ.primary }}>{checking ? 'กำลังตรวจสอบ…' : 'ตรวจสอบไฟล์'}</button>
        {!rows && <p className="text-xs" style={{ color: VIZ.lightText }}>ขั้นตอนตรวจสอบอ่านไฟล์และจำนวนข้อมูลเดิมเท่านั้น ยังไม่บันทึกข้อมูล</p>}
      </Card>
      {rows && <>
        <Card>
          <h3 className="font-semibold">2. ตรวจจำนวนรายการ</h3>
          <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>{meta?.imported_at ? `เปรียบเทียบกับการนำเข้าสำเร็จล่าสุด ${thaiDate(meta.imported_at)}` : 'ไม่พบจำนวนจากการนำเข้าครั้งก่อน'} · ผลต่างเป็นจำนวนสุทธิ ยังไม่ใช่จำนวนเพิ่ม / แก้ไข / ลบจริง</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-slate-200 text-xs" style={{ color: VIZ.lightText }}><th scope="col" className="py-3 text-left">ประเภทข้อมูล</th><th scope="col" className="px-3 py-3 text-right">ครั้งก่อน</th><th scope="col" className="px-3 py-3 text-right">ไฟล์ใหม่</th><th scope="col" className="py-3 text-right">ผลต่าง</th></tr></thead>
              <tbody>{tables.map(table => {
                const old = meta?.counts[table]; const count = rows[table].length; const delta = old === undefined ? null : count - old;
                return <tr key={table} className="border-b border-slate-100"><th scope="row" className="py-3 text-left font-medium">{LABEL[table]}</th><td className="px-3 py-3 text-right tabular-nums">{old === undefined ? 'ไม่ทราบ' : int(old)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{int(count)}</td><td className="py-3 text-right tabular-nums" style={{ color: delta !== null && delta < 0 ? VIZ.accent : VIZ.lightText }}>{delta === null ? '–' : `${delta > 0 ? '+' : ''}${int(delta)}`}</td></tr>;
              })}</tbody>
            </table>
          </div>
          {!hasQuotes && <p className="mt-3 text-xs" style={{ color: VIZ.lightText }}>คงใบเสนอราคาและรายการในใบเสนอราคาเดิมทั้งหมด</p>}
        </Card>
        <Card className="space-y-4">
          <h3 className="font-semibold">3. ยืนยันแทนที่ข้อมูล</h3>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">ระบบจะเพิ่มหรืออัปเดตรายการ และลบรายการเดิมที่ไม่มีในชุดไฟล์ใหม่นี้สำหรับประเภทข้อมูลที่เลือก ไฟล์ต้องครอบคลุมข้อมูลทุกคนและทุกช่วงเวลาที่ต้องการเก็บ</p>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || completed || !!shrink} onChange={event => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4" /><span>ฉันตรวจไฟล์และจำนวนรายการแล้ว และยืนยันให้ใช้ชุดข้อมูลนี้แทนข้อมูลเดิม</span></label>
          <button type="button" onClick={run} disabled={!confirmed || busy || completed || !!shrink} className="rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40" style={{ background: VIZ.primary }}>{completed ? 'นำเข้าสำเร็จแล้ว' : progress ? 'กำลังนำเข้า…' : 'ยืนยันนำเข้าข้อมูล'}</button>
          {shrink && <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">{shrink.msg}</p>
            <p>ข้อมูลใหม่เพิ่มหรืออัปเดตแล้ว แต่ยังไม่ได้ลบรายการเก่า ตรวจว่าไฟล์ครอบคลุมทีมครบก่อนยืนยันลบรายการที่ไม่มีในชุดใหม่</p>
            <button type="button" onClick={confirmShrink} disabled={busy} className="rounded-lg bg-amber-800 px-3 py-2 font-medium text-white disabled:opacity-40">ยืนยันลบรายการตามชุดข้อมูลใหม่</button>
          </div>}
          {progress && <div role="status"><progress max={progress.total} value={progress.done} className="w-full" /><p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>{progress.label} ({progress.done}/{progress.total}) · กรุณาเปิดหน้านี้ไว้จนกว่าจะเสร็จ</p></div>}
        </Card>
      </>}
      {result && <div role={result.type === 'error' ? 'alert' : 'status'} className={`rounded-xl border p-4 text-sm ${result.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{result.msg}</div>}
    </div>
  );
}
