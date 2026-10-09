'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Save } from 'lucide-react';
import type { HomeCard } from '@/lib/home-cards';
import { useHomeCards } from './useHomeCards';

type Draft = Pick<HomeCard, 'name' | 'description' | 'is_visible'>;
const draftOf = (card: HomeCard): Draft => ({ name: card.name, description: card.description, is_visible: card.is_visible });
const isChanged = (draft: Draft, saved: Draft) => draft.name !== saved.name || draft.description !== saved.description || draft.is_visible !== saved.is_visible;

function CardEditor({ card, onSaved, onDirty }: { card: HomeCard; onSaved: (card: HomeCard) => void; onDirty: (id: string, dirty: boolean) => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(card));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = isChanged(draft, card);
  const change = (next: Draft) => { setDraft(next); setMessage(''); setError(''); onDirty(card.id, isChanged(next, card)); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/home-cards', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: card.id, revision: card.revision, ...draft }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'บันทึกไม่สำเร็จ');
      setDraft(draftOf(result.data)); onSaved(result.data); onDirty(card.id, false);
      setMessage(result.data.is_visible ? 'บันทึกแล้ว — แสดงบนหน้าแรก' : 'บันทึกแล้ว — ซ่อนจากหน้าแรก');
    } catch (error) { setError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ'); }
    finally { setSaving(false); }
  };
  return <form onSubmit={save} data-card-id={card.id} aria-label={`แก้ไขการ์ด ${card.name}`} className="overflow-hidden rounded-2xl bg-white shadow-lg">
    <div className={`h-2 bg-gradient-to-r ${card.color}`} />
    <fieldset disabled={saving} className="min-w-0 space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-gray-900 break-words">{card.name}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${card.is_visible ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{card.is_visible ? <Eye size={14} /> : <EyeOff size={14} />}{card.is_visible ? 'กำลังแสดง' : 'ซ่อนอยู่'}</span>
      </div>
      <div><label htmlFor={`card-name-${card.id}`} className="block text-sm font-medium text-gray-800 mb-1">ชื่อการ์ด</label><input id={`card-name-${card.id}`} value={draft.name} onChange={event => change({ ...draft, name: event.target.value })} required maxLength={80} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-blue-600" /></div>
      <div><label htmlFor={`card-description-${card.id}`} className="block text-sm font-medium text-gray-800 mb-1">คำอธิบาย</label><textarea id={`card-description-${card.id}`} value={draft.description} onChange={event => change({ ...draft, description: event.target.value })} required maxLength={500} rows={3} className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:outline-blue-600" /></div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-800"><input type="checkbox" checked={draft.is_visible} onChange={event => change({ ...draft, is_visible: event.target.checked })} className="h-4 w-4 accent-blue-700" />แสดงการ์ดบนหน้าแรก</label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"><Save size={16} />{saving ? 'กำลังบันทึก…' : 'บันทึกการ์ด'}</button>
        <button type="button" disabled={!dirty || saving} onClick={() => change(draftOf(card))} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 disabled:opacity-50">ยกเลิกการแก้ไข</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="text-sm text-green-800">{message}</p>}
    </fieldset>
  </form>;
}

export function HomeCardsManager({ onClose }: { onClose: () => void }) {
  const { cards, error, reload, saved } = useHomeCards(true);
  const [dirtyIds, setDirtyIds] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasChanges = dirtyIds.length > 0;
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasChanges) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);
  const leave = (action: () => void) => { if (!hasChanges || window.confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกจากการแก้ไขนี้หรือไม่?')) { setDirtyIds([]); action(); } };
  const onDirty = (id: string, dirty: boolean) => setDirtyIds(previous => dirty ? [...new Set([...previous, id])] : previous.filter(value => value !== id));
  return <section className="pb-12">
    <div className="mb-5 rounded-xl bg-white/10 p-4 text-white">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-bold">จัดการการ์ดหน้าแรก</h2>
      <p className="mt-1 text-sm text-blue-100">ใช้ร่วมกันทุกบริษัท เลือกแสดงหรือซ่อน แล้วกดบันทึกในการ์ดนั้น การซ่อนมีผลเฉพาะการแสดงการ์ดบนหน้าแรก</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => leave(onClose)} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-blue-900"><ArrowLeft size={16} />กลับไปดูหน้าแรก</button>
        <button onClick={() => leave(reload)} className="rounded-lg border border-blue-300 px-4 py-2 text-sm">โหลดข้อมูลล่าสุด</button>
      </div>
    </div>
    {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-900">{error}</p>
      : !cards ? <p role="status" className="py-8 text-center text-blue-100">กำลังโหลดการ์ด…</p>
      : <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{cards.map(card => <CardEditor key={card.id} card={card} onSaved={saved} onDirty={onDirty} />)}</div>}
  </section>;
}
