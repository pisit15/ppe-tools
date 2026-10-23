'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { normalizeSync } from '@/lib/procurement/normalize';
import { importPlan, importTables, type FinalizeBody } from '@/lib/procurement/payload';
import { type ProcRows, type ProcTable, type RawPoLine, type RawQuotes, type RawSync } from '@/lib/procurement/types';
import { Card, FetchError, VIZ, getJson, int } from '../_components/ui';

const LABEL: Record<ProcTable, string> = {
  proc_pr: 'PR', proc_pr_lines: 'รายการใน PR', proc_po_lines: 'รายการใน PO', proc_quotes: 'ใบเสนอราคา', proc_quote_items: 'รายการในใบเสนอราคา',
};
const FILES = [
  { id: 'sync', label: 'ข้อมูล PR จาก Odoo', hint: 'odoosync_data.json หรือ _scripts\\last_odoosync_data.json', required: true },
  { id: 'po', label: 'บรรทัด PO', hint: 'odoosync_polines.json หรือ _scripts\\last_po_lines.json', required: true },
  { id: 'quotes', label: 'ใบเสนอราคาที่อ่านจาก PDF', hint: '_scripts\\quotes_extracted.json (ไม่เลือก = คงข้อมูลใบเสนอราคาเดิม)', required: false },
] as const;
type FileId = (typeof FILES)[number]['id'];
const post = <T,>(body: object) => getJson<T>('/api/procurement/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function ImportPage() {
  const { user } = useAuth();
  const [files, setFiles] = useState<Partial<Record<FileId, File>>>({});
  const [rows, setRows] = useState<ProcRows | null>(null);
  const [hasQuotes, setHasQuotes] = useState(false);
  const [parseError, setParseError] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  // Finalize refused because the new snapshot removes >10% of a table: the admin can confirm after checking the files.
  const [shrink, setShrink] = useState<{ msg: string; body: FinalizeBody } | null>(null);
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

  const tables = importTables(hasQuotes);
  const finish = async (body: FinalizeBody, prCount: number) => {
    const res = await post<{ deleted: Record<string, number> }>(body);
    const removed = Object.values(res.deleted).reduce((a, b) => a + b, 0);
    setProgress(null);
    setShrink(null);
    setToast({ type: 'success', msg: `นำเข้าสำเร็จ ${int(prCount)} PR${removed ? ` · ลบแถวเก่า ${int(removed)} แถว` : ''} (หน้าอื่นอาจใช้เวลาไม่เกิน 5 นาทีจึงเห็นข้อมูลใหม่)` });
  };
  const fail = (e: unknown) => {
    setProgress(null);
    setToast({ type: 'error', msg: `นำเข้าไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'} — ลองใหม่ได้ ข้อมูลเดิมยังอยู่` });
  };
  const run = async () => {
    if (!rows) return;
    const { upserts, finalize } = importPlan(rows, hasQuotes, `import: ${Object.values(files).map(f => f?.name).filter(Boolean).join(', ')}`);
    try {
      for (let i = 0; i < upserts.length; i++) {
        setProgress({ done: i, total: upserts.length + 1, label: `กำลังส่ง ${LABEL[upserts[i].table]}` });
        await post(upserts[i]);
      }
      setProgress({ done: upserts.length, total: upserts.length + 1, label: 'กำลังลบข้อมูลที่ไม่อยู่ในชุดใหม่' });
      try {
        await finish(finalize, rows.proc_pr.length);
      } catch (e) {
        if (e instanceof FetchError && e.status === 409) { setProgress(null); setShrink({ msg: e.message, body: finalize }); return; }
        throw e;
      }
    } catch (e) { fail(e); }
  };
  const confirmShrink = async () => {
    if (!shrink || !rows) return;
    setProgress({ done: 0, total: 1, label: 'กำลังลบข้อมูลที่ไม่อยู่ในชุดใหม่' });
    try { await finish({ ...shrink.body, allow_shrink: true }, rows.proc_pr.length); } catch (e) { fail(e); }
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
          {shrink && (
            <div role="alert" className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: VIZ.secondary, background: '#FFF7EE' }}>
              <p>{shrink.msg}</p>
              <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>ข้อมูลใหม่ถูกเพิ่ม/อัปเดตแล้ว แต่ยังไม่ได้ลบแถวเก่า — ตรวจว่าไฟล์ครบทุกคนใน team.json ก่อน ถ้าตั้งใจลบ (เช่น เอาคนออกจากทีม) กดยืนยัน</p>
              <button onClick={confirmShrink} disabled={!!progress} className="mt-2 rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ background: VIZ.secondary }}>ยืนยัน ลบแถวที่ไม่อยู่ในชุดใหม่</button>
            </div>
          )}
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
