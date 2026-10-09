'use client';
import { useEffect, useRef, useState } from 'react';
import type { ChemSubstance } from '@/lib/types';
import { DEFAULT_LABEL_OPTIONS, labelDraft } from './label';
import { labelSnapshot, restoreLabel, type LabelHistory, type LabelVersion } from './label-versions';

async function read<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่');
  return data;
}
export function useLabelVersions(substance: ChemSubstance, history: LabelHistory) {
  const url = `/api/chemical/substances/${substance.id}`;
  const [source, setSource] = useState(substance);
  const [draft, setDraft] = useState(() => history.latest ? restoreLabel(history.latest.snapshot, substance) : labelDraft(substance));
  const [options, setOptions] = useState(() => history.latest?.snapshot.options || DEFAULT_LABEL_OPTIONS);
  const [title, setTitle] = useState(history.latest?.title || '');
  const [selected, setSelected] = useState<LabelVersion | null>(history.latest);
  const [versions, setVersions] = useState(history.versions);
  const [hasMore, setHasMore] = useState(history.hasMore);
  const fingerprint = JSON.stringify({ snapshot: labelSnapshot(draft, options), title: title.trim() });
  const [baseline, setBaseline] = useState(fingerprint);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const attempt = useRef<{ fingerprint: string; id: string } | null>(null);
  const dirty = fingerprint !== baseline;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function discardOK() {
    return !dirty || window.confirm('มีการแก้ไขที่ยังไม่ได้บันทึก ต้องการละทิ้งการแก้ไขนี้หรือไม่?');
  }
  async function perform(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(''); setMessage('');
    try { await task(); }
    catch (error) { setError(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่'); }
    finally { lock.current = false; setPending(false); }
  }
  function apply(version: LabelVersion | null, currentSource: ChemSubstance) {
    const nextDraft = version ? restoreLabel(version.snapshot, currentSource) : labelDraft(currentSource);
    const nextOptions = version?.snapshot.options || DEFAULT_LABEL_OPTIONS;
    const nextTitle = version?.title || '';
    setDraft(nextDraft); setOptions(nextOptions); setTitle(nextTitle); setSelected(version); setSource(currentSource);
    setBaseline(JSON.stringify({ snapshot: labelSnapshot(nextDraft, nextOptions), title: nextTitle }));
    attempt.current = null;
  }
  function save() {
    return perform(async () => {
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, id: crypto.randomUUID() };
      const { data } = await read<{ data: LabelVersion }>(`${url}/labels`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: attempt.current.id, title, snapshot: labelSnapshot(draft, options) }),
      });
      // Same request ID is reused after a lost response, so retry never creates a duplicate version.
      setVersions(list => [data, ...list.filter(v => v.id !== data.id)].sort((a, b) => b.version - a.version));
      apply(data, source);
      setMessage(`บันทึก V${data.version} แล้ว เปิดครั้งถัดไปจะใช้เวอร์ชันล่าสุด`);
    });
  }
  function choose(version: number) {
    if (!discardOK()) return;
    return perform(async () => {
      const [{ data }, { data: fresh }] = await Promise.all([
        read<{ data: LabelVersion }>(`${url}/labels?version=${version}`), read<{ data: ChemSubstance }>(url),
      ]);
      apply(data, fresh); setMessage(`เปิด V${data.version} แล้ว แก้ไขและบันทึกเป็นเวอร์ชันใหม่ได้`);
    });
  }
  function reset() {
    if (!window.confirm('เริ่มใหม่จากข้อมูลทะเบียนล่าสุดและขนาดฉลากเริ่มต้น? ข้อความที่ยังไม่บันทึกจะถูกแทนที่ แต่ประวัติทุกเวอร์ชันยังอยู่')) return;
    return perform(async () => {
      const { data } = await read<{ data: ChemSubstance }>(url);
      apply(null, data); setMessage('เริ่มใหม่จากข้อมูลทะเบียนแล้ว กดบันทึกเป็นเวอร์ชันใหม่เพื่อเก็บแบบนี้');
    });
  }
  function loadMore() {
    return perform(async () => {
      const older = await read<LabelHistory>(`${url}/labels?before=${versions[versions.length - 1].version}`);
      setVersions(list => [...list, ...older.versions.filter(v => !list.some(item => item.id === v.id))]);
      setHasMore(older.hasMore);
    });
  }
  return { draft, setDraft, options, setOptions, title, setTitle, selected, versions, hasMore, pending, message, error, dirty, save, choose, reset, loadMore, discardOK };
}
