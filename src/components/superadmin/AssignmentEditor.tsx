'use client';

import { useMemo, useState } from 'react';
import { Building2, ChevronDown, Eye, Plus, Trash2 } from 'lucide-react';
import { type Member, type Profile } from '@/lib/team-management';
import { ASSIGNMENT_KINDS, assignmentLabel, assignmentNodes, assignmentsFor, assignmentState, assignmentStateLabel, bangkokDate, withAssignments, type Assignment } from '@/lib/team-assignments';
import { Field, inputClass } from './ui';
import styles from './assignment-editor.module.css';

type Props = { member: Member; profile: Profile; people: Member[]; profiles: Map<string, Profile>; companies: { company_id: string; company_name: string }[]; disabled: boolean; onChange: (profile: Profile) => void };
export default function AssignmentEditor({ member, profile, people, profiles, companies, disabled, onChange }: Props) {
  const [openId, setOpenId] = useState(member.id);
  const [preview, setPreview] = useState(false);
  const assignments = assignmentsFor(member, profile);
  const savedIds = new Set(profiles.get(member.id)?.assignments?.map(a => a.id));
  const nodes = useMemo(() => assignmentNodes(people, profiles).nodes, [people, profiles]);
  const companyName = (id: string) => companies.find(c => c.company_id === id)?.company_name || id.toUpperCase();
  const commit = (next: Assignment[]) => onChange(withAssignments(member, profile, next, people, profiles));
  function update(id: string, patch: Partial<Assignment>) { commit(assignments.map(a => a.id === id ? { ...a, ...patch } : a)); }
  function add() {
    const id = crypto.randomUUID();
    commit([...assignments, { id, company_id: '', position: '', kind: 'acting', start_date: bangkokDate(), end_date: '', direct_manager: '', functional_manager: '', x: null, y: null }]);
    setOpenId(id); setPreview(false);
  }
  return <fieldset disabled={disabled} className={styles.editor}>
    <div className={styles.heading}><div><h3>การมอบหมายงานในแต่ละบริษัท</h3><p>1 คน · {assignments.length} บทบาท · เลือกสายรายงานแยกตามหน้าที่</p></div><button type="button" className={styles.outlineButton} aria-pressed={preview} onClick={() => setPreview(!preview)}><Eye size={16}/>{preview ? 'กลับไปแก้ไข' : 'ดูตัวอย่าง'}</button></div>
    <p className={styles.explainer}>งานหลักใช้บริษัทและตำแหน่งจากประวัติด้านบน เพิ่มงานรักษาการหรือหน้าที่เพิ่มเติมได้หลายบริษัท โดยไม่สร้างบุคลากรซ้ำ</p>
    <div className={styles.roles}>{assignments.map((a, index) => {
      const state = assignmentState(a, bangkokDate());
      const primary = a.kind === 'primary';
      const locked = savedIds.has(a.id);
      const current = openId === a.id;
      return <article key={a.id} className={`${styles.role} ${current ? styles.openRole : ''}`}>
        <button type="button" className={styles.roleHeader} aria-expanded={current || preview} onClick={() => setOpenId(current ? '' : a.id)}>
          <span className={styles.companyIcon}><Building2 size={19}/></span><span className={styles.roleTitle}><strong>{a.company_id ? companyName(a.company_id) : 'เลือกบริษัทที่มอบหมายงาน'}</strong><span>{a.position || 'ระบุตำแหน่ง'}</span></span>
          <span className={a.kind === 'acting' ? styles.actingBadge : styles.badge}>{ASSIGNMENT_KINDS[a.kind]}</span><span className={styles.state}>{assignmentStateLabel[state]}</span><ChevronDown size={16}/>
        </button>
        {preview ? <div className={styles.preview}>
          <strong>{member.full_name || 'ชื่อบุคลากร'}</strong><p>{a.position || 'ยังไม่ระบุตำแหน่ง'} · {a.company_id.toUpperCase() || 'ยังไม่เลือกบริษัท'}</p>{!primary && <p>สังกัดหลัก {member.company_id.toUpperCase()}</p>}
          <p>{primary ? 'งานหลักตามประวัติบุคลากร' : `${a.start_date || 'ยังไม่ระบุวันเริ่ม'} — ${a.end_date || 'ไม่กำหนดวันสิ้นสุด'}`}</p>
          {(['direct_manager', 'functional_manager'] as const).map(field => <p key={field}>{field === 'direct_manager' ? 'ผู้บังคับบัญชาสายตรง' : 'ผู้กำกับสายวิชาชีพ'}: {nodes.find(n => n.id === a[field]) ? assignmentLabel(nodes.find(n => n.id === a[field])!) : a[field] ? 'ไม่พบบทบาทที่อ้างถึง' : 'ยังไม่กำหนด'}</p>)}
        </div> : current && <div className={styles.roleBody}>
          {!primary && <div className={styles.grid}>
            <Field label={`บริษัทของบทบาท ${index + 1}`}><select className={inputClass} value={a.company_id} disabled={locked} onChange={e => update(a.id, { company_id: e.target.value })}><option value="">เลือกบริษัท</option>{companies.map(c => <option key={c.company_id} value={c.company_id}>{c.company_name || c.company_id}</option>)}</select></Field>
            <Field label={`ประเภทบทบาท ${index + 1}`}><select className={inputClass} disabled={locked} value={a.kind} onChange={e => update(a.id, { kind: e.target.value as Assignment['kind'] })}><option value="acting">รักษาการ</option><option value="additional">งานเพิ่มเติม</option></select></Field>
            <div className={styles.fullWidth}><Field label={`ตำแหน่งของบทบาท ${index + 1}`}><input className={inputClass} maxLength={2000} value={a.position} placeholder="ตำแหน่งตามที่ได้รับมอบหมาย" onChange={e => update(a.id, { position: e.target.value })}/></Field></div>
            <Field label={`วันที่เริ่มบทบาท ${index + 1}`}><input type="date" className={inputClass} value={a.start_date} onChange={e => update(a.id, { start_date: e.target.value })}/></Field>
            <Field label={`วันที่สิ้นสุดบทบาท ${index + 1}`} hint="เว้นว่างได้หากยังไม่กำหนด"><input type="date" className={inputClass} min={a.start_date || undefined} value={a.end_date} onChange={e => update(a.id, { end_date: e.target.value })}/></Field>
          </div>}
          <div className={styles.grid}>{(['direct_manager', 'functional_manager'] as const).map(field => {
            const manager = nodes.find(n => n.id === a[field]);
            const referenceDate = a.start_date > bangkokDate() ? a.start_date : bangkokDate();
            const managerState = manager ? assignmentState(manager.assignment, referenceDate) : null;
            return <div key={field}><Field label={`${field === 'direct_manager' ? 'ผู้บังคับบัญชาสายตรง' : 'ผู้กำกับสายวิชาชีพ'} · บทบาท ${index + 1}`}><select className={inputClass} value={a[field]} onChange={e => update(a.id, { [field]: e.target.value })}>
              <option value="">ยังไม่กำหนด</option>{a[field] && !manager && <option value={a[field]}>ไม่พบบทบาทที่อ้างถึง — กรุณาเลือกใหม่</option>}
              {[...companies].sort((x, y) => Number(y.company_id === a.company_id) - Number(x.company_id === a.company_id)).map(c => {
                const choices = nodes.filter(n => n.person_id !== member.id && n.company_id === c.company_id);
                return choices.length ? <optgroup key={c.company_id} label={`${companyName(c.company_id)}${c.company_id === a.company_id ? ' · บริษัทเดียวกัน' : ''}`}>{choices.map(n => <option key={n.id} value={n.id}>{assignmentLabel(n)}{assignmentState(n.assignment, referenceDate) !== 'active' ? ` · ${assignmentStateLabel[assignmentState(n.assignment, referenceDate)]}` : ''}{!n.is_active ? ' · พ้นสถานะทำงาน' : ''}</option>)}</optgroup> : null;
              })}
            </select></Field>{managerState && managerState !== 'active' && <p className={styles.warning}>บทบาทผู้บังคับบัญชา{assignmentStateLabel[managerState]} ณ {referenceDate} โปรดตรวจผู้รับช่วงต่อ</p>}{manager && !manager.is_active && <p className={styles.warning}>ผู้บังคับบัญชาพ้นสถานะทำงานแล้ว โปรดตรวจผู้รับช่วงต่อ</p>}</div>;
          })}</div>
          {!primary && <div className={styles.roleFooter}>{locked ? <p>บันทึกแล้ว · เมื่อต้องการเปลี่ยนบริษัทหรือประเภท ให้สิ้นสุดบทบาทนี้แล้วเพิ่มรายการใหม่</p> : <button type="button" className={styles.removeButton} onClick={() => { commit(assignments.filter(row => row.id !== a.id)); setOpenId(member.id); }}><Trash2 size={14}/>นำแบบร่างนี้ออก</button>}</div>}
        </div>}
      </article>;
    })}</div>
    <button type="button" className={styles.addButton} onClick={add} disabled={assignments.length >= 100}><Plus size={17}/>เพิ่มการมอบหมายงาน</button>
    <p className={styles.explainer}>การเปลี่ยนแปลงจะมีผลเมื่อกด “บันทึกบุคลากร” · ป้ายรักษาการแสดงประเภทหน้าที่ ส่วนเส้นทึบและเส้นประแสดงประเภทสายรายงาน</p>
  </fieldset>;
}
