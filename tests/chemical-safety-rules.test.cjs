// Storage-class suggestion (DIW 23-class scheme, derived from the German VCI / TRGS 510 concept).
// Reference cases use well-known substances and the class printed on supplier SDS section 7.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { suggestStorageClass } = require('../src/lib/chemical/ghs.ts');

const cls = input => suggestStorageClass(input)?.code ?? null;

test('flammable liquids stay class 3 even when acutely toxic (methanol, triethylamine)', () => {
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H225', 'H301', 'H311', 'H331', 'H370'], ghs_pictograms: ['GHS02', 'GHS06', 'GHS08'], flash_point_c: 11 }), '3A');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H225', 'H302', 'H311', 'H314', 'H331'], ghs_pictograms: ['GHS02', 'GHS05', 'GHS06'], flash_point_c: -11 }), '3A');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H225', 'H319', 'H336'], flash_point_c: -20 }), '3A');
});

test('flash point 60–93 °C or H227 → 3B; above 93 °C → 10 (not 12)', () => {
  assert.equal(cls({ physical_state: 'liquid', flash_point_c: 75 }), '3B');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H227'] }), '3B');
  assert.equal(cls({ physical_state: 'liquid', flash_point_c: 220 }), '10');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H304'], flash_point_c: 180 }), '10');
  assert.equal(cls({ physical_state: 'liquid' }), '12');
});

test('oxidizers, toxics and corrosives', () => {
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H271', 'H302', 'H318'] }), '5.1A');
  assert.equal(cls({ physical_state: 'solid', h_codes: ['H272', 'H301'], ghs_pictograms: ['GHS03'] }), '5.1B');
  assert.equal(cls({ physical_state: 'solid', h_codes: ['H300', 'H310', 'H330'], ghs_pictograms: ['GHS06'] }), '6.1B');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H301'], flash_point_c: 150 }), '6.1A');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H314', 'H290'] }), '8B');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H314'], flash_point_c: 120 }), '8A');
});

test('gases, aerosols, reactive and peroxide classes keep precedence', () => {
  assert.equal(cls({ physical_state: 'aerosol', h_codes: ['H222', 'H229'] }), '2B');
  assert.equal(cls({ physical_state: 'gas', h_codes: ['H220', 'H280'] }), '2A');
  assert.equal(cls({ physical_state: 'solid', h_codes: ['H260', 'H314'] }), '4.3');
  assert.equal(cls({ physical_state: 'liquid', h_codes: ['H242', 'H226'], ghs_pictograms: ['GHS02'] }), '5.2');
  assert.equal(cls({ physical_state: 'solid', h_codes: ['H228'] }), '4.1B');
});

const { labelProblems } = require('../src/lib/chemical/label.ts');
const draft = over => ({ name: 'Methanol', identity: '', pictograms: ['GHS02', 'GHS06'], ppe: [], signal: 'Danger', hazards: 'H225 ของเหลวไวไฟสูง\nH301 เป็นพิษเมื่อกลืนกิน', precautions: 'P210 เก็บให้ห่างจากความร้อน', supplier: 'ACME Chemicals', emergency: '', contents: '', extra: '', demo: false, sdsUrl: '', ...over });

test('GHS label completeness: complete label passes', () => {
  assert.deepEqual(labelProblems(draft({})), []);
});
test('GHS label completeness: missing H text, wrong signal word, missing supplier are blocked', () => {
  assert.equal(labelProblems(draft({ hazards: '' })).length, 1);
  assert.match(labelProblems(draft({ signal: 'Warning' }))[0], /Danger/);
  assert.match(labelProblems(draft({ signal: 'None', hazards: 'H319 ระคายเคืองตา', pictograms: [] }))[0], /Warning/);
  assert.match(labelProblems(draft({ supplier: ' ' }))[0], /ผู้ผลิต/);
  assert.deepEqual(labelProblems(draft({ signal: 'None', pictograms: [], hazards: '', precautions: '' })), []);
});
