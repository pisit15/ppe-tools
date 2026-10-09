const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { createDb } = require('./chemical-db-fixture.cjs');
const catalog = require('../data/chemical-legal/catalog-2026-10-09.json');
const cache = new Map();
function load(file) {
  const filename = path.join(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); m.paths = Module._nodeModulePaths(path.dirname(filename)); cache.set(filename, m);
  const native = m.require.bind(m);
  m.require = p => p.startsWith('.') && fs.existsSync(path.resolve(path.dirname(filename), p) + '.ts') ? load(path.relative(path.join(__dirname, '..'), path.resolve(path.dirname(filename), p) + '.ts')) : native(p);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
  return m.exports;
}
const { normalizeCas, searchLegalCatalog, checkLegalCatalog, parseLegalContext, evaluateObligations } = load('src/lib/chemical/legal/engine.ts');
const { EMPTY_LEGAL_CONTEXT } = load('src/lib/chemical/legal/types.ts');

test('CAS requires an intact identifier and checksum; never repairs Excel numbers or multiple ingredients', () => {
  assert.equal(normalizeCas(' 67–64–1 '), '67-64-1');
  for (const input of ['67641', 67641, '67-64-2', '95-53--4', '67-64-1,108-88-3', '', null]) assert.equal(normalizeCas(input), null);
  assert.equal(searchLegalCatalog(catalog, '67641').invalidCas, true);
});
test('name search yields candidates; conflicts preserve source CAS and cannot become a verified match', () => {
  assert.ok(searchLegalCatalog(catalog, 'acetone').candidates.some(c => c.cas === '67-64-1'));
  const conflict = checkLegalCatalog(catalog, '504-29-0').entries.find(e => e.category === 'labour');
  assert.equal(conflict.source_cas, '95-53--4');
  assert.equal(conflict.review_state, 'conflict');
  assert.equal(checkLegalCatalog(catalog, '504-29-0').counts.labour.verified, 0);
});
test('repeal belongs to a legal list entry, not every use of the same chemical', () => {
  const entries = checkLegalCatalog(catalog, '67-56-1').entries;
  assert.ok(entries.some(e => e.id === 'hazard-4.1-159-v1' && e.legal_status === 'repealed'));
  assert.ok(entries.some(e => e.id === 'hazard-4.1-157-v3' && e.legal_status === 'active'));
  assert.ok(entries.some(e => e.id === 'hazard-5.1-321-v1' && e.legal_status === 'active'));
});
test('amendment 8 preserves history and removes the former cyanide concentration condition', () => {
  const entries = checkLegalCatalog(catalog, '143-33-9').entries.filter(e => e.category === 'hazard');
  const current = entries.find(e => e.legal_status === 'active');
  assert.equal(current.hazardous_type, 3);
  assert.equal(current.effective_from, '2025-07-08');
  assert.ok(!current.conditions.includes('1%'));
  assert.ok(entries.some(e => e.legal_status === 'superseded' && e.conditions.includes('1%')));
  const no8 = catalog.entries.filter(e => e.source_id === 'no8');
  assert.equal(no8.length, 21);
  assert.equal(no8.filter(e => e.legal_status === 'repealed').length, 2);
});
test('OEL averaging duration and ceiling stay separate, including Toluene ten-minute peak', () => {
  const limit = checkLegalCatalog(catalog, '108-88-3').entries.find(e => e.category === 'exposure');
  assert.equal(limit.details.twa, '200 ppm'); assert.equal(limit.details.short, '500 ppm');
  assert.equal(limit.details.duration, '10 min'); assert.equal(limit.details.ceiling, '300 ppm');
  const mercaptan = checkLegalCatalog(catalog, '75-08-1').entries.find(e => e.category === 'exposure');
  assert.equal(mercaptan.details.twa, '-'); assert.equal(mercaptan.details.ceiling, '10 ppm');
});
test('reporting needs a verified entry, scope, half-year and possession evidence; absence never means exempt', () => {
  const check = checkLegalCatalog(catalog, '67-64-1');
  const report = context => evaluateObligations(check, { ...EMPTY_LEGAL_CONTEXT, ...context }).find(o => o.category === 'reporting');
  assert.equal(report({}).status, 'conditional');
  assert.equal(report({ reporting_scope: 'in', possessed_100kg: 'yes' }).status, 'conditional');
  assert.equal(report({ reporting_scope: 'in', possessed_100kg: 'yes', reporting_period: '2569-1' }).status, 'action');
  assert.equal(report({ reporting_scope: 'in', possessed_100kg: 'no', reporting_period: '2569-1' }).status, 'not_triggered');
  for (const obligation of evaluateObligations(checkLegalCatalog(catalog, '7732-18-5'), { ...EMPTY_LEGAL_CONTEXT, reporting_scope: 'in', possessed_100kg: 'yes', reporting_period: '2569-1' })) assert.notEqual(obligation.status, 'action');
});
test('context rejects unknown enum, invalid percentage and missing concentration units', () => {
  assert.deepEqual(parseLegalContext(EMPTY_LEGAL_CONTEXT), EMPTY_LEGAL_CONTEXT);
  for (const change of [{ concentration: '101', concentration_unit: '%w/w' }, { concentration: '75' }, { concentration: 'NaN' }, { reporting_scope: 'yes' }, { reporting_period: '2026-3' }]) assert.throws(() => parseLegalContext({ ...EMPTY_LEGAL_CONTEXT, ...change }));
});
test('release completeness and source references are checked, with all canonical CAS checksums valid', () => {
  assert.equal(catalog.release.entry_count, catalog.entries.length);
  for (const [category, count] of [['labour', 1516], ['reporting', 206], ['exposure', 324]]) assert.equal(catalog.entries.filter(e => e.category === category).length, count);
  for (const entry of catalog.entries) {
    assert.ok(catalog.sources.some(s => s.id === entry.source_id), entry.id);
    for (const cas of entry.cas_numbers) assert.equal(normalizeCas(cas), cas, entry.id);
    for (const source of entry.details.related_sources || []) assert.ok(catalog.sources.some(s => s.id === source), entry.id);
  }
});
test('database enforces tenant relation, immutable application references/snapshots, and denies direct client access', async () => {
  const db = await createDb();
  try {
    assert.equal((await db.query('select count(*)::int as n from chem_legal_entries')).rows[0].n, catalog.release.entry_count);
    const sql = `insert into chem_legal_assessments(company_id,substance_id,cas,release_id,review_status,review_note,actor_id,actor_name,snapshot) values ($1,$2,'67-64-1',$3,'pending','','actor','Reviewer','{}')`;
    await assert.rejects(db.query(sql, ['aab','11111111-1111-4111-8111-111111111111',catalog.release.id]), /foreign key/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      for (const table of ['chem_legal_releases','chem_legal_sources','chem_legal_entries','chem_legal_assessments']) await assert.rejects(db.query('select * from ' + table), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await db.query(sql, ['amt','11111111-1111-4111-8111-111111111111',catalog.release.id]);
    await assert.rejects(db.query("update chem_legal_assessments set review_note='tampered'"), /permission denied/);
    await assert.rejects(db.query("update chem_legal_entries set review_state='verified'"), /permission denied/);
    assert.equal((await db.query('select count(*)::int as n from chem_legal_assessments')).rows[0].n, 1);
  } finally { await db.close(); }
});
