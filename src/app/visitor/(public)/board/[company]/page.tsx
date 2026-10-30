'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { LogIn, LogOut, RotateCcw, Phone, MapPin, ShieldAlert, Maximize2, ChevronDown, ChevronRight, UserX, UserPlus, Settings2, X, Sun, Moon, ImagePlus, Trash2 } from 'lucide-react';
import type { BoardAction, BoardPayload, BoardPost, BoardRequest } from '@/lib/visitor/types';
import { FetchError, ToastView, bangkokTime, hhmm, postJson, getJson, thaiDate, useToast } from '../../../_components/ui';

// Two palettes for the guard monitor; VIZ hues kept for status colours. Background image is a per-device choice (localStorage).
type ThemeName = 'dark' | 'light';
type Palette = { bg: string; panel: string; line: string; text: string; dim: string; primary: string; positive: string; warn: string; danger: string; onAccent: string };
const PALETTES: Record<ThemeName, Palette> = {
  dark: { bg: '#0F1720', panel: '#172230', line: '#263445', text: '#F3F6FA', dim: '#9AA8B8', primary: '#6FA3D8', positive: '#7CC576', warn: '#F2A54A', danger: '#E8706E', onAccent: '#0F1720' },
  light: { bg: '#F3F5F8', panel: '#FFFFFF', line: '#E2E8F0', text: '#1F2937', dim: '#6B7280', primary: '#4E79A7', positive: '#59A14F', warn: '#F28E2B', danger: '#E15759', onAccent: '#FFFFFF' },
};
type Tab = 'yesterday' | 'today' | 'tomorrow';
type Prefs = { theme: ThemeName; bg: string | null; dim: number; collapsed: string[] };
const PREFS_KEY = 'visitor_board_prefs_v1';
const DEFAULT_PREFS: Prefs = { theme: 'dark', bg: null, dim: 55, collapsed: [] };

function loadPrefs(): Prefs {
  try { const raw = localStorage.getItem(PREFS_KEY); return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS; } catch { return DEFAULT_PREFS; }
}
function savePrefs(p: Prefs) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* quota / private mode */ } }

/** Downscale a picked image to ≤1920px JPEG so it fits in localStorage. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1920 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
    img.src = url;
  });
}

export default function BoardPage() {
  const { company } = useParams<{ company: string }>();
  const [data, setData] = useState<BoardPayload | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const [tab, setTab] = useState<Tab>('today');
  const [busy, setBusy] = useState('');
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [showSettings, setShowSettings] = useState(false);
  const { toast, setToast } = useToast();
  const C = PALETTES[prefs.theme];

  useEffect(() => { setPrefs(loadPrefs()); }, []);
  const updatePrefs = useCallback((patch: Partial<Prefs>) => setPrefs(prev => { const next = { ...prev, ...patch }; savePrefs(next); return next; }), []);

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
      requests: list.length,
      inside: persons.filter(p => p.arrived_at && !p.left_at).length,
      left: persons.filter(p => p.left_at).length,
      noShow: persons.filter(p => p.no_show_at).length,
      expected: persons.filter(p => !p.arrived_at && !p.no_show_at).length,
    };
  }, [list]);

  async function post(key: string, body: BoardPost, okMsg?: string) {
    if (busy) return;
    setBusy(key);
    try {
      await postJson(`/api/visitor/public/board/${encodeURIComponent(company)}`, body);
      await load();
      if (okMsg) setToast({ type: 'success', msg: okMsg });
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof FetchError ? e.message : 'บันทึกไม่สำเร็จ' });
    } finally { setBusy(''); }
  }
  const mark = (personId: string, action: BoardAction) => post(personId, { person_id: personId, action });
  const toggleCollapsed = (id: string) => updatePrefs({ collapsed: prefs.collapsed.includes(id) ? prefs.collapsed.filter(x => x !== id) : [...prefs.collapsed, id] });

  async function pickBackground(file: File | undefined) {
    if (!file) return;
    try { updatePrefs({ bg: await fileToDataUrl(file) }); setToast({ type: 'success', msg: 'ตั้งภาพพื้นหลังแล้ว (เฉพาะเครื่องนี้)' }); }
    catch { setToast({ type: 'error', msg: 'ใช้ภาพนี้ไม่ได้' }); }
  }

  const bk = new Date(now.getTime() + 7 * 3600 * 1000);
  const clock = bk.toISOString().slice(11, 19);
  const nowHm = bk.toISOString().slice(11, 16);
  const overlay = prefs.theme === 'dark' ? `rgba(15,23,32,${prefs.dim / 100})` : `rgba(243,245,248,${prefs.dim / 100})`;

  return (
    <div className="min-h-screen" style={{ background: C.bg, color: C.text, fontSize: 18 }}>
      {prefs.bg && <div aria-hidden className="fixed inset-0 z-0" style={{ backgroundImage: `url(${prefs.bg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}><div className="absolute inset-0" style={{ background: overlay }} /></div>}
      <div className="relative z-10">
        <header className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: `1px solid ${C.line}`, background: prefs.bg ? 'transparent' : C.panel }}>
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
              <button key={t} type="button" onClick={() => setTab(t)} className="px-5 py-2 font-medium" style={{ background: tab === t ? C.primary : C.panel, color: tab === t ? C.onAccent : C.text }}>
                {t === 'today' ? 'วันนี้' : t === 'tomorrow' ? `พรุ่งนี้ ${tomorrow ? thaiDate(tomorrow) : ''}` : `เมื่อวาน ${yesterday ? thaiDate(yesterday) : ''}`}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap ml-auto text-base">
            <Kpi C={C} label="คำขอ" value={counts.requests} color={C.primary} />
            <Kpi C={C} label="รอเข้า" value={counts.expected} color={C.warn} />
            <Kpi C={C} label="อยู่ในพื้นที่" value={counts.inside} color={C.positive} />
            <Kpi C={C} label="ออกแล้ว" value={counts.left} color={C.dim} />
            {counts.noShow > 0 && <Kpi C={C} label="ไม่มา" value={counts.noShow} color={C.danger} />}
          </div>
          <button type="button" onClick={() => setShowSettings(s => !s)} className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.dim, background: showSettings ? C.panel : 'transparent' }} aria-label="ตั้งค่าหน้าจอ" aria-expanded={showSettings}><Settings2 size={18} /></button>
          <button type="button" onClick={() => document.documentElement.requestFullscreen?.()} className="p-2 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.dim }} aria-label="เต็มจอ"><Maximize2 size={18} /></button>
        </div>

        {showSettings && <SettingsPanel C={C} prefs={prefs} onChange={updatePrefs} onPick={pickBackground} onClose={() => setShowSettings(false)} />}

        <main className="px-6 py-4 space-y-4">
          {error && <p style={{ color: C.danger }}>{error}</p>}
          {tab === 'yesterday' && <p className="text-sm" style={{ color: C.dim }}>ประวัติย้อนหลัง 1 วัน (ดูอย่างเดียว) — รายชื่อที่ยังไม่ได้กด &quot;ออก&quot; จะยังแสดงในแท็บวันนี้ด้วย</p>}
          {data && list.length === 0 && <p className="py-16 text-center text-2xl" style={{ color: C.dim }}>ไม่มีรายการที่อนุมัติสำหรับ{tab === 'today' ? 'วันนี้' : tab === 'tomorrow' ? 'พรุ่งนี้' : 'เมื่อวาน'}</p>}
          {list.map(r => (
            <RequestCard key={r.id} C={C} r={r} today={data?.today || ''} nowHm={nowHm} busy={busy} canMark={tab === 'today'}
              collapsed={prefs.collapsed.includes(r.id)} onToggle={() => toggleCollapsed(r.id)} onMark={mark}
              onAdd={(name, detail) => post(`add:${r.id}`, { request_id: r.id, action: 'add_person', name, detail }, `เพิ่ม ${name} และบันทึกมาถึงแล้ว`)}
              onNoShowAll={() => post(`ns:${r.id}`, { request_id: r.id, action: 'no_show_all' }, 'บันทึกว่าไม่มาแล้ว')} />
          ))}
        </main>
        <ToastView toast={toast} />
      </div>
    </div>
  );
}

function Kpi({ C, label, value, color }: { C: Palette; label: string; value: number; color: string }) {
  return <div className="rounded-lg px-4 py-1.5 flex items-baseline gap-2" style={{ background: C.panel, borderLeft: `4px solid ${color}` }}><span className="text-2xl font-semibold tabular-nums" style={{ color }}>{value}</span><span className="text-sm" style={{ color: C.dim }}>{label}</span></div>;
}

function SettingsPanel({ C, prefs, onChange, onPick, onClose }: { C: Palette; prefs: Prefs; onChange: (p: Partial<Prefs>) => void; onPick: (f: File | undefined) => void; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section className="mx-6 mt-3 rounded-xl p-4 flex flex-wrap items-center gap-4 text-base" style={{ background: C.panel, border: `1px solid ${C.line}` }} aria-label="ตั้งค่าหน้าจอ">
      <div className="flex items-center gap-2">
        <span style={{ color: C.dim }}>ธีม</span>
        <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
          {(['dark', 'light'] as ThemeName[]).map(t => (
            <button key={t} type="button" onClick={() => onChange({ theme: t })} className="px-3 py-1.5 inline-flex items-center gap-1.5" style={{ background: prefs.theme === t ? C.primary : 'transparent', color: prefs.theme === t ? C.onAccent : C.text }}>
              {t === 'dark' ? <Moon size={16} /> : <Sun size={16} />}{t === 'dark' ? 'มืด' : 'สว่าง'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span style={{ color: C.dim }}>ภาพพื้นหลัง</span>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { onPick(e.target.files?.[0]); e.target.value = ''; }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5" style={{ border: `1px solid ${C.line}` }}><ImagePlus size={16} />{prefs.bg ? 'เปลี่ยนภาพ' : 'เลือกภาพ'}</button>
        {prefs.bg && <button type="button" onClick={() => onChange({ bg: null })} className="px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5" style={{ border: `1px solid ${C.danger}`, color: C.danger }}><Trash2 size={16} />ลบภาพ</button>}
      </div>
      {prefs.bg && (
        <label className="flex items-center gap-2"><span style={{ color: C.dim }}>ความทึบทับภาพ</span>
          <input type="range" min={0} max={90} value={prefs.dim} onChange={e => onChange({ dim: Number(e.target.value) })} /><span className="tabular-nums w-10">{prefs.dim}%</span></label>
      )}
      <span className="text-sm ml-auto" style={{ color: C.dim }}>ตั้งค่านี้จำไว้เฉพาะเครื่อง/เบราว์เซอร์นี้</span>
      <button type="button" onClick={onClose} aria-label="ปิด" style={{ color: C.dim }}><X size={18} /></button>
    </section>
  );
}

type CardProps = {
  C: Palette; r: BoardRequest; today: string; nowHm: string; busy: string; canMark: boolean; collapsed: boolean;
  onToggle: () => void; onMark: (id: string, a: BoardAction) => void; onAdd: (name: string, detail: string) => void; onNoShowAll: () => void;
};
function RequestCard({ C, r, today, nowHm, busy, canMark, collapsed, onToggle, onMark, onAdd, onNoShowAll }: CardProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const inside = r.persons.filter(p => p.arrived_at && !p.left_at).length;
  const left = r.persons.filter(p => p.left_at).length;
  const noShow = r.persons.filter(p => p.no_show_at).length;
  const expected = r.persons.filter(p => !p.arrived_at && !p.no_show_at).length;
  const carried = r.arrival_date < today && inside > 0;
  const timePassed = r.arrival_date < today || (r.arrival_date === today && hhmm(r.time_to) <= nowHm);
  const nobodyCame = expected > 0 && inside === 0 && left === 0;

  function submitAdd() {
    const n = name.trim();
    if (!n) return;
    onAdd(n, detail.trim());
    setName(''); setDetail(''); setAdding(false);
  }

  return (
    <section className="rounded-xl overflow-hidden" style={{ background: C.panel, border: `1px solid ${carried ? C.warn : C.line}` }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3" style={{ borderBottom: collapsed ? 'none' : `1px solid ${C.line}` }}>
        <button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex items-start gap-3 text-left min-w-0 flex-1">
          <span className="mt-1.5 shrink-0" style={{ color: C.dim }}>{collapsed ? <ChevronRight size={22} /> : <ChevronDown size={22} />}</span>
          <span className="min-w-0">
            <span className="text-2xl font-semibold block">{r.visitor_company}</span>
            <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-base" style={{ color: C.dim }}>
              <span className="font-mono">{r.request_no}</span>
              <span>{r.purpose === 'อื่นๆ (Others)' ? r.purpose_other : r.purpose}</span>
              <span className="inline-flex items-center gap-1"><Phone size={14} />ผู้แจ้ง {r.informer_name} ({r.informer_department}) {r.informer_phone}</span>
            </span>
            {!collapsed && (r.work_areas.length > 0 || r.work_area_detail) && <span className="mt-1 inline-flex items-start gap-1 text-base" style={{ color: C.primary }}><MapPin size={16} className="mt-1 shrink-0" /><span>{[...r.work_areas, r.work_area_detail].filter(Boolean).join(' · ')}</span></span>}
            {!collapsed && r.conditions && <span className="mt-1 flex items-start gap-1 text-base" style={{ color: C.warn }}><ShieldAlert size={16} className="mt-1 shrink-0" /><span>เงื่อนไข: {r.conditions}</span></span>}
          </span>
        </button>
        <div className="text-right shrink-0">
          <div className="text-3xl font-mono font-semibold tabular-nums">{hhmm(r.time_from)}–{hhmm(r.time_to)}</div>
          <div className="text-sm" style={{ color: carried ? C.warn : C.dim }}>{carried ? `เข้าเมื่อ ${thaiDate(r.arrival_date)} ยังไม่ออก` : thaiDate(r.arrival_date, true)} · {r.persons.length} คน</div>
          <div className="mt-1 flex justify-end gap-3 text-sm tabular-nums">
            {expected > 0 && <span style={{ color: C.warn }}>รอ {expected}</span>}
            {inside > 0 && <span style={{ color: C.positive }}>ใน {inside}</span>}
            {left > 0 && <span style={{ color: C.dim }}>ออก {left}</span>}
            {noShow > 0 && <span style={{ color: C.danger }}>ไม่มา {noShow}</span>}
          </div>
        </div>
      </div>

      {!collapsed && (
        <>
          <ul>
            {r.persons.map(p => {
              const state = p.no_show_at ? 'noshow' : p.left_at ? 'left' : p.arrived_at ? 'inside' : 'expected';
              const b = busy === p.id;
              const dot = state === 'inside' ? C.positive : state === 'left' ? C.dim : state === 'noshow' ? C.danger : C.warn;
              return (
                <li key={p.id} className="flex items-center gap-4 px-5 py-2.5" style={{ borderTop: `1px solid ${C.line}`, opacity: state === 'left' || state === 'noshow' ? 0.6 : 1 }}>
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ background: dot }} />
                  <span className="w-8 text-right tabular-nums" style={{ color: C.dim }}>{p.seq}.</span>
                  <span className="flex-1 text-xl font-medium" style={{ textDecoration: state === 'noshow' ? 'line-through' : 'none' }}>
                    {p.name}{p.detail && <span className="ml-2 text-base font-normal" style={{ color: C.dim }}>{p.detail}</span>}
                    {p.added_by_guard && <span className="ml-2 align-middle text-xs px-2 py-0.5 rounded-full" style={{ background: `${C.primary}33`, color: C.primary }}>เพิ่มหน้างาน</span>}
                  </span>
                  <span className="w-44 text-base tabular-nums" style={{ color: C.dim }}>
                    {state === 'noshow' && <span style={{ color: C.danger }}>ไม่มา</span>}
                    {p.arrived_at && <span>เข้า {bangkokTime(p.arrived_at)}</span>}{p.left_at && <span> · ออก {bangkokTime(p.left_at)}</span>}
                  </span>
                  {canMark && (
                    <span className="flex gap-2">
                      {state === 'expected' && <><Btn C={C} color={C.positive} busy={b} onClick={() => onMark(p.id, 'arrive')}><LogIn size={18} />มาถึง</Btn><Btn C={C} color={C.dim} ghost busy={b} onClick={() => onMark(p.id, 'no_show')} label="ไม่มา"><UserX size={16} /></Btn></>}
                      {state === 'inside' && <><Btn C={C} color={C.primary} busy={b} onClick={() => onMark(p.id, 'leave')}><LogOut size={18} />ออก</Btn><Btn C={C} color={C.dim} ghost busy={b} onClick={() => onMark(p.id, 'undo_arrive')} label="ยกเลิกมาถึง"><RotateCcw size={16} /></Btn></>}
                      {state === 'left' && <Btn C={C} color={C.dim} ghost busy={b} onClick={() => onMark(p.id, 'undo_leave')} label="ยกเลิกออก"><RotateCcw size={16} />ยังไม่ออก</Btn>}
                      {state === 'noshow' && <Btn C={C} color={C.dim} ghost busy={b} onClick={() => onMark(p.id, 'undo_no_show')} label="ยกเลิกไม่มา"><RotateCcw size={16} />มาแล้ว</Btn>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {canMark && (
            <div className="px-5 py-3 flex flex-wrap items-center gap-3" style={{ borderTop: `1px solid ${C.line}`, background: `${C.line}55` }}>
              {adding ? (
                <form onSubmit={e => { e.preventDefault(); submitAdd(); }} className="flex flex-wrap items-center gap-2 flex-1">
                  <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อ-นามสกุล ผู้ที่มาเพิ่ม" maxLength={120} className="rounded-lg px-3 py-2 text-base flex-1 min-w-48" style={{ background: C.bg, color: C.text, border: `1px solid ${C.line}` }} />
                  <input value={detail} onChange={e => setDetail(e.target.value)} placeholder="ตำแหน่ง / ทะเบียนรถ (ถ้ามี)" maxLength={120} className="rounded-lg px-3 py-2 text-base flex-1 min-w-40" style={{ background: C.bg, color: C.text, border: `1px solid ${C.line}` }} />
                  <Btn C={C} color={C.positive} busy={busy === `add:${r.id}`} onClick={submitAdd}><UserPlus size={16} />บันทึกมาถึง</Btn>
                  <Btn C={C} color={C.dim} ghost busy={false} onClick={() => { setAdding(false); setName(''); setDetail(''); }}>ยกเลิก</Btn>
                </form>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-base" style={{ color: C.primary }}><UserPlus size={18} />เพิ่มคนที่มาจริงแต่ไม่อยู่ในรายชื่อ <span className="text-sm" style={{ color: C.dim }}>(อนุมัติเป็นภาพรวมของคณะแล้ว)</span></button>
              )}
              {nobodyCame && timePassed && !adding && (
                <Btn C={C} color={C.danger} ghost={!confirmNoShow} busy={busy === `ns:${r.id}`} onClick={() => { if (confirmNoShow) { onNoShowAll(); setConfirmNoShow(false); } else setConfirmNoShow(true); }}>
                  <UserX size={16} />{confirmNoShow ? `ยืนยัน: ทั้ง ${expected} คนไม่มา` : 'ทั้งคณะไม่มา'}
                </Btn>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Btn({ C, children, color, onClick, busy, ghost, label }: { C: Palette; children: React.ReactNode; color: string; onClick: () => void; busy: boolean; ghost?: boolean; label?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} aria-label={label} title={label} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-base font-medium disabled:opacity-50"
      style={ghost ? { border: `1px solid ${color}`, color } : { background: color, color: C.onAccent }}>{children}</button>
  );
}

function shift(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
