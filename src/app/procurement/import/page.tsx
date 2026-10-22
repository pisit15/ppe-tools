'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { normalizeSync } from '@/lib/procurement/normalize';
import { PROC_KEY, PROC_TABLES, type ProcRows, type ProcTable, type RawPoLine, type RawQuotes, type RawSync } from '@/lib/procurement/types';
import { Card, VIZ, getJson, int } from '../_components/ui';

const LABEL: Record<ProcTable, string> = {
  proc_pr: 'PR', proc_pr_lines: 'รายการใน PR', proc_po_lines: 'รายการใน PO', proc_quotes: 'ใบเสนอราคา', proc_quote_items: 'รายการในใบเสนอราคา',
};
const FILES = [
  { id: 'sync', label: 'ข้อมูล PR จาก Odoo', hint: 'odoosync_data.json หรือ _scripts\\last_odoosync_data.json', required: true },
  { id: 'po', label: 'บรรทัด PO', hint: 'odoosync_polines.json หรือ _scripts\\last_po_lines.json', required: true },
  { id: 'quotes', label: 'ใบเสนอราคาที่อ่านจาก PDF', hint: '_scripts\\quotes_extracted.json (ไม่เลือก = คงข้อมูลใบเสนอราคาเดิม)', required: false },
] as const;
type FileId = (typeof FILES)[number]['id'];
const MAX_BATCH_ROWS = 1000;
const MAX_BATCH_CHARS = 2_000_000;

function batches<T>(rows: T[]) {
  const out: T[][] = [];
  let cur: T[] = [], size = 0;
  for (const r of rows) {
    const len = JSON.stringify(r).length;
    if (cur.length && (cur.length >= MAX_BATCH_ROWS || size + len > MAX_BATCH_CHARS)) { out.push(cur); cur = []; size = 0; }
    cur.push(r); size += len;
  }
  if (cur.length) out.push(cur);
  return out;
}

export default function ImportPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<Partial<Record<FileId, File>>>({});
  const [rows, setRows] = useState<ProcRows | null>(null);
  const [hasQuotes, setHasQuotes] = useState(false);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); } }, [toast]);

  useEffect(() => {
    if (!files.sync || !files.po) return;
    let cancelled = false;
    (async () => {
      try {
        const sync = JSON.parse(await files.sync!.text()) as RawSync;
        const po = JSON.parse(await files.po!.text()) as RawPoLine[];
        const quotes = files.quotes ? (JSON.parse(await files.quotes.text()) as RawQuotes) : null;
        if (!sync || typeof sync !== 'object' || !Object.values(sync).every(v => Array.isArray(v?.prs))) throw new Error('ไฟล์ข้อมูล PR ไม่ใช่รูปแบบของ pull.js');
        if (!Array.isArray(po)) throw new Error('ไฟล์บรรทัด PO ต้องเป็นรายการ (array)');
        if (quotes && (!Array.isArray(quotes.quotes) || !Array.isArray(quotes.items))) throw new Error('ไฟล์ใบเสนอราคาไม่มี quotes/items');
        const normalized = normalizeSync(sync, po, quotes);
        if (!cancelled) { setRows(normalized); setHasQuotes(!!quotes); setParseError(''); }
      } catch (e) {
        if (!cancelled) { setRows(null); setParseError(e instanceof Error ? e.message : 'อ่านไฟล์ไม่สำเร็จ'); }
      }
    })();
    return () => { cancelled = true; };
  }, [files]);

  if (user?.role !== 'admin') return <Card><p className="text-sm">เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้</p></Card>;

  const tables = PROC_TABLES.filter(t => hasQuotes || (t !== 'proc_quotes' && t !== 'proc_quote_items'));
  const run = async () => {
    if (!rows) return;
    const plan = tables.flatMap(t => batches(rows[t] as object[]).map(b => ({ table: t, rows: b })));
    try {
      for (let i = 0; i < plan.length; i++) {
        setProgress({ done: i, total: plan.length + 1, label: `กำลังส่ง ${LABEL[plan[i].table]}` });
        await getJson('/api/procurement/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upsert', ...plan[i] }) });
      }
      setProgress({ done: plan.length, total: plan.length + 1, label: 'กำลังลบข้อมูลที่ไม่อยู่ในชุดใหม่' });
      const keys = Object.fromEntries(tables.map(t => [t, (rows[t] as unknown as Record<string, unknown>[]).map(r => Number(r[PROC_KEY[t]]))]));
      const res = await getJson<{ deleted: Record<string, number> }>('/api/procurement/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize', keys, source: `import: ${Object.values(files).map(f => f?.name).filter(Boolean).join(', ')}` }),
      });
      const removed = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      setProgress(null);
      setToast({ type: 'success', msg: `นำเข้าสำเร็จ ${int(rows.proc_pr.length)} PR${removed ? ` · ลบแถวเก่า ${int(removed)} แถว` : ''} (หน้าอื่นอาจใช้เวลาไม่เกิน 5 นาทีจึงเห็นข้อมูลใหม่)` });
    } catch (e) {
      setProgress(null);
      setToast({ type: 'error', msg: `นำเข้าไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'} — ลองใหม่ได้ ข้อมูลเดิมยังอยู่` });
    }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-xl font-bold">นำเข้าข้อมูลจาก Odoo sync</h2>
        <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>เลือกไฟล์จากโฟลเดอร์ D:\Odoo PR\_scripts (หรือ Downloads หลังรัน pull.js) ระบบจะแทนที่ข้อมูลทั้งชุดด้วยไฟล์ล่าสุด</p>
      </div>
      <Card className="space-y-4">
        {FILES.map(f => (
          <label key={f.id} className="block text-sm">
            <span className="font-medium">{f.label}{f.required && <span style={{ color: VIZ.accent }}> *</span>}</span>
            <span className="block text-xs" style={{ color: VIZ.lightText }}>{f.hint}</span>
            <input type="file" accept=".json,application/json" className="mt-1 block w-full text-sm"
              onChange={e => { const file = e.target.files?.[0]; setFiles(prev => ({ ...prev, [f.id]: file })); }} />
          </label>
        ))}
        {parseError && <p role="alert" className="text-sm" style={{ color: VIZ.accent }}>{parseError}</p>}
      </Card>
      {rows && (
        <Card>
          <h3 className="font-semibold">ตรวจก่อนนำเข้า</h3>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-sm">
            {tables.map(t => <li key={t}>{LABEL[t]}: <b className="tabular-nums">{int(rows[t].length)}</b> แถว</li>)}
          </ul>
          {!hasQuotes && <p className="mt-2 text-xs" style={{ color: VIZ.lightText }}>ไม่ได้เลือกไฟล์ใบเสนอราคา — ข้อมูลใบเสนอราคาเดิมจะไม่ถูกแตะ</p>}
          <button onClick={run} disabled={!!progress} className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: VIZ.primary }}>
            {progress ? 'กำลังนำเข้า…' : 'นำเข้าข้อมูล'}
          </button>
          {progress && (
            <div className="mt-3" role="status">
              <div className="h-2 w-full rounded-full" style={{ background: VIZ.bg }}><div className="h-2 rounded-full" style={{ width: `${(progress.done / progress.total) * 100}%`, background: VIZ.primary }} /></div>
              <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>{progress.label} ({progress.done}/{progress.total})</p>
            </div>
          )}
        </Card>
      )}
      {toast && (
        <div role="status" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg" style={{ background: toast.type === 'success' ? VIZ.positive : VIZ.accent }}>{toast.msg}</div>
      )}
    </div>
  );
}
