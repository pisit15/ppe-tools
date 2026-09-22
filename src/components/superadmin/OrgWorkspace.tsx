'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Building2, Check, ChevronRight, Download, Expand, Focus, GitBranch, Grip, LayoutGrid, ListFilter, Loader2, Minus, Move, Network, Pencil, Plus, RotateCcw, Search, Users, X } from 'lucide-react';
import { blankProfile, FAMILIES, STATUS, type Member, type Profile } from '@/lib/team-management';
import { buildOrgChart, connectorPath, escapeSvg, NODE_HEIGHT, NODE_WIDTH, reportingNetwork, type LineMode, type Point } from '@/lib/team-org-chart';
import styles from './org-workspace.module.css';

type Props = {
  people: Member[];
  profiles: Map<string, Profile>;
  companies: { company_id: string; company_name: string }[];
  onEdit: (person: Member) => void;
  onSavePosition: (id: string, point: Point) => Promise<unknown>;
  onReload: () => Promise<void>;
};
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('');
const short = (text: string, limit: number) => Array.from(text).length > limit ? Array.from(text).slice(0, limit - 1).join('') + '…' : text;
const same = (a?: Point, b?: Point) => a?.x === b?.x && a?.y === b?.y;
const modeLabels = { both: 'ทั้งสองสาย', direct_manager: 'สายบังคับบัญชา', functional_manager: 'สายวิชาชีพ' };

export default function OrgWorkspace({ people, profiles, companies, onEdit, onSavePosition, onReload }: Props) {
  const [view, setView] = useState<'overview' | 'chart'>('overview');
  const [query, setQuery] = useState('');
  const [company, setCompany] = useState('');
  const [team, setTeam] = useState('');
  const [family, setFamily] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [includeOutside, setIncludeOutside] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<LineMode>('both');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [useSaved, setUseSaved] = useState(false);
  const [draft, setDraft] = useState<Record<string, Point>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [camera, setCamera] = useState({ x: 24, y: 84, scale: 0.9 });
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 580 });
  const stageRef = useRef<HTMLDivElement>(null);
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const pointer = useRef<{ id: string | null; start: Point; origin: Point } | null>(null);
  const profileFor = useCallback((person: Member) => {
    const profile = profiles.get(person.id) || blankProfile(person);
    return { ...profile, status: person.is_active ? 'working' as const : profile.status === 'working' ? 'inactive' as const : profile.status };
  }, [profiles]);
  const companyNames = useMemo(() => new Map(companies.map(c => [c.company_id, c.company_name])), [companies]);
  const companyName = useCallback((id: string) => companyNames.get(id) || id.toUpperCase(), [companyNames]);
  const basePeople = useMemo(() => people.filter(p => {
    const profile = profileFor(p);
    return (includeOutside || profile.in_scope !== false) && (!activeOnly || profile.status === 'working') && (!company || profile.company_ids.includes(company)) && (!team || profile.teams.includes(team)) && (!family || profile.family === family);
  }), [people, profileFor, includeOutside, activeOnly, company, team, family]);
  const matches = useCallback((p: Member) => [p.full_name, p.nick_name, p.position, p.company_id, companyName(p.company_id)].join(' ').toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')), [query, companyName]);
  const found = useMemo(() => basePeople.filter(matches), [basePeople, matches]);
  const network = useMemo(() => focusId ? reportingNetwork(focusId, basePeople, profiles, mode) : null, [focusId, basePeople, profiles, mode]);
  const chartPeople = useMemo(() => network ? basePeople.filter(p => network.has(p.id)) : basePeople, [network, basePeople]);
  const chart = useMemo(() => buildOrgChart(chartPeople, profiles, mode), [chartPeople, profiles, mode]);
  const allChart = useMemo(() => buildOrgChart(basePeople, profiles, mode), [basePeople, profiles, mode]);
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const selected = selectedId ? byId.get(selectedId) : null;
  const selectedProfile = selected ? profileFor(selected) : null;
  const groups = [...new Set(found.map(p => p.company_id))].sort();
  const allCompanyCount = new Set(basePeople.map(p => p.company_id)).size;
  const points = Object.fromEntries(chartPeople.map(p => {
    const saved = profiles.get(p.id);
    const point = draft[p.id] || (useSaved && saved?.x != null && saved.y != null ? { x: saved.x, y: saved.y } : chart.points[p.id]);
    return [p.id, point];
  }));
  const bounds = { width: Math.max(320, ...Object.values(points).map(p => p.x + NODE_WIDTH + 40)), height: Math.max(180, ...Object.values(points).map(p => p.y + NODE_HEIGHT + 40)) };
  const dirtyCount = Object.keys(draft).length;
  const advancedCount = Number(!!family) + Number(!activeOnly) + Number(includeOutside);
  const selectedEdges = chart.edges.filter(e => e.from === selectedId || e.to === selectedId);
  const relatedIds = new Set(selectedEdges.flatMap(e => [e.from, e.to]));
  const hasSaved = chartPeople.some(p => profiles.get(p.id)?.x != null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, [view]);
  useEffect(() => {
    if (!dirtyCount) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  function resetCamera() { setCamera({ x: 24, y: 84, scale: 0.9 }); }
  function changeCompany(id: string) { setCompany(id); setFocusId(null); setSelectedId(null); resetCamera(); }
  function fit() {
    const scale = Math.max(0.15, Math.min(1, (canvasSize.width - 48) / bounds.width, (canvasSize.height - 150) / bounds.height));
    setCamera({ scale, x: (canvasSize.width - bounds.width * scale) / 2, y: 80 + (canvasSize.height - 150 - bounds.height * scale) / 2 });
  }
  function zoom(next: number) {
    setCamera(current => {
      const scale = Math.min(1.6, Math.max(0.15, next));
      const center = { x: canvasSize.width / 2, y: canvasSize.height / 2 };
      return { scale, x: center.x - (center.x - current.x) * scale / current.scale, y: center.y - (center.y - current.y) * scale / current.scale };
    });
  }
  function selectPerson(id: string) {
    setSelectedId(id);
    const point = points[id];
    if (view === 'chart' && point) setCamera(current => ({ ...current, scale: Math.max(0.8, current.scale), x: 48 - point.x * Math.max(0.8, current.scale), y: 72 - point.y * Math.max(0.8, current.scale) }));
  }
  function focusPerson(id: string) {
    // Following a relationship can lead outside the current company or team.
    const person = byId.get(id);
    setCompany(''); setTeam(''); setFamily('');
    if (person && profileFor(person).in_scope === false) setIncludeOutside(true);
    if (person && profileFor(person).status !== 'working') setActiveOnly(false);
    setFocusId(id); setView('chart'); setSelectedId(id); setQuery(''); setUseSaved(false);
    const candidates = people.filter(p => {
      const profile = profileFor(p);
      return (includeOutside || person && profileFor(person).in_scope === false || profile.in_scope !== false) && (!activeOnly || person && profileFor(person).status !== 'working' || profile.status === 'working');
    });
    const connected = reportingNetwork(id, candidates, profiles, mode);
    const layout = buildOrgChart(candidates.filter(p => connected.has(p.id)), profiles, mode);
    const width = mainPanelRef.current?.clientWidth || canvasSize.width;
    const height = stageRef.current?.clientHeight || Math.max(440, Math.min(820, window.innerHeight - 330));
    const scale = Math.max(.15, Math.min(1, (width - 48) / layout.width, (height - 150) / layout.height));
    setCamera({ scale, x: (width - layout.width * scale) / 2, y: 80 });
  }
  function clearFilters() { setQuery(''); setCompany(''); setTeam(''); setFamily(''); setActiveOnly(true); setIncludeOutside(false); setFocusId(null); resetCamera(); }
  function movePerson(id: string, point: Point) {
    const next = { x: Math.min(20000, Math.max(16, Math.round(point.x))), y: Math.min(20000, Math.max(16, Math.round(point.y))) };
    if (!same(next, points[id])) setDraft(current => ({ ...current, [id]: next }));
  }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    let saved = 0;
    try {
      for (const [id, point] of Object.entries(draft)) {
        await onSavePosition(id, point);
        setDraft(current => { const next = { ...current }; delete next[id]; return next; });
        saved++;
      }
      setUseSaved(true); setEditing(false); setMessage(`บันทึกตำแหน่ง ${saved} การ์ดแล้ว`);
    } catch (cause) { setError(`บันทึกแล้ว ${saved} การ์ด ส่วนที่เหลือยังอยู่ในแบบร่าง: ${cause instanceof Error ? cause.message : 'กรุณาลองอีกครั้ง'}`); }
    finally { await onReload(); if (saved > 0) setUseSaved(true); setBusy(false); }
  }
  function cancelLayout() {
    if (dirtyCount && !window.confirm('ละทิ้งตำแหน่งที่ยังไม่ได้บันทึก?')) return;
    setDraft({}); setEditing(false); setError('');
  }
  function exportSvg() {
    const title = `${company ? companyName(company) : 'กลุ่มบริษัท EA'} · โครงสร้างทีม SHE / ISO`;
    const lines = chart.edges.map(e => `<path d="${connectorPath(points[e.from], points[e.to], e.type === 'functional_manager' ? 9 : 0)}" fill="none" stroke="${e.type === 'functional_manager' ? '#7c3aed' : '#536777'}" stroke-width="2" ${e.type === 'functional_manager' ? 'stroke-dasharray="7 5"' : ''}/>`).join('');
    const nodes = chartPeople.map(p => `<g transform="translate(${points[p.id].x},${points[p.id].y})"><rect width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="12" fill="white" stroke="#cad7dd"/><text x="16" y="30" font-size="15" font-weight="600">${escapeSvg(short(p.full_name, 31))}</text><text x="16" y="57" font-size="13">${escapeSvg(short(p.position || 'ยังไม่ระบุตำแหน่ง', 34))}</text><text x="16" y="91" font-size="12" fill="#586976">${escapeSvg(p.company_id.toUpperCase() + ' · ' + profileFor(p).teams.join(' / '))}</text><title>${escapeSvg(p.full_name + ' · ' + p.position)}</title></g>`).join('');
    const note = `${chartPeople.length} ระเบียน · ${modeLabels[mode]} · เส้นทึบ: สายบังคับบัญชา / เส้นประ: สายวิชาชีพ${chart.hidden.length ? ` · ${chart.hidden.length} สายรายงานอยู่นอกตัวกรอง` : ''}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height + 100}" viewBox="0 0 ${bounds.width} ${bounds.height + 100}" font-family="Tahoma, sans-serif" fill="#172e3b"><rect width="100%" height="100%" fill="#f8fafb"/><text x="32" y="35" font-size="22" font-weight="700">${escapeSvg(title)}</text><text x="32" y="62" font-size="12">${escapeSvg(note)}</text><g transform="translate(0,90)">${lines}${nodes}</g></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'ea-she-org-chart.svg'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('ส่งออกผังตามตัวกรองปัจจุบันแล้ว');
  }

  return <section className={styles.workspace} aria-label="โครงสร้างทีม SHE และ ISO">
    <header className={styles.pageHeader}>
      <div><div className={styles.eyebrow}>EA GROUP <span>/</span> PEOPLE & ORGANIZATION</div><h1>โครงสร้างทีม <span>SHE / ISO</span></h1><p>สำรวจทีมและสายรายงานของกลุ่มบริษัท</p></div>
      <div className={styles.headerActions}><button onClick={() => void onReload()} title="โหลดข้อมูลล่าสุด" aria-label="โหลดข้อมูลล่าสุด"><RotateCcw size={17}/></button><button className={styles.exportButton} aria-label="ส่งออกผัง" onClick={exportSvg} disabled={!chartPeople.length}><Download size={16}/><span>ส่งออกผัง</span></button></div>
    </header>
    <div className={styles.summary}><span><Users size={16}/><strong>{basePeople.length}</strong> ระเบียน</span><span><Building2 size={16}/><strong>{allCompanyCount}</strong> บริษัทหลัก</span><span><GitBranch size={16}/><strong>{allChart.edges.length}</strong> สายรายงาน</span><span className={styles.statusScope}>{activeOnly ? 'เฉพาะผู้ที่ทำงานอยู่' : 'ทุกสถานะ'}{includeOutside ? ' · รวมคนนอกขอบเขต' : ''}</span></div>
    <div className={styles.toolbar}>
      <div className={styles.searchBox}><Search size={18}/><input aria-label="ค้นหาบุคลากรในผัง" placeholder="ค้นหาชื่อ ตำแหน่ง หรือบริษัท…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && found[0]) selectPerson(found[0].id); }}/>{query && <button aria-label="ล้างคำค้นหา" onClick={() => setQuery('')}><X size={16}/></button>}</div>
      <select aria-label="บริษัทที่รับผิดชอบ" value={company} onChange={e => changeCompany(e.target.value)}><option value="">ทุกบริษัท</option>{companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name || c.company_id.toUpperCase()}</option>)}</select>
      <select aria-label="ทีม" value={team} onChange={e => { setTeam(e.target.value); setFocusId(null); }}><option value="">ทุกทีม</option>{['SHE','ISO','DCC','Environment'].map(t => <option key={t}>{t}</option>)}</select>
      <button className={filtersOpen || advancedCount ? styles.activeButton : ''} onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}><ListFilter size={17}/>ตัวกรอง{advancedCount > 0 && <span className={styles.count}>{advancedCount}</span>}</button>
    </div>
    {filtersOpen && <div className={styles.advancedFilters}><label>กลุ่มงาน<select value={family} onChange={e => setFamily(e.target.value)}><option value="">ทุกกลุ่มงาน</option>{Object.entries(FAMILIES).map(([id,label]) => <option key={id} value={id}>{id} · {label}</option>)}</select></label><label><input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)}/> ทำงานอยู่</label><label><input type="checkbox" checked={includeOutside} onChange={e => setIncludeOutside(e.target.checked)}/> รวมคนนอกขอบเขตความรับผิดชอบ</label><button onClick={clearFilters}>ล้างตัวกรอง</button></div>}
    <div className={styles.viewBar}>
      <div className={styles.segmented} role="group" aria-label="มุมมองโครงสร้างทีม"><button aria-pressed={view === 'overview'} onClick={() => setView('overview')}><LayoutGrid size={16}/>ภาพรวมบริษัท</button><button aria-pressed={view === 'chart'} onClick={() => { setView('chart'); resetCamera(); }}><Network size={16}/>ผังสายรายงาน</button></div>
      <span className={styles.viewCaption}>{query ? `พบ ${found.length} ระเบียน` : company ? companyName(company) : 'ทุกบริษัทในกลุ่ม EA'}{focusId && view === 'chart' && <button onClick={() => { setFocusId(null); resetCamera(); }}><X size={13}/>เลิกโฟกัส</button>}</span>
    </div>
    {(message || error) && <div className={error ? styles.error : styles.notice} role={error ? 'alert' : 'status'}>{error || message}<button aria-label="ปิดข้อความ" onClick={() => { setError(''); setMessage(''); }}><X size={16}/></button></div>}
    <div className={`${styles.workArea} ${selected ? styles.withInspector : ''}`}>
      <div ref={mainPanelRef} className={styles.mainPanel}>
        {view === 'overview' ? <div className={styles.overview}>
          <div className={styles.sectionHeading}><h2>ทีมในแต่ละบริษัท</h2><span>เลือกบุคคลเพื่อดูรายละเอียด · เลือกบริษัทเพื่อดูผัง</span></div>
          {!found.length ? <div className={styles.empty}><Search size={30}/><h3>ไม่พบบุคลากรตามตัวกรอง</h3><p>ลองใช้ชื่อบางส่วน หรือเลือกดูทุกบริษัท</p><button onClick={clearFilters}>ล้างตัวกรอง</button></div> : <div className={styles.companyGrid}>{groups.map(id => {
            const members = found.filter(p => p.company_id === id);
            const visibleMembers = company || query ? members : members.slice(0, 3);
            return <article className={styles.companyCard} key={id}><header><div className={styles.companyMonogram}>{id.toUpperCase().replace('EA-', '').slice(0,3)}</div><div><h3>{companyName(id)}</h3><span>{members.length} ระเบียน · {id.toUpperCase()}</span></div><button aria-label={`ดูผัง ${companyName(id)}`} title="ดูผังบริษัท" onClick={() => { changeCompany(id); setView('chart'); }}><ArrowRight size={18}/></button></header><div className={styles.companyPeople}>{visibleMembers.map(p => {
              const profile = profileFor(p);
              const reports = people.filter(child => { const pr = profiles.get(child.id); return pr?.direct_manager === p.id || pr?.functional_manager === p.id; }).length;
              return <button key={p.id} className={`${styles.personRow} ${selectedId === p.id ? styles.selectedRow : ''}`} aria-pressed={selectedId === p.id} onClick={() => selectPerson(p.id)}><span className={`${styles.avatar} ${profile.teams.includes('ISO') ? styles.isoAvatar : ''}`}>{initials(p.full_name)}</span><span className={styles.personCopy}><strong>{p.full_name}</strong><span>{p.position || 'ยังไม่ระบุตำแหน่ง'}</span><span className={styles.personMeta}>{profile.teams.join(' / ') || 'ยังไม่จัดทีม'}{reports > 0 && <span><GitBranch size={12}/>{reports}</span>}</span></span><ChevronRight size={15}/></button>;
            })}</div>{visibleMembers.length < members.length && <button className={styles.showMembers} onClick={() => changeCompany(id)}>ดูทั้งหมด {members.length} ระเบียน<ArrowRight size={14}/></button>}</article>;
          })}</div>}
          <p className={styles.dataNote}>จัดกลุ่มตามบริษัทหลัก · จำนวนเป็นระเบียนบุคลากร ยังไม่รวมระเบียนซ้ำเป็นคนเดียว</p>
        </div> : <div className={styles.chartPanel}>
          <div className={styles.canvasToolbar}><label><GitBranch size={16}/><select aria-label="แสดงสายรายงาน" value={mode} onChange={e => { setMode(e.target.value as LineMode); resetCamera(); }}>{Object.entries(modeLabels).map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select></label><div className={styles.canvasActions}>{hasSaved && <button aria-pressed={useSaved} onClick={() => { setUseSaved(!useSaved); resetCamera(); }}>{useSaved ? 'ใช้ผังอัตโนมัติ' : 'ใช้ตำแหน่งที่บันทึก'}</button>}<button className={editing ? styles.activeButton : ''} disabled={busy} onClick={() => { if (editing) cancelLayout(); else setEditing(true); }}><Pencil size={15}/>{editing ? 'ยกเลิกจัดตำแหน่ง' : 'จัดตำแหน่ง'}</button></div></div>
          {editing && <div className={styles.editBar}><span><Grip size={16}/>ลากการ์ด หรือใช้ปุ่มลูกศรที่การ์ด</span><button disabled={busy} onClick={() => { setDraft(current => ({ ...current, ...chart.points })); resetCamera(); }}>จัดอัตโนมัติ</button><button className={styles.primaryButton} disabled={busy || !dirtyCount} onClick={() => void save()}>{busy ? <Loader2 size={15} className={styles.spin}/> : <Check size={15}/>}บันทึก{dirtyCount ? ` (${dirtyCount})` : ''}</button></div>}
          {chart.hidden.length > 0 && <div className={styles.contextNote}>{chart.hidden.length} สายรายงานอยู่นอกตัวกรอง <button onClick={clearFilters}>ดูทุกบริษัท</button></div>}
          {query && <div className={styles.searchResults}>{found.length ? found.slice(0,8).map(p => <button key={p.id} onClick={() => selectPerson(p.id)}><Focus size={13}/>{p.full_name}</button>) : 'ไม่พบชื่อที่ค้นหา'}</div>}
          <div ref={stageRef} className={styles.canvas}>
            {!chartPeople.length && <div className={styles.canvasEmpty}><Users size={30}/><h3>ไม่มีบุคลากรในมุมมองนี้</h3><button onClick={clearFilters}>ล้างตัวกรอง</button></div>}
            <svg role="group" aria-label="ผังสายรายงาน ลากพื้นที่ว่างเพื่อเลื่อนผัง" className={styles.chartSvg} onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); pointer.current = { id: null, start: { x: e.clientX, y: e.clientY }, origin: { x: camera.x, y: camera.y } }; }} onPointerMove={e => {
              const action = pointer.current; if (!action) return;
              const dx = e.clientX - action.start.x, dy = e.clientY - action.start.y;
              if (action.id) { if (Math.abs(dx) + Math.abs(dy) > 3) dragged.current = true; if (!busy) movePerson(action.id, { x: action.origin.x + dx / camera.scale, y: action.origin.y + dy / camera.scale }); }
              else setCamera(current => ({ ...current, x: action.origin.x + dx, y: action.origin.y + dy }));
            }} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}>
              <g transform={`translate(${camera.x},${camera.y}) scale(${camera.scale})`}>
                {chart.edges.map(edge => <path key={`${edge.type}-${edge.to}`} data-reporting-line={edge.type} d={connectorPath(points[edge.from], points[edge.to], edge.type === 'functional_manager' ? 9 : 0)} fill="none" stroke={edge.type === 'functional_manager' ? '#8b63c9' : '#738a99'} strokeWidth={selectedId && (edge.from === selectedId || edge.to === selectedId) ? 3 : 1.75} strokeDasharray={edge.type === 'functional_manager' ? '7 5' : undefined} opacity={selectedId && edge.from !== selectedId && edge.to !== selectedId ? 0.2 : 1}><title>{byId.get(edge.from)?.full_name} → {byId.get(edge.to)?.full_name} · {modeLabels[edge.type]}</title></path>)}
                {chartPeople.map(p => {
                  const profile = profileFor(p), point = points[p.id];
                  const selectedNode = selectedId === p.id;
                  return <g key={p.id} role="button" tabIndex={0} aria-label={`ดูข้อมูล ${p.full_name}${editing ? ' ใช้ปุ่มลูกศรเพื่อย้าย' : ''}`} aria-pressed={selectedNode} className={styles.chartNode} transform={`translate(${point.x},${point.y})`} opacity={query && !matches(p) ? 0.28 : selectedId && !selectedNode && relatedIds.size > 0 && !relatedIds.has(p.id) ? 0.5 : 1} onClick={e => { e.stopPropagation(); if (!dragged.current) setSelectedId(p.id); dragged.current = false; }} onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(p.id); }
                    if (editing && !busy && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); const step = e.shiftKey ? 8 : 24; movePerson(p.id, { x: point.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0), y: point.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0) }); }
                  }} onPointerDown={e => { e.stopPropagation(); dragged.current = false; if (!editing || busy) return; e.currentTarget.setPointerCapture(e.pointerId); pointer.current = { id: p.id, start: { x: e.clientX, y: e.clientY }, origin: point }; }}>
                    <title>{p.full_name} · {p.position} · {companyName(p.company_id)}</title>
                    <rect className={styles.nodeRect} width={NODE_WIDTH} height={NODE_HEIGHT} rx="12" fill="white" stroke={selectedNode ? '#087f78' : '#d8e2e8'} strokeWidth={selectedNode ? 2.5 : 1.2}/>
                    <circle cx="31" cy="33" r="19" fill={profile.teams.includes('ISO') ? '#f1ebfb' : '#e5f3f0'}/><text x="31" y="38" textAnchor="middle" fill={profile.teams.includes('ISO') ? '#70549c' : '#227467'} fontSize="12" fontWeight="600">{initials(p.full_name)}</text>
                    <text x="59" y="29" fontSize="15" fill="#203543" fontWeight="600">{short(p.full_name, 25)}</text><text x="59" y="52" fontSize="13" fill="#647681">{short(p.position || 'ยังไม่ระบุตำแหน่ง', 28)}</text>
                    <path d="M 16 74 H 264" stroke="#eef2f4"/><text x="16" y="96" fontSize="12" fill="#526c7b">{p.company_id.toUpperCase()}</text><text x="264" y="96" textAnchor="end" fontSize="12" fill="#68798a">{short(profile.teams.join(' / ') || 'ยังไม่จัดทีม', 27)}</text>
                    {draft[p.id] && <circle cx="266" cy="14" r="4" fill="#db8a20"/>}
                  </g>;
                })}
              </g>
            </svg>
            <div className={styles.canvasTitle}><span>{focusId ? 'สายรายงานที่เชื่อมกับ' : 'โครงสร้างทีม'}</span><strong>{focusId ? byId.get(focusId)?.full_name : company ? companyName(company) : 'กลุ่มบริษัท EA'}</strong></div>
            <div className={styles.zoomControls}><button aria-label="ย่อผัง" onClick={() => zoom(camera.scale - .1)}><Minus size={17}/></button><button title="ขนาดจริง 100%" onClick={() => zoom(1)}>{Math.round(camera.scale * 100)}%</button><button aria-label="ขยายผัง" onClick={() => zoom(camera.scale + .1)}><Plus size={17}/></button><i/><button aria-label="แสดงผังทั้งหมด" title="แสดงผังทั้งหมด" onClick={fit}><Expand size={17}/></button></div>
            <div className={styles.panHint}><Move size={13}/>{editing ? 'ลากการ์ดเพื่อจัดตำแหน่ง' : 'ลากพื้นที่ว่างเพื่อเลื่อน'}</div>
          </div>
          <footer className={styles.canvasFooter}><span><i/>สายบังคับบัญชา</span><span><i className={styles.functionalLine}/>สายวิชาชีพ</span><span>{chartPeople.length} ระเบียน · {chart.edges.length} เส้น{dirtyCount > 0 ? ` · ${dirtyCount} ตำแหน่งยังไม่บันทึก` : ''}</span></footer>
        </div>}
      </div>
      {selected && selectedProfile && <aside className={styles.inspector} aria-label={`รายละเอียด ${selected.full_name}`} onKeyDown={e => { if (e.key === 'Escape') setSelectedId(null); }}>
        <div className={styles.inspectorTop}><span>รายละเอียดบุคลากร</span><button aria-label="ปิดรายละเอียดบุคลากร" onClick={() => setSelectedId(null)}><X size={18}/></button></div>
        <div className={styles.personHero}><span className={`${styles.avatar} ${styles.largeAvatar}`}>{initials(selected.full_name)}</span><h2>{selected.full_name}</h2><p>{selected.position || 'ยังไม่ระบุตำแหน่ง'}</p><div>{selectedProfile.teams.map(t => <span key={t} className={styles.tag}>{t}</span>)}</div></div>
        <dl className={styles.personFacts}><div><dt>บริษัทหลัก</dt><dd>{companyName(selected.company_id)}</dd></div><div><dt>สถานะ</dt><dd>{STATUS[selectedProfile.status]}</dd></div>{selectedProfile.company_ids.length > 1 && <div><dt>บริษัทที่รับผิดชอบ</dt><dd>{selectedProfile.company_ids.map(companyName).join(' · ')}</dd></div>}</dl>
        <div className={styles.relationships}><h3>รายงานต่อ</h3>{(['direct_manager','functional_manager'] as const).map(type => {
          const manager = byId.get(selectedProfile[type]);
          return <div key={type}><span className={styles.relationshipLabel}><i className={type === 'functional_manager' ? styles.functionalLine : ''}/>{modeLabels[type]}</span>{manager ? <button onClick={() => selectPerson(manager.id)}><span>{manager.full_name}<small>{manager.position}</small></span><ChevronRight size={15}/></button> : <p>{selectedProfile[type] ? 'บุคคลอยู่นอกชุดข้อมูลนี้' : 'ยังไม่ระบุผู้บังคับบัญชา'}</p>}</div>;
        })}</div>
        <div className={styles.relationships}><h3>ผู้ที่รายงานต่อบุคคลนี้</h3>{people.filter(p => { const pr = profiles.get(p.id); return pr?.direct_manager === selected.id || pr?.functional_manager === selected.id; }).map(p => <button key={p.id} onClick={() => selectPerson(p.id)}><span>{p.full_name}<small>{p.company_id.toUpperCase()}</small></span><ChevronRight size={15}/></button>)}{!people.some(p => profiles.get(p.id)?.direct_manager === selected.id || profiles.get(p.id)?.functional_manager === selected.id) && <p>ยังไม่มีสายรายงานที่เชื่อมเข้ามา</p>}</div>
        <div className={styles.inspectorActions}><button onClick={() => focusPerson(selected.id)}><Focus size={16}/>ดูสายรายงานที่เกี่ยวข้อง</button><button className={styles.primaryButton} onClick={() => onEdit(selected)}><Pencil size={15}/>แก้ไขข้อมูล / สายรายงาน</button></div>
      </aside>}
    </div>
  </section>;
}
