'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { LogIn, LogOut, RotateCcw, Phone, MapPin, ShieldAlert, Maximize2 } from 'lucide-react';
import type { BoardPayload, BoardRequest } from '@/lib/visitor/types';
import { FetchError, ToastView, bangkokTime, hhmm, postJson, getJson, thaiDate, useToast } from '../../../_components/ui';

// Dark palette for a monitor at the guard post (high contrast, large type). VIZ hues kept for status.
const C = { bg: '#0F1720', panel: '#172230', line: '#263445', text: '#F3F6FA', dim: '#9AA8B8', primary: '#6FA3D8', positive: '#7CC576', warn: '#F2A54A', danger: '#E8706E' };
type Tab = 'yesterday' | 'today' | 'tomorrow';

export default function BoardPage() {
  const { company } = useParams<{ company: string }>();
  const [data, setData] = useState<BoardPayload | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('today');
  const [busyId, setBusyId] = useState('');
  const { toast, setToast } = useToast();

  const load = useCallback(() => getJson<{ data: BoardPayload }>(`/api/visitor/public/board/${encodeURIComponent(company)}`)
    .then(r => { setData(r.data); setError(''); })
    .catch((e: unknown) => setError(e instanceof FetchError ? e.message : 'โหลดข้อมูลไม่สำเร็จ')), [company]);

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [load]);

  const tomorrow = useMemo(() => (data ? shift(data.today, 1) : ''), [data]);
  const yesterday = useMemo(() => (data ? shift(data.today, -1) : ''), [data]);
  // Today = today's requests + yesterday's visitors still inside (carry-over). Yesterday = read-only history.
  const list = useMemo(() => {
    if (!data) return [];
    if (tab === 'tomorrow') return data.requests.filter(r => r.arrival_date === tomorrow);
    if (tab === 'yesterday') return data.requests.filter(r => r.arrival_date === yesterday);
    return data.requests.filter(r => r.arrival_date === data.today || (r.arrival_date < data.today && r.persons.some(p => p.arrived_at && !p.left_at)));
  }, [data, tab, tomorrow, yesterday]);

  const counts = useMemo(() => {
    const persons = list.flatMap(r => r.persons);
    return {
      requests: list.length, persons: persons.length,
      inside: persons.filter(p => p.arrived_at && !p.left_at).length,
      left: persons.filter(p => p.left_at).length,
      expected: persons.filter(p => !p.arrived_at).length,
    };
  }, [list]);

  async function mark(personId: string, action: 'arrive' | 'leave' | 'undo_arrive' | 'undo_leave') {
    if (busyId) return;
    setBusyId(personId);
    try {
      await postJson(`/api/visitor/public/board/${encodeURIComponent(company)}`, { person_id: personId, action });
      await load();
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'บันทึกไม่สำเร็จ' });
    } finally { setBusyId(''); }
  }

  const bk = new Date(now.getTime() + 7 * 3600 * 1000);
  const clock = bk.toISOString().slice(11, 19);

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text, fontSize: 18 }}>
      <header className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: `1px solid ${C.line}`, background: C.panel }}>
        <div>
          <div className="text-sm tracking-wide" style={{ color: C.dim }}>{data?.company.name || company.toUpperCase()} · ป้อม รปภ</div>
          <h1 className="text-2xl font-semibold">รายชื่อบุคคลภายนอกที่อนุมัติเข้าพื้นที่</h1>
        </div>
        <div className="text-right">
          <div className="text-4xl font-mono font-semibold tabular-nums">{clock}</div>
          <div className="text-sm" style={{ color: C.dim }}>{data ? thaiDate(data.today, true) : ''} · อัปเดตอัตโนมัติทุก 30 วินาที</div>
        </div>
      </header>

      <div className="px-6 pt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
          {(['yesterday', 'today', 'tomorrow'] as Tab[]).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)} className="px-5 py-2 font-medium" style={{ background: tab === t ? C.primary : C.panel, color: tab === t ? '#0F1720' : C.text }}>
              {t === 'today' ? 'วันนี้' : t === 'tomorrow' ? `พรุ่งนี้ ${tomorrow ? thaiDate(tomorrow) : ''}` : `เมื่อวาน ${yesterday ? thaiDate(yesterday) : ''}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap ml-auto text-base">
          <Kpi label="คำขอ" value={counts.requests} color={C.primary} />
          <Kpi label="รอเข้า" value={counts.expected} color={C.warn} />
          <Kpi label="อยู่ในพื้นที่" value={counts.inside} color={C.positive} />
          <Kpi label="ออกแล้ว" value={counts.left} color={C.dim} />
        </div>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.dim }} aria-label="เต็มจอ"><Maximize2 size={18} /></button>
      </div>

      <main className="px-6 py-4 space-y-4">
        {error && <p style={{ color: C.danger }}>{error}</p>}
        {tab === 'yesterday' && <p className="text-sm" style={{ color: C.dim }}>ประวัติย้อนหลัง 1 วัน (ดูอย่างเดียว) — รายชื่อที่ยังไม่ได้กด &quot;ออก&quot; จะยังแสดงในแท็บวันนี้ด้วย</p>}
        {data && list.length === 0 && <p className="py-16 text-center text-2xl" style={{ color: C.dim }}>ไม่มีรายการที่อนุมัติสำหรับ{tab === 'today' ? 'วันนี้' : tab === 'tomorrow' ? 'พรุ่งนี้' : 'เมื่อวาน'}</p>}
        {list.map(r => <RequestCard key={r.id} r={r} today={data?.today || ''} busyId={busyId} onMark={mark} canMark={tab === 'today'} />)}
      </main>
      <ToastView toast={toast} />
    </div>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="rounded-lg px-4 py-1.5 flex items-baseline gap-2" style={{ background: C.panel, borderLeft: `4px solid ${color}` }}><span className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</span><span className="text-sm" style={{ color: C.dim }}>{label}</span></div>;
}

function RequestCard({ r, today, busyId, onMark, canMark }: { r: BoardRequest; today: string; busyId: string; canMark: boolean; onMark: (id: string, a: 'arrive' | 'leave' | 'undo_arrive' | 'undo_leave') => void }) {
  const inside = r.persons.filter(p => p.arrived_at && !p.left_at).length;
  const carried = r.arrival_date < today && inside > 0;
  return (
    <section className="rounded-xl overflow-hidden" style={{ background: C.panel, border: `1px solid ${carried ? C.warn : C.line}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div>
          <div className="text-2xl font-semibold">{r.visitor_company}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-base" style={{ color: C.dim }}>
            <span className="font-mono">{r.request_no}</span>
            <span>{r.purpose === 'อื่นๆ (Others)' ? r.purpose_other : r.purpose}</span>
            <span className="inline-flex items-center gap-1"><Phone size={14} />ผู้แจ้ง {r.informer_name} ({r.informer_department}) {r.informer_phone}</span>
          </div>
          {(r.work_areas.length > 0 || r.work_area_detail) && <div className="mt-1 inline-flex items-start gap-1 text-base" style={{ color: C.primary }}><MapPin size={16} className="mt-1 shrink-0" /><span>{[...r.work_areas, r.work_area_detail].filter(Boolean).join(' · ')}</span></div>}
          {r.conditions && <div className="mt-1 inline-flex items-start gap-1 text-base" style={{ color: C.warn }}><ShieldAlert size={16} className="mt-1 shrink-0" /><span>เงื่อนไข: {r.conditions}</span></div>}
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono font-semibold tabular-nums">{hhmm(r.time_from)}–{hhmm(r.time_to)}</div>
          <div className="text-sm" style={{ color: carried ? C.warn : C.dim }}>{carried ? `เข้าเมื่อ ${thaiDate(r.arrival_date)} ยังไม่ออก` : thaiDate(r.arrival_date, true)} · {r.persons.length} คน{inside ? ` · ในพื้นที่ ${inside}` : ''}</div>
        </div>
      </div>
      <ul className="divide-y" style={{ borderColor: C.line }}>
        {r.persons.map(p => {
          const state = p.left_at ? 'left' : p.arrived_at ? 'inside' : 'expected';
          const busy = busyId === p.id;
          return (
            <li key={p.id} className="flex items-center gap-4 px-5 py-2.5" style={{ borderColor: C.line, opacity: state === 'left' ? 0.55 : 1 }}>
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: state === 'inside' ? C.positive : state === 'left' ? C.dim : C.warn }} />
              <span className="w-8 text-right tabular-nums" style={{ color: C.dim }}>{p.seq}.</span>
              <span className="flex-1 text-xl font-medium">{p.name}{p.detail && <span className="ml-2 text-base font-normal" style={{ color: C.dim }}>{p.detail}</span>}</span>
              <span className="w-40 text-base tabular-nums" style={{ color: C.dim }}>
                {p.arrived_at && <span>เข้า {bangkokTime(p.arrived_at)}</span>}{p.left_at && <span> · ออก {bangkokTime(p.left_at)}</span>}
              </span>
              {canMark && (
                <span className="flex gap-2">
                  {state === 'expected' && <Btn color={C.positive} busy={busy} onClick={() => onMark(p.id, 'arrive')}><LogIn size={18} />มาถึง</Btn>}
                  {state === 'inside' && <><Btn color={C.primary} busy={busy} onClick={() => onMark(p.id, 'leave')}><LogOut size={18} />ออก</Btn><Btn color={C.dim} ghost busy={busy} onClick={() => onMark(p.id, 'undo_arrive')} label="ยกเลิกมาถึง"><RotateCcw size={16} /></Btn></>}
                  {state === 'left' && <Btn color={C.dim} ghost busy={busy} onClick={() => onMark(p.id, 'undo_leave')} label="ยกเลิกออก"><RotateCcw size={16} />ยังไม่ออก</Btn>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Btn({ children, color, onClick, busy, ghost, label }: { children: React.ReactNode; color: string; onClick: () => void; busy: boolean; ghost?: boolean; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label={label} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-base font-medium disabled:opacity-50"
      style={ghost ? { border: `1px solid ${color}`, color } : { background: color, color: '#0F1720' }}>{children}</button>
  );
}

function shift(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
