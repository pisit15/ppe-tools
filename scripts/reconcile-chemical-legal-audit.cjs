// Reuse the dated audit's evidence; never promote every imported row indiscriminately.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const dir = path.join(root, 'data/chemical-legal');
const base = JSON.parse(fs.readFileSync(path.join(dir, 'catalog-2026-10-09.json'), 'utf8'));
const proof = JSON.parse(fs.readFileSync(path.join(dir, 'audit-evidence-2026-10-09.json'), 'utf8'));
const next = structuredClone(base);
const clean = value => String(value ?? '').replaceAll('\\n', ' ').replace(/\s+/g, ' ').trim();
const cas = value => {
  const text = clean(value);
  if (!/^\d{2,7}-\d{2}-\d$/.test(text)) return null;
  const digits = text.replaceAll('-', '');
  return [...digits.slice(0, -1)].reverse().reduce((n, d, i) => n + Number(d) * (i + 1), 0) % 10 === Number(digits.at(-1)) ? text : null;
};
const groups = {};
const patches = [];
function verify(entry, method, note, fields) {
  entry.review_state = 'verified';
  entry.details.note = note;
  entry.details.verification = { method, checked_on: proof.checked_on, fields };
  (groups[method] ||= []).push(entry.id);
}
const exposures = new Map();
let current;
for (const page of proof.exposure) for (const table of page.tables) for (const row of table) {
  if (/^\d+$/.test(String(row[0] || '')) && row.length >= 8) {
    current = { page: page.page, row, subsidiary: false };
    exposures.set(Number(row[0]), current);
  } else if (current && row.slice(-4).some(v => /^\s*\d+(\.\d+)?\s*(ppm|mg|f\/)/.test(String(v || '')))) current.subsidiary = true;
}
for (const entry of next.entries) {
  if (entry.category === 'labour' && entry.review_state !== 'verified') {
    const row = proof.labour.find(r => 'labour-' + r[0] === entry.id);
    assert(row, 'Missing prior labour audit: ' + entry.id);
    assert.equal(clean(row[2]), clean(entry.name));
    assert.equal(clean(row[4]), clean(entry.source_cas));
    assert.equal(row[6], entry.source_page);
    if (row[5] !== 'ตรงข้อความต้นฉบับ') continue;
    const number = cas(entry.source_cas);
    const spaced = /^\d{2,7}\s*-\s*\d{2}\s*-\s*\d$/.test(clean(entry.source_cas)) ? cas(clean(entry.source_cas).replace(/\s/g, '')) : null;
    if (number || spaced) {
      entry.cas_numbers = [number || spaced];
      verify(entry, 'prior-labour-audit', 'ยืนยันชื่อ เลข CAS และลำดับบัญชีจากผลตรวจต้นฉบับ 9 ตุลาคม 2569 แล้ว', ['name', 'source_cas', 'list_ref', 'source_page']);
    } else if (!entry.source_cas && !entry.cas_numbers.length) {
      verify(entry, 'prior-labour-group-audit', 'ยืนยันรายการตามบัญชีแล้ว ต้นฉบับไม่ระบุ CAS เดี่ยว จึงค้นจากชื่อและขอบเขตกลุ่มสาร', ['name', 'list_ref', 'source_page', 'no_single_cas']);
    }
  }
  if (entry.category === 'exposure' && entry.review_state === 'pending') {
    const source = exposures.get(Number(entry.id.split('-')[1]));
    assert(source, 'Missing exposure evidence: ' + entry.id);
    const values = source.row.slice(-5).map(clean);
    assert.equal(source.page, entry.source_page);
    assert.equal(clean(source.row.slice(1, -5).filter(Boolean).join(' / ')), clean(entry.name));
    assert.equal(values[0], clean(entry.source_cas));
    const keys = ['twa', 'short', 'duration', 'ceiling'];
    keys.forEach((key, i) => assert.equal(values[i + 1], clean(entry.details[key])));
    const numbers = values[0] ? values[0].split(/,\s*/).map(cas) : [];
    const limit = value => value === '-' || /^\d+(\.\d+)? (ppm|mg\/m3|f\/cm3)$/.test(value);
    const time = value => value === '-' || /^\d+(\.\d+)? min( in any \d+ hr)?$/.test(value);
    if (!source.subsidiary && numbers.every(Boolean) && limit(values[1]) && limit(values[2]) && time(values[3]) && limit(values[4]) && [values[1], values[2], values[4]].some(v => /^\d/.test(v))) {
      if (entry.cas_numbers.length) assert.deepEqual([...entry.cas_numbers].sort(), [...numbers].sort());
      entry.cas_numbers = numbers;
      verify(entry, 'prior-exposure-table-audit', 'ยืนยันชื่อ CAS หน่วย และตำแหน่งคอลัมน์ค่าขีดจำกัดกับตารางต้นฉบับที่ตรวจไว้แล้ว', ['name', 'source_cas', 'source_page', 'twa', 'short', 'duration', 'ceiling']);
    }
  }
  if (entry.category === 'reporting' && entry.review_state === 'pending') {
    const row = proof.reporting.find(r => `reporting-${r.account}-${r.id}` === entry.id);
    assert(row, 'Missing reporting evidence: ' + entry.id);
    assert.equal(row.page, entry.source_page);
    assert.equal(clean(row.name), clean(entry.name));
    const identities = proof.hazard_identity.filter(h => h.account === row.account && h.id === row.id && clean(h.cas) === clean(entry.source_cas));
    // Repeated amendments, group exceptions and absent CAS need their own mapping evidence.
    if (identities.length === 1 && cas(entry.source_cas)) {
      verify(entry, 'prior-reporting-account-audit', 'ยืนยันการมีชื่อในบัญชี วอ./อก.7 และการจับคู่ CAS ผ่านเลขบัญชี/ลำดับจากผลตรวจเดิมแล้ว; หน้าที่รายงานยังขึ้นกับเงื่อนไขและปริมาณ', ['name', 'list_ref', 'source_page', 'source_cas']);
    }
  }
}
const id = 'th-chemical-2026-10-09-v2';
next.release = { ...next.release, id, label: 'ข้อมูลกฎหมาย 9 ตุลาคม 2569 — รวมผลตรวจเดิม', is_current: true };
const counts = category => next.entries.filter(e => e.category === category && e.review_state === 'verified').length;
next.release.coverage.labour = `บัญชี 1,516 รายการ; ยืนยันจากผลตรวจเดิม ${counts('labour')} รายการ แยก CAS ที่ขัดแย้งจริงออกจากกลุ่มที่ต้นฉบับไม่ระบุ CAS`;
next.release.coverage.reporting = `บัญชี 206 รายการ; ยืนยันชื่อและการจับคู่ CAS ${counts('reporting')} รายการ กลุ่มสาร/ข้อยกเว้นและรายการแก้ไขที่ยังจับคู่ไม่ครบแสดงแยก`;
next.release.coverage.exposure = `324 ลำดับหลัก; ยืนยันชื่อ CAS หน่วยและคอลัมน์ค่าขีดจำกัด ${counts('exposure')} รายการ ส่วนรายการย่อย/ข้อความผิดปกติระบุจุดที่ยังขาด`;
next.release.gaps[0] = 'ใช้ผลตรวจเดิมในรายการที่มีหลักฐานแล้ว; รายการที่ข้อมูลขัดแย้งหรือหลักฐานยังไม่ครบระบุแยก การไม่พบไม่ใช่ข้อยกเว้นกฎหมาย';
for (let i = 0; i < next.entries.length; i++) {
  const entry = next.entries[i];
  const before = base.entries[i];
  if (JSON.stringify(entry) !== JSON.stringify(before)) patches.push({ id: entry.id, review_state: entry.review_state, cas_numbers: entry.cas_numbers, details: entry.details });
  entry.release_id = id;
}
assert.equal(next.entries.length, 2089);
const stateCounts = next.entries.reduce((a, e) => (a[e.review_state] = (a[e.review_state] || 0) + 1, a), {});
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const j = value => q(JSON.stringify(value)) + '::jsonb';
let sql = `-- Reconcile verified prior audit into a new immutable reference release.\nDO $migration$\nBEGIN\nIF (SELECT count(*) FROM public.chem_legal_entries WHERE release_id=${q(base.release.id)}) <> 2089 THEN RAISE EXCEPTION 'Incomplete previous legal release'; END IF;\n`;
sql += `INSERT INTO public.chem_legal_releases(id,label,checked_on,entry_count,is_current,coverage,gaps) VALUES (${q(id)},${q(next.release.label)},'2026-10-09',2089,false,${j(next.release.coverage)},${j(next.release.gaps)});\n`;
sql += `INSERT INTO public.chem_legal_sources SELECT ${q(id)},id,title,url,note,checked_on FROM public.chem_legal_sources WHERE release_id=${q(base.release.id)};\n`;
sql += `INSERT INTO public.chem_legal_entries SELECT ${q(id)},id,category,name,aliases,cas_numbers,source_cas,agency,list_ref,revision,source_id,source_page,hazardous_type,conditions,review_state,legal_status,effective_from,effective_to,details FROM public.chem_legal_entries WHERE release_id=${q(base.release.id)};\n`;
for (const [method, ids] of Object.entries(groups)) {
  const sample = next.entries.find(e => e.id === ids[0]);
  sql += `UPDATE public.chem_legal_entries SET review_state='verified', details=details || ${j({note: sample.details.note, verification: sample.details.verification})} WHERE release_id=${q(id)} AND id=ANY(ARRAY[${ids.map(q).join(',')}]);\n`;
}
for (const patch of patches) {
  const before = base.entries.find(e => e.id === patch.id);
  if (JSON.stringify(before.cas_numbers) !== JSON.stringify(patch.cas_numbers)) sql += `UPDATE public.chem_legal_entries SET cas_numbers=ARRAY[${patch.cas_numbers.map(q).join(',')}]::text[] WHERE release_id=${q(id)} AND id=${q(patch.id)};\n`;
}
sql += `IF (SELECT count(*) FROM public.chem_legal_entries WHERE release_id=${q(id)} AND review_state='verified') <> ${stateCounts.verified} THEN RAISE EXCEPTION 'Audit reconciliation count mismatch'; END IF;\nUPDATE public.chem_legal_releases SET is_current=false WHERE is_current;\nUPDATE public.chem_legal_releases SET is_current=true WHERE id=${q(id)};\nEND $migration$;\n`;
fs.writeFileSync(path.join(dir, 'catalog-2026-10-09-v2.json'), JSON.stringify(next, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'audit-reconciliation-2026-10-09.json'), JSON.stringify({ previous_release: base.release.id, release: id, source_artifacts: proof.sources, counts: stateCounts, groups, remaining: next.entries.filter(e => e.review_state !== 'verified').map(e => ({ id:e.id, state:e.review_state, reason:e.category === 'exposure' ? 'Subsidiary rows, units or chemical identity require separate evidence' : e.category === 'reporting' ? 'Amendment/group/exception CAS mapping requires separate evidence' : 'Printed CAS fails identity validation' })) }, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'supabase/migrations/20261009084432_chemical_legal_audit_reconciliation.sql'), sql);
console.log(JSON.stringify({ release: id, changed: patches.length, counts: stateCounts, groups: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length])), sql_bytes: Buffer.byteLength(sql) }));
