'use client';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Crosshair, ExternalLink, ImagePlus, Layers, Maximize2, MousePointerClick, Pencil, Search, Tag, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { InspAssetView, InspDueState, InspFloorplanView } from '@/lib/inspect/types';
import { DUE_STATE_COLOR, DUE_STATE_LABEL } from '@/lib/inspect/constants';
import { fileToPlanImage, pdfPageCount, uploadPlanImage, type PlanImage } from '../../_components/floorplan';
import { AGENT_LEGEND, MarkerGlyph, agentBadge } from '../../_components/markers';
import { ConfirmButton, DueBadge, EmptyState, Modal, Skeleton, ToastView, VIZ, bangkokToday, btnGhost, btnPrimary, btnSecondary, cardClass, errMsg, getJson, inputClass, labelClass, postJson, thaiDate, useCompany, useToast } from '../../_components/ui';

type Pos = { x: number; y: number };

/** Inspected in the current round: same calendar month for monthly+ items, last 7 days for weekly items. */
function doneThisRound(a: InspAssetView, today: string) {
  void today; // the status view decides the round (calendar months for monthly+ items)
  return a.status_info.due_state === 'ok';
}
type Pending = Map<string, Pos | null>; // asset_id → new position on the current plan, or null = remove

export default function FloorplansPage() {
  return <Suspense fallback={<Skeleton className="h-96" />}><FloorplansInner /></Suspense>;
}

function FloorplansInner() {
  const { company } = useCompany();
  const { toast, setToast } = useToast();
  const params = useSearchParams();
  const [plans, setPlans] = useState<InspFloorplanView[] | null>(null);
  const [assets, setAssets] = useState<InspAssetView[] | null>(null);
  const [planId, setPlanId] = useState<string>('');
  const [editing, setEditing] = useState<{ plan: InspFloorplanView | null } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState<Pending>(new Map());
  const [selected, setSelected] = useState<string | null>(null); // asset id selected in place mode (to drop) or focused in view mode
  const [stateFilter, setStateFilter] = useState<Set<InspDueState | 'fail'>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [layers, setLayers] = useState<Set<string>>(new Set()); // category keys shown; empty = all
  const [onlyTodo, setOnlyTodo] = useState(false); // hide assets already inspected this round
  const [today] = useState(bangkokToday);
  const highlight = params.get('asset');

  const load = useCallback(async () => {
    setPlans(null); setAssets(null);
    try {
      const [p, a] = await Promise.all([
        getJson<{ data: InspFloorplanView[] }>(`/api/inspect/floorplans?company=${encodeURIComponent(company)}`),
        getJson<{ data: InspAssetView[] }>(`/api/inspect/assets?company=${encodeURIComponent(company)}&all=1`),
      ]);
      setPlans(p.data); setAssets(a.data);
      setPlanId(cur => {
        const want = params.get('plan');
        if (want && p.data.some(x => x.id === want)) return want;
        if (cur && p.data.some(x => x.id === cur)) return cur;
        return p.data[0]?.id || '';
      });
    } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'โหลดแผนผังไม่สำเร็จ') }); }
  }, [company, params, setToast]);
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (highlight) { const t = setTimeout(() => setSelected(highlight), 0); return () => clearTimeout(t); } }, [highlight]);

  const plan = useMemo(() => plans?.find(p => p.id === planId) || null, [plans, planId]);

  /** Assets shown on the current plan = saved positions merged with pending edits. */
  const onPlan = useMemo(() => {
    if (!assets || !plan) return [] as (InspAssetView & Pos)[];
    const out: (InspAssetView & Pos)[] = [];
    for (const a of assets) {
      const p = pending.get(a.id);
      if (p === null) continue;
      if (p) { out.push({ ...a, ...p }); continue; }
      if (a.floorplan_id === plan.id && a.pos_x != null && a.pos_y != null) out.push({ ...a, x: a.pos_x, y: a.pos_y });
    }
    return out;
  }, [assets, plan, pending]);
  const onPlanIds = useMemo(() => new Set(onPlan.map(a => a.id)), [onPlan]);
  const dotState = (a: InspAssetView): InspDueState | 'fail' => (a.status_info.open_failures > 0 ? 'fail' : a.status_info.due_state);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const a of onPlan) { if (layers.size && !layers.has(a.category.key)) continue; const k = dotState(a); c[k] = (c[k] || 0) + 1; } return c; }, [onPlan, layers]);
  const visible = useMemo(() => onPlan.filter(a => (stateFilter.size === 0 || stateFilter.has(dotState(a))) && (layers.size === 0 || layers.has(a.category.key)) && (!onlyTodo || !doneThisRound(a, today))), [onPlan, stateFilter, layers, onlyTodo, today]);
  const roundDone = useMemo(() => { const inLayer = onPlan.filter(a => layers.size === 0 || layers.has(a.category.key)); return { done: inLayer.filter(a => doneThisRound(a, today)).length, total: inLayer.length }; }, [onPlan, layers, today]);

  function setPos(assetId: string, pos: Pos | null) {
    setPending(prev => { const n = new Map(prev); const a = assets?.find(x => x.id === assetId); const already = a && plan && a.floorplan_id === plan.id && a.pos_x != null; if (pos === null && !already) n.delete(assetId); else n.set(assetId, pos); return n; });
  }
  function discard() { setPending(new Map()); setSelected(null); }
  async function save() {
    if (!plan || pending.size === 0) return;
    setSaving(true);
    try {
      const set = [...pending.entries()].filter(([, p]) => p).map(([asset_id, p]) => ({ asset_id, x: p!.x, y: p!.y }));
      const remove = [...pending.entries()].filter(([, p]) => p === null).map(([id]) => id);
      await postJson(`/api/inspect/floorplans/${plan.id}/positions`, { set, remove }, 'PUT');
      setToast({ type: 'success', msg: `บันทึกตำแหน่ง ${set.length + remove.length} รายการแล้ว` });
      setPending(new Map()); setSelected(null);
      await load();
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setSaving(false); }
  }
  async function removePlan(p: InspFloorplanView) {
    try { await getJson(`/api/inspect/floorplans/${p.id}`, { method: 'DELETE' }); setToast({ type: 'success', msg: 'ลบแผนผังแล้ว' }); setPlanId(''); await load(); } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); }
  }

  return (
    <div className="space-y-5">
      <ToastView toast={toast} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">แผนผัง</h1>
          <p className="text-sm text-gray-500 mt-1">ตำแหน่งอุปกรณ์บนผังอาคาร — ดูสถานะการตรวจทั้งชั้นในภาพเดียว</p>
        </div>
        <button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={() => setEditing({ plan: null })}><ImagePlus size={16} />เพิ่มแผนผัง</button>
      </div>

      {plans === null || assets === null ? <Skeleton className="h-[60vh]" /> : plans.length === 0 ? (
        <EmptyState icon={<ImagePlus size={28} />} title="ยังไม่มีแผนผัง" hint="อัปโหลดผังชั้นเป็น PDF / PNG / JPG แล้ววางตำแหน่งอุปกรณ์ทีละจุด" action={<button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={() => setEditing({ plan: null })}><ImagePlus size={16} />เพิ่มแผนผัง</button>} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {plans.map(p => {
              const active = p.id === planId;
              return (
                <button key={p.id} type="button" onClick={() => { if (pending.size > 0) { setToast({ type: 'info', msg: 'บันทึกหรือยกเลิกการแก้ไขก่อนเปลี่ยนแผนผัง' }); return; } setPlanId(p.id); setPending(new Map()); setSelected(null); setStateFilter(new Set()); }} className={`rounded-xl border px-3.5 py-2 text-left transition ${active ? 'border-[#4E79A7] bg-[#4E79A7]/5' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <p className={`text-sm font-medium ${active ? 'text-[#4E79A7]' : 'text-gray-800'}`}>{p.name}</p>
                  <p className="text-xs text-gray-500">{[p.building, p.floor && `ชั้น ${p.floor}`].filter(Boolean).join(' · ') || '—'} · {p.placed} จุด</p>
                </button>
              );
            })}
          </div>

          {plan && (
            <div className={`${cardClass} !p-0 overflow-hidden`}>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/60">
                <Legend counts={counts} filter={stateFilter} onToggle={k => setStateFilter(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                {roundDone.total > 0 && (
                  <button type="button" onClick={() => setOnlyTodo(v => !v)} title="กดเพื่อแสดงเฉพาะที่ยังไม่ตรวจรอบนี้" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${onlyTodo ? 'text-white' : 'bg-white'}`} style={{ borderColor: VIZ.primary, color: onlyTodo ? '#fff' : VIZ.primary, background: onlyTodo ? VIZ.primary : undefined }}>
                    <CheckCircle2 size={13} />รอบนี้ตรวจแล้ว {roundDone.done}/{roundDone.total}{onlyTodo ? ' · แสดงเฉพาะที่ยังไม่ตรวจ' : ''}
                  </button>
                )}
                <button type="button" className={`${btnGhost} text-xs ${showLabels ? 'text-[#4E79A7]' : ''}`} onClick={() => setShowLabels(v => !v)} title="แสดง/ซ่อนรหัสใต้สัญลักษณ์"><Tag size={13} />รหัส</button>
                <div className="flex-1" />
                {!placing ? (
                  <>
                    <button type="button" className={btnGhost} onClick={() => setEditing({ plan })}><Pencil size={14} />แก้ไข</button>
                    <ConfirmButton label={<><Trash2 size={14} />ลบ</>} confirmLabel="ลบแผนผังนี้? (ตำแหน่งจะหาย)" onConfirm={() => removePlan(plan)} className={`${btnGhost} text-xs`} danger />
                    <button type="button" className={btnSecondary} onClick={() => { setPlacing(true); setSelected(null); }}><MousePointerClick size={15} />วางตำแหน่ง</button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-gray-500">{pending.size > 0 ? `แก้ไข ${pending.size} รายการ ยังไม่บันทึก` : 'เลือกอุปกรณ์ด้านขวา แล้วคลิกบนผัง · ลากจุดเพื่อย้าย'}</span>
                    <button type="button" className={btnGhost} disabled={pending.size === 0 || saving} onClick={discard}><Undo2 size={14} />ยกเลิก</button>
                    <button type="button" className={btnPrimary} style={{ background: VIZ.positive }} disabled={pending.size === 0 || saving} onClick={save}><Check size={15} />บันทึก{pending.size > 0 ? ` (${pending.size})` : ''}</button>
                    <button type="button" className={btnSecondary} disabled={saving} onClick={() => { if (pending.size === 0) { setPlacing(false); setSelected(null); } else setToast({ type: 'info', msg: 'บันทึกหรือยกเลิกการแก้ไขก่อนออกจากโหมดวางตำแหน่ง' }); }}><X size={15} />เสร็จ</button>
                  </>
                )}
              </div>
              <LayerBar assets={assets} plan={plan} dots={onPlan} layers={layers} onToggle={k => setLayers(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; })} onAll={() => setLayers(new Set())} />
              <div className="flex flex-col lg:flex-row">
                <div className="flex-1 min-w-0">
                  <PlanCanvas key={plan.id} plan={plan} dots={visible} placing={placing} selected={selected} highlight={highlight} showLabels={showLabels} today={today}
                    onSelect={id => setSelected(id)}
                    onPlace={pos => { if (!placing) return; if (!selected) { setToast({ type: 'info', msg: 'เลือกอุปกรณ์จากรายการด้านขวาก่อน' }); return; } setPos(selected, pos); const next = nextUnplaced(assets, plan, onPlanIds, selected, layers); setSelected(next); }}
                    onMove={(id, pos) => setPos(id, pos)} />
                </div>
                {placing ? (
                  <PlacePanel assets={assets} plan={plan} layers={layers} onPlanIds={onPlanIds} pending={pending} selected={selected} onSelect={setSelected} onRemove={id => { setPos(id, null); setSelected(null); }} />
                ) : selected && onPlanIds.has(selected) ? (
                  <AssetCard asset={onPlan.find(a => a.id === selected)!} onClose={() => setSelected(null)} />
                ) : null}
              </div>
            </div>
          )}
        </>
      )}

      {editing && <PlanModal company={company} plan={editing.plan} existing={plans || []} onClose={() => setEditing(null)} onSaved={async (id) => { setEditing(null); await load(); if (id) setPlanId(id); }} setToast={setToast} />}
    </div>
  );
}

function nextUnplaced(assets: InspAssetView[] | null, plan: InspFloorplanView, onPlanIds: Set<string>, after: string, layers: Set<string>): string | null {
  if (!assets) return null;
  const list = candidates(assets, plan, true).filter(a => !onPlanIds.has(a.id) && a.id !== after && (layers.size === 0 || layers.has(a.category.key)));
  return list[0]?.id || null;
}
function candidates(assets: InspAssetView[], plan: InspFloorplanView, sameFloor: boolean) {
  const norm = (s: string) => s.replace(/^F/i, '').trim().toLowerCase();
  return assets
    .filter(a => a.status === 'active')
    .filter(a => !sameFloor || !plan.floor || norm(a.floor) === norm(plan.floor))
    .filter(a => !sameFloor || !plan.building || !a.building || a.building.toLowerCase() === plan.building.toLowerCase())
    .sort((x, y) => x.code.localeCompare(y.code, 'th', { numeric: true }));
}

// ---------------------------------------------------------------- legend
const LEGEND: { key: InspDueState | 'fail'; label: string; color: string }[] = [
  { key: 'fail', label: 'ไม่ผ่าน รอแก้ไข', color: VIZ.accent },
  { key: 'overdue', label: DUE_STATE_LABEL.overdue, color: DUE_STATE_COLOR.overdue },
  { key: 'due', label: DUE_STATE_LABEL.due, color: DUE_STATE_COLOR.due },
  { key: 'ok', label: DUE_STATE_LABEL.ok, color: DUE_STATE_COLOR.ok },
  { key: 'never', label: DUE_STATE_LABEL.never, color: DUE_STATE_COLOR.never },
];
function dotColor(a: InspAssetView) { return a.status_info.open_failures > 0 ? VIZ.accent : DUE_STATE_COLOR[a.status_info.due_state]; }
function Legend({ counts, filter, onToggle }: { counts: Record<string, number>; filter: Set<InspDueState | 'fail'>; onToggle: (k: InspDueState | 'fail') => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LEGEND.filter(l => counts[l.key]).map(l => {
        const on = filter.size === 0 || filter.has(l.key);
        return <button key={l.key} type="button" onClick={() => onToggle(l.key)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${on ? 'bg-white' : 'bg-gray-100 opacity-50'}`} style={{ borderColor: `${l.color}66`, color: l.color }}><span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />{l.label} {counts[l.key]}</button>;
      })}
    </div>
  );
}

/** Layers = equipment categories. Toggle which ones are drawn / listed; also explains the symbols and agent badges. */
function LayerBar({ assets, plan, dots, layers, onToggle, onAll }: { assets: InspAssetView[]; plan: InspFloorplanView; dots: Dot[]; layers: Set<string>; onToggle: (k: string) => void; onAll: () => void }) {
  const cats = useMemo(() => {
    const m = new Map<string, { cat: Dot['category']; placed: number; total: number }>();
    for (const a of candidates(assets, plan, true)) { const e = m.get(a.category.key) || { cat: a.category, placed: 0, total: 0 }; e.total++; m.set(a.category.key, e); }
    for (const d of dots) { const e = m.get(d.category.key) || { cat: d.category, placed: 0, total: 0 }; e.placed++; m.set(d.category.key, e); }
    return [...m.values()].sort((x, y) => y.total - x.total);
  }, [assets, plan, dots]);
  const agents = useMemo(() => { const set = new Set<string>(); for (const d of dots) if (d.category.key === 'fire_extinguisher') { const b = agentBadge(d.attributes?.agent); if (b) set.add(b); } return AGENT_LEGEND.filter(a => set.has(a.badge)); }, [dots]);
  if (cats.length === 0) return null;
  const allOn = layers.size === 0;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 border-b border-gray-100 text-xs">
      <span className="text-gray-400 inline-flex items-center gap-1"><Layers size={13} />Layer</span>
      <button type="button" onClick={onAll} className={`rounded-full border px-2.5 py-1 font-medium transition ${allOn ? 'bg-[#4E79A7] text-white border-[#4E79A7]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>ทั้งหมด</button>
      {cats.map(({ cat, placed, total }) => {
        const on = allOn || layers.has(cat.key);
        return (
          <button key={cat.key} type="button" onClick={() => onToggle(cat.key)} title={`${placed} จุดบนผัง · ${total} รายการชั้นนี้`} className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium transition ${on ? 'bg-white text-gray-800' : 'bg-gray-100 text-gray-400 opacity-60'}`} style={{ borderColor: on && !allOn ? cat.color : '#E5E7EB' }}>
            <MarkerGlyph categoryKey={cat.key} icon={cat.icon} agent={cat.key === 'fire_extinguisher' ? 'ผงเคมีแห้ง' : undefined} color={on ? cat.color : VIZ.muted} size={20} />
            {cat.name}<span className="text-gray-400 font-normal">{placed}/{total}</span>
          </button>
        );
      })}
      {agents.length > 0 && <span className="inline-flex items-center gap-2 text-gray-500 ml-auto"><span className="text-gray-400">ป้ายชนิดสาร:</span>{agents.map(a => <span key={a.badge}><b className="rounded border border-gray-300 bg-white px-1 py-[1px] text-[10px] text-gray-800">{a.badge}</b> {a.label}</span>)}<span className="text-gray-400">· สี = สถานะ</span></span>}
    </div>
  );
}

// ---------------------------------------------------------------- pan / zoom canvas
type Dot = InspAssetView & Pos;
function PlanCanvas({ plan, dots, placing, selected, highlight, showLabels, today, onSelect, onPlace, onMove }: { plan: InspFloorplanView; dots: Dot[]; placing: boolean; selected: string | null; highlight: string | null; showLabels: boolean; today: string; onSelect: (id: string | null) => void; onPlace: (pos: Pos) => void; onMove: (id: string, pos: Pos) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ s: 0, tx: 0, ty: 0 });
  const [loaded, setLoaded] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ kind: 'pan' | 'drag' | 'pinch'; id?: string; startX: number; startY: number; moved: boolean; tx: number; ty: number; dist?: number; s?: number } | null>(null);
  const W = plan.width, H = plan.height;

  const fit = useCallback(() => {
    const el = box.current; if (!el) return;
    const cw = el.clientWidth, ch = el.clientHeight;
    const s = Math.min(cw / W, ch / H) * 0.97;
    setView({ s, tx: (cw - W * s) / 2, ty: (ch - H * s) / 2 });
  }, [W, H]);
  useEffect(() => { const t = setTimeout(fit, 0); const ro = new ResizeObserver(() => fit()); if (box.current) ro.observe(box.current); return () => { clearTimeout(t); ro.disconnect(); }; }, [fit]);

  // Centre on the highlighted asset once
  const centred = useRef(false);
  useEffect(() => {
    if (!highlight || centred.current || view.s === 0) return;
    const d = dots.find(x => x.id === highlight); const el = box.current; if (!d || !el) return;
    centred.current = true;
    const s = Math.max(view.s, Math.min(3, (el.clientWidth / W) * 2.5));
    setView({ s, tx: el.clientWidth / 2 - d.x * W * s, ty: el.clientHeight / 2 - d.y * H * s });
  }, [highlight, dots, view.s, W, H]);

  function zoomAt(cx: number, cy: number, factor: number) {
    setView(v => { const s = Math.min(8, Math.max(0.05, v.s * factor)); const k = s / v.s; return { s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k }; });
  }
  function toFrac(clientX: number, clientY: number): Pos {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, ((clientX - r.left) - view.tx) / view.s / W)), y: Math.min(1, Math.max(0, ((clientY - r.top) - view.ty) / view.s / H)) };
  }
  function onWheel(e: React.WheelEvent) { e.preventDefault(); const r = box.current!.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 1 / 1.18); }
  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const dotId = (e.target as HTMLElement).closest<HTMLElement>('[data-dot]')?.dataset.dot;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', startX: (a.x + b.x) / 2, startY: (a.y + b.y) / 2, moved: true, tx: view.tx, ty: view.ty, dist: Math.hypot(a.x - b.x, a.y - b.y), s: view.s };
      return;
    }
    if (placing && dotId) gesture.current = { kind: 'drag', id: dotId, startX: e.clientX, startY: e.clientY, moved: false, tx: view.tx, ty: view.ty };
    else gesture.current = { kind: 'pan', id: dotId, startX: e.clientX, startY: e.clientY, moved: false, tx: view.tx, ty: view.ty };
  }
  function onPointerMove(e: React.PointerEvent) {
    const g = gesture.current; if (!g) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y); const s = Math.min(8, Math.max(0.05, (g.s || 1) * (dist / (g.dist || 1))));
      const r = box.current!.getBoundingClientRect(); const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      const k = s / (g.s || 1);
      setView({ s, tx: cx - (g.startX - r.left - g.tx) * k, ty: cy - (g.startY - r.top - g.ty) * k });
      return;
    }
    const dx = e.clientX - g.startX, dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    if (g.kind === 'drag' && g.id) onMove(g.id, toFrac(e.clientX, e.clientY));
    else if (g.kind === 'pan') setView(v => ({ ...v, tx: g.tx + dx, ty: g.ty + dy }));
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current; if (!g) return;
    if (pointers.current.size > 0 && g.kind === 'pinch') return;
    gesture.current = null;
    if (g.kind === 'pinch') return;
    if (!g.moved) {
      if (g.id) onSelect(g.id);
      else if (placing) onPlace(toFrac(e.clientX, e.clientY));
      else onSelect(null);
    }
  }
  return (
    <div className="relative">
      <div ref={box} className={`relative h-[62vh] min-h-[380px] overflow-hidden bg-[#F4F6F9] select-none ${placing ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`} style={{ touchAction: 'none' }}
        onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {!loaded && <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">กำลังโหลดแผนผัง…</div>}
        <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: '0 0', visibility: view.s ? 'visible' : 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={plan.image_url} alt={plan.name} width={W} height={H} draggable={false} onLoad={() => setLoaded(true)} className="block bg-white shadow-md" style={{ width: W, height: H }} />
          {dots.map(d => {
            const c = dotColor(d); const sel = d.id === selected; const hl = d.id === highlight; const pend = placing && sel; const done = doneThisRound(d, today);
            return (
              <div key={d.id} data-dot={d.id} className="group absolute flex flex-col items-center" style={{ left: d.x * W, top: d.y * H, transform: `translate(-50%, -62%) scale(${1 / view.s})`, transformOrigin: '50% 62%', zIndex: sel || hl ? 5 : 1 }}>
                <div className={`relative ${placing ? 'cursor-move' : 'cursor-pointer'} ${hl ? 'animate-pulse' : ''}`} style={{ outline: pend ? `2px dashed ${VIZ.primary}` : undefined, outlineOffset: 3, borderRadius: 6 }}>
                  <MarkerGlyph categoryKey={d.category.key} icon={d.category.icon} agent={d.attributes?.agent} color={c} size={sel || hl ? 36 : 30} selected={sel || hl} />
                  {done && <span title="ตรวจแล้วรอบนี้" className="absolute -left-1.5 -top-1 flex items-center justify-center rounded-full bg-white" style={{ width: 14, height: 14, boxShadow: '0 1px 2px rgba(0,0,0,.4)' }}><CheckCircle2 size={14} color={VIZ.positive} strokeWidth={2.5} /></span>}
                </div>
                <div className={`mt-0.5 whitespace-nowrap rounded-md px-1.5 py-[1px] text-[11px] font-semibold leading-tight pointer-events-none shadow-sm ${showLabels || sel || hl ? '' : 'opacity-0 group-hover:opacity-100'}`} style={{ background: `color-mix(in srgb, ${c} 28%, white)`, color: '#1F2937', border: `1px solid ${c}66` }}>{d.code}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-lg bg-white/95 shadow border border-gray-200 p-1">
        <button type="button" className="p-1.5 rounded hover:bg-gray-100 text-gray-700" title="ขยาย" onClick={() => { const el = box.current!; zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1.4); }}><ZoomIn size={16} /></button>
        <button type="button" className="p-1.5 rounded hover:bg-gray-100 text-gray-700" title="ย่อ" onClick={() => { const el = box.current!; zoomAt(el.clientWidth / 2, el.clientHeight / 2, 1 / 1.4); }}><ZoomOut size={16} /></button>
        <button type="button" className="p-1.5 rounded hover:bg-gray-100 text-gray-700" title="พอดีจอ" onClick={fit}><Maximize2 size={16} /></button>
      </div>
      <div className="absolute left-3 bottom-3 rounded-md bg-white/90 border border-gray-200 px-2 py-1 text-[11px] text-gray-500">{dots.length} จุด · {Math.round(view.s * 100)}% · ล้อเมาส์ = ซูม, ลาก = เลื่อน</div>
    </div>
  );
}

// ---------------------------------------------------------------- side panels
function PlacePanel({ assets, plan, layers, onPlanIds, pending, selected, onSelect, onRemove }: { assets: InspAssetView[]; plan: InspFloorplanView; layers: Set<string>; onPlanIds: Set<string>; pending: Pending; selected: string | null; onSelect: (id: string | null) => void; onRemove: (id: string) => void }) {
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [q, setQ] = useState('');
  const [sameFloor, setSameFloor] = useState(true);
  const inLayer = useCallback((a: InspAssetView) => layers.size === 0 || layers.has(a.category.key), [layers]);
  const base = useMemo(() => candidates(assets, plan, sameFloor).filter(inLayer), [assets, plan, sameFloor, inLayer]);
  const todo = useMemo(() => base.filter(a => !onPlanIds.has(a.id)), [base, onPlanIds]);
  const done = useMemo(() => assets.filter(a => onPlanIds.has(a.id) && inLayer(a)).sort((x, y) => x.code.localeCompare(y.code, 'th', { numeric: true })), [assets, onPlanIds, inLayer]);
  const list = (tab === 'todo' ? todo : done).filter(a => !q || `${a.code} ${a.department} ${a.location} ${a.name}`.toLowerCase().includes(q.toLowerCase()));
  const sel = selected ? assets.find(a => a.id === selected) : null;
  return (
    <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col max-h-[62vh]">
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
          <button type="button" onClick={() => setTab('todo')} className={`flex-1 rounded-md py-1.5 ${tab === 'todo' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>ยังไม่วาง {todo.length}</button>
          <button type="button" onClick={() => setTab('done')} className={`flex-1 rounded-md py-1.5 ${tab === 'done' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>วางแล้ว {done.length}</button>
        </div>
        <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" /><input className={`${inputClass} pl-8 py-2 text-sm`} placeholder="ค้นหารหัส / แผนก / ตำแหน่ง" value={q} onChange={e => setQ(e.target.value)} /></div>
        {plan.floor && tab === 'todo' && <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={sameFloor} onChange={e => setSameFloor(e.target.checked)} />เฉพาะอุปกรณ์ชั้น {plan.floor}{plan.building ? ` อาคาร ${plan.building}` : ''}</label>}
      </div>
      {sel && (
        <div className="px-3 py-2 border-b border-gray-100 text-xs" style={{ background: `${VIZ.primary}0D` }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-gray-800"><Crosshair size={12} className="inline mr-1" style={{ color: VIZ.primary }} />{onPlanIds.has(sel.id) ? 'เลือกอยู่: ' : 'คลิกบนผังเพื่อวาง: '}<b>{sel.code}</b></span>
            {onPlanIds.has(sel.id) && <button type="button" className="text-red-600 hover:underline" onClick={() => onRemove(sel.id)}>ลบตำแหน่ง</button>}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? <p className="text-xs text-gray-400 text-center py-8">{tab === 'todo' ? 'วางครบแล้ว' : 'ยังไม่มีจุดบนผังนี้'}</p> : list.map(a => {
          const isSel = a.id === selected; const changed = pending.has(a.id);
          return (
            <button key={a.id} type="button" onClick={() => onSelect(isSel ? null : a.id)} className={`w-full text-left px-3 py-2 border-b border-gray-50 text-sm transition ${isSel ? 'bg-[#4E79A7]/10' : 'hover:bg-gray-50'}`}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor(a) }} />
                <span className="font-mono font-medium text-gray-900 truncate">{a.code}</span>
                {changed && <span className="ml-auto text-[10px] rounded px-1 py-0.5" style={{ background: `${VIZ.secondary}22`, color: VIZ.secondary }}>แก้ไข</span>}
              </div>
              <p className="text-xs text-gray-500 truncate pl-4">{[a.department, a.floor && `ชั้น ${a.floor}`, a.location].filter(Boolean).join(' · ') || '—'}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function AssetCard({ asset: a, onClose }: { asset: Dot; onClose: () => void }) {
  return (
    <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-100 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-mono text-lg font-semibold text-gray-900">{a.code}</p><p className="text-xs text-gray-500">{a.category.name}{a.name ? ` · ${a.name}` : ''}</p></div>
        <button type="button" className={btnGhost} onClick={onClose}><X size={14} /></button>
      </div>
      <p className="text-sm text-gray-700">{[a.department, a.floor && `ชั้น ${a.floor}`, a.location].filter(Boolean).join(' · ') || '—'}</p>
      <div className="flex flex-wrap items-center gap-2"><DueBadge state={a.status_info.due_state} />{a.status_info.open_failures > 0 && <span className="text-xs font-medium" style={{ color: VIZ.accent }}>ไม่ผ่าน รอแก้ไข {a.status_info.open_failures}</span>}</div>
      <dl className="text-xs text-gray-600 space-y-1">
        <div className="flex justify-between"><dt>ตรวจล่าสุด</dt><dd className="text-gray-900">{a.status_info.last_inspected_on ? thaiDate(a.status_info.last_inspected_on) : '—'}</dd></div>
        <div className="flex justify-between"><dt>ครบกำหนด</dt><dd className="text-gray-900">{a.status_info.next_due_on ? thaiDate(a.status_info.next_due_on) : '—'}</dd></div>
        {a.status_info.next_service_due_on && <div className="flex justify-between"><dt>{a.category.service_label || 'ทดสอบตามรอบ'}</dt><dd className="text-gray-900">{thaiDate(a.status_info.next_service_due_on)}</dd></div>}
      </dl>
      <Link href={`/inspect/assets/${a.id}`} className={`${btnSecondary} w-full`}><ExternalLink size={14} />เปิดรายละเอียด</Link>
    </aside>
  );
}

// ---------------------------------------------------------------- add / edit modal
function PlanModal({ company, plan, existing, onClose, onSaved, setToast }: { company: string; plan: InspFloorplanView | null; existing: InspFloorplanView[]; onClose: () => void; onSaved: (id: string | null) => Promise<void>; setToast: (t: { type: 'success' | 'error' | 'info'; msg: string }) => void }) {
  const [name, setName] = useState(plan?.name || '');
  const [building, setBuilding] = useState(plan?.building || '');
  const [floor, setFloor] = useState(plan?.floor || '');
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState(1); const [page, setPage] = useState(1);
  const [img, setImg] = useState<PlanImage | null>(null);
  const [converting, setConverting] = useState(false);
  const [busy, setBusy] = useState(false);
  const buildings = useMemo(() => [...new Set(existing.map(p => p.building).filter(Boolean))], [existing]);

  async function pick(f: File | null) {
    setFile(f); setImg(null); setPages(1); setPage(1);
    if (!f) return;
    setConverting(true);
    try {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (isPdf) setPages(await pdfPageCount(f));
      setImg(await fileToPlanImage(f, 1));
      if (!name) setName(f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '));
    } catch (e) { setToast({ type: 'error', msg: errMsg(e, 'อ่านไฟล์ไม่สำเร็จ') }); setFile(null); } finally { setConverting(false); }
  }
  async function changePage(p: number) {
    if (!file) return; setPage(p); setConverting(true);
    try { setImg(await fileToPlanImage(file, p)); } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setConverting(false); }
  }
  async function save() {
    if (!name.trim()) { setToast({ type: 'error', msg: 'กรุณาตั้งชื่อแผนผัง' }); return; }
    if (!plan && !img) { setToast({ type: 'error', msg: 'กรุณาเลือกไฟล์แผนผัง' }); return; }
    setBusy(true);
    try {
      const image = img ? await uploadPlanImage(company, img) : undefined;
      if (plan) { await postJson(`/api/inspect/floorplans/${plan.id}`, { name: name.trim(), building: building.trim(), floor: floor.trim(), ...(image ? { image } : {}) }, 'PATCH'); setToast({ type: 'success', msg: 'บันทึกแผนผังแล้ว' }); await onSaved(plan.id); }
      else { const r = await postJson<{ data: { id: string } }>('/api/inspect/floorplans', { company_id: company, name: name.trim(), building: building.trim(), floor: floor.trim(), image }); setToast({ type: 'success', msg: 'เพิ่มแผนผังแล้ว — กด “วางตำแหน่ง” เพื่อปักจุดอุปกรณ์' }); await onSaved(r.data.id); }
    } catch (e) { setToast({ type: 'error', msg: errMsg(e) }); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={plan ? 'แก้ไขแผนผัง' : 'เพิ่มแผนผัง'} size="lg"
      footer={<><button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>ยกเลิก</button><button type="button" className={btnPrimary} style={{ background: VIZ.primary }} onClick={save} disabled={busy || converting}>{busy ? 'กำลังบันทึก…' : plan ? 'บันทึก' : 'เพิ่มแผนผัง'}</button></>}>
      <div className="grid sm:grid-cols-[1fr_1fr] gap-4">
        <div className="space-y-3">
          <div><label className={labelClass}>ชื่อแผนผัง</label><input className={inputClass} value={name} onChange={e => setName(e.target.value)} maxLength={120} placeholder="เช่น FB01 ชั้น 1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass}>อาคาร</label><input className={inputClass} list="insp-buildings" value={building} onChange={e => setBuilding(e.target.value)} maxLength={80} placeholder="FB01" /><datalist id="insp-buildings">{buildings.map(b => <option key={b} value={b} />)}</datalist></div>
            <div><label className={labelClass}>ชั้น</label><input className={inputClass} value={floor} onChange={e => setFloor(e.target.value)} maxLength={40} placeholder="1.5" /></div>
          </div>
          <p className="text-xs text-gray-500">ค่า “ชั้น” ควรตรงกับช่องชั้นในทะเบียนอุปกรณ์ (เช่น 1, 1.5, 1.55, 2, 2.5) ระบบจะใช้คัดรายการอุปกรณ์ของชั้นนั้นให้ตอนวางตำแหน่ง</p>
          <div>
            <label className={labelClass}>{plan ? 'เปลี่ยนรูปแผนผัง (ไม่บังคับ)' : 'ไฟล์แผนผัง'}</label>
            <label className={`${btnSecondary} w-full cursor-pointer`}><ImagePlus size={16} />{file ? file.name : 'เลือก PDF / PNG / JPG'}<input type="file" accept="application/pdf,image/*" className="sr-only" onChange={e => { void pick(e.target.files?.[0] || null); e.target.value = ''; }} /></label>
            {pages > 1 && <div className="mt-2 flex items-center gap-2 text-sm"><span className="text-gray-600">หน้าใน PDF</span><select className="rounded-lg border border-gray-300 px-2 py-1 text-sm" value={page} onChange={e => changePage(Number(e.target.value))}>{Array.from({ length: pages }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></div>}
            <p className="text-xs text-gray-500 mt-1">แปลงเป็นรูปไม่เกิน 2500 px ในเครื่องคุณก่อนอัปโหลด · เก็บถาวร ไม่ถูกลบตามรอบรูปตรวจ{plan ? ' · ตำแหน่งที่วางไว้คงอยู่ถ้ารูปใหม่มีสัดส่วนเท่าเดิม' : ''}</p>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 min-h-[220px] flex items-center justify-center overflow-hidden">
          {converting ? <p className="text-sm text-gray-500">กำลังแปลงไฟล์…</p> : img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.previewUrl} alt="" className="max-h-[320px] w-full object-contain" />
          ) : plan ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plan.image_url} alt="" className="max-h-[320px] w-full object-contain" />
          ) : <p className="text-sm text-gray-400">ตัวอย่างจะแสดงที่นี่</p>}
        </div>
      </div>
      {img && <p className="text-xs text-gray-500 mt-2">{img.width} × {img.height} px · {(img.blob.size / 1024).toFixed(0)} KB</p>}
    </Modal>
  );
}
