const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = {};
function load(name) {
  if (cache[name]) return cache[name].exports;
  const module = { exports: {} }; cache[name] = module;
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/procurement', name + '.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('module', 'exports', 'require', js)(module, module.exports, name => load(name.slice(2)));
  return module.exports;
}
const { previewImport } = load('import-preview');
const fixture = () => ({
  sync: { Buyer: {
    prs: [{ id: 1, name: 'PR-1', state: 'done', po_ids: [10], line_count: 1 }],
    lines: [{ id: 2, request_id: [1, 'PR-1'], name: 'Glove', product_qty: 2 }],
    pos: [{ id: 10, name: 'PO-10', amount_untaxed: 100 }], att: [],
  } },
  po: [{ id: 3, order_id: [10, 'PO-10'], name: 'Glove', product_qty: 2, price_unit: 50, price_subtotal: 100 }],
  quotes: { quotes: [{ quote_id: 4, pr: 'PR-1', person: 'Buyer', file: 'offer.pdf' }], items: [{ quote_id: 4, pr: 'PR-1', name: 'Glove' }] },
});
const preview = (fixture, withQuotes = false) => previewImport(JSON.stringify(fixture.sync), JSON.stringify(fixture.po), withQuotes ? JSON.stringify(fixture.quotes) : null);

test('validates Windows BOM files and leaves quotation tables excluded when no quotation file is selected', () => {
  const f = fixture();
  const result = previewImport('\ufeff' + JSON.stringify(f.sync), JSON.stringify(f.po), null);
  assert.equal(result.rows.proc_pr.length, 1);
  assert.equal(result.rows.proc_po_lines.length, 1);
  assert.equal(result.hasQuotes, false);
  assert.deepEqual(result.rows.proc_quotes, []);
  assert.equal(preview(f, true).hasQuotes, true);
});

test('refuses incomplete snapshots before upserts: empty PR/line/PO/quotation tables and orphan PO data', () => {
  for (const mutate of [
    f => { f.sync.Buyer.prs = []; },
    f => { f.sync.Buyer.lines = []; },
    f => { f.po = []; },
    f => { f.po[0].order_id = [99, 'ORPHAN']; },
    f => { f.quotes.items = []; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => preview(f, true), /ว่าง/);
  }
});

test('refuses invalid and duplicate identifiers instead of partially updating the database', () => {
  const invalid = fixture(); invalid.po[0].id = '3';
  assert.throws(() => preview(invalid), /รหัสรายการไม่ถูกต้อง/);
  const duplicate = fixture(); duplicate.sync.Buyer.prs.push({ ...duplicate.sync.Buyer.prs[0] });
  assert.throws(() => preview(duplicate), /รหัสรายการซ้ำ/);
});

test('reports malformed file structure and supplied null quotation files', () => {
  const f = fixture();
  assert.throws(() => previewImport('[]', JSON.stringify(f.po), null), /ไฟล์ PR/);
  assert.throws(() => previewImport('{', JSON.stringify(f.po), null), SyntaxError);
  assert.throws(() => previewImport(JSON.stringify(f.sync), '{}', null), /ไฟล์ PO/);
  assert.throws(() => previewImport(JSON.stringify(f.sync), JSON.stringify(f.po), 'null'), /quotes/);
  delete f.sync.Buyer.prs[0].po_ids;
  assert.throws(() => preview(f), /รายละเอียดในไฟล์ไม่ครบ/);
});

test('checks document relationships before any upload', () => {
  const missingPr = fixture(); missingPr.sync.Buyer.lines[0].request_id = [99, 'MISSING'];
  assert.throws(() => preview(missingPr), /อ้างถึง PR/);
  const missingQuote = fixture(); missingQuote.quotes.items[0].quote_id = 99;
  assert.throws(() => preview(missingQuote, true), /อ้างถึงใบเสนอราคา/);
});
