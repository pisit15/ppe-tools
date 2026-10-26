// Isolated procurement preview: in-memory PostgreSQL, synthetic data, loopback services only.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { startFixture } = require('./chemical-db-fixture.cjs');
const root = path.join(__dirname, '..');
const fixtures = path.join(root, '.verification', 'procurement-preview');

async function insert(db, table, row) {
  const entries = Object.entries(row);
  await db.query(`insert into ${table} (${entries.map(([key]) => key).join(',')}) values (${entries.map((_, i) => '$' + (i + 1)).join(',')})`, entries.map(([key, value]) => key === 'counts' ? JSON.stringify(value) : value));
}
async function setupProcurement(db) {
  const migrationDir = path.join(root, 'supabase', 'migrations');
  for (const file of fs.readdirSync(migrationDir).filter(file => /procurement.*\.sql$/.test(file)).sort()) {
    await db.exec(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
  }
  await db.exec(`
    alter table company_users add column allowed_modules text[];
    alter table tools_users add column allowed_modules text[];
    insert into company_users (username, password, company_id, company_name, allowed_modules)
      select account.username, source.password, account.company_id, upper(account.company_id), account.modules
      from company_users source cross join (values
        ('amt', 'amt', null::text[]),
        ('audit-restricted', 'amt', array['ppe']),
        ('audit-multi', 'amt', null::text[]),
        ('audit-multi', 'aab', null::text[]),
        ('audit-unassigned', 'unknown', null::text[])
      ) account(username, company_id, modules) where source.username = 'audit-amt';
    insert into tools_users (username, password, company_id, company_name)
      select account.username, source.password, account.company_id, upper(account.company_id)
      from company_users source cross join (values
        ('audit-tools', 'aab'), ('audit-linked', 'amt'), ('audit-linked-alt', 'aab')
      ) account(username, company_id) where source.username = 'audit-amt';
    insert into proc_requester_accounts (username, requester) values
      ('audit-amt', 'ผู้ซื้อทดสอบ AMT'), ('audit-aab', 'ผู้ซื้อทดสอบ AAB'),
      ('audit-linked', 'ผู้รับผิดชอบหลายบริษัท'), ('audit-linked-alt', 'ผู้รับผิดชอบหลายบริษัท');
  `);
  const suppliers = ['บริษัท สยามเซฟตี้ ทดสอบ จำกัด', 'บริษัท พรีซิชั่นซัพพลาย ทดสอบ จำกัด', 'บริษัท กรีนอินดัสทรี ทดสอบ จำกัด'];
  const items = [
    { name: 'ถุงมือผ้าฝ้าย 7 ขีด', product: '[07-SPXX-0001] ถุงมือผ้าฝ้าย 7 ขีด', unit: 'คู่', price: 25 },
    { name: 'ถุงมือผ้าฝ้าย 7 ขีด', product: '[07-SPXX-0001] ถุงมือผ้าฝ้าย 7 ขีด', unit: 'PAIR', price: 24 },
    { name: 'ถุงมือกันความร้อน 500 องศา', product: '[07-SPXX-0002] ถุงมือกันความร้อน 500 องศา', unit: 'คู่', price: 940 },
    { name: 'ถุงมือไนไตรล์ 100 ชิ้น', product: '[07-SPXX-0003] ถุงมือไนไตรล์ 100 ชิ้น', unit: 'กล่อง', price: 210 },
    { name: 'ค่าบริการตรวจวัดสภาพแวดล้อม', product: '[OT42-AMT-0001] ค่าบริการตรวจวัดสภาพแวดล้อม', unit: 'งาน', price: 35000 },
    { name: 'ค่าบริการรักษาความปลอดภัย', product: '[OF02-AMT] ค่าบริการรักษาความปลอดภัย', unit: 'เดือน', price: 72000 },
  ];
  const rawSync = {}; const rawPo = []; const rawQuotes = { quotes: [], items: [] };
  let poCount = 0; let quoteCount = 0;
  for (let n = 1; n <= 18; n++) {
    const year = n <= 6 ? 2024 : n <= 12 ? 2025 : 2026;
    const month = String(((n - 1) % 6) + 1).padStart(2, '0');
    const date = `${year}-${month}-12`;
    const prNo = `PR${String(year).slice(2)}${String(n).padStart(6, '0')}`;
    const state = n <= 12 ? 'done' : ['draft', 'to_approve', 'approved', 'rejected', 'done', 'done'][n - 13];
    const who = n % 2 ? 'ผู้ซื้อทดสอบ AMT' : 'ผู้ซื้อทดสอบ AAB';
    const company = n % 2 ? 'AMT' : 'AAB';
    const item = items[(n - 1) % items.length];
    const vendor = suppliers[(n - 1) % suppliers.length] + (n === 1 ? ' (Siam Safety Test Co., Ltd.)' : '');
    const qty = item.unit === 'เดือน' ? 12 : item.unit === 'งาน' ? 1 : 100;
    const price = item.price * (year === 2024 ? 0.92 : year === 2025 ? 0.96 : 1);
    const amount = Math.round(price * qty * 100) / 100;
    const poNo = `PO${String(year).slice(2)}${String(n).padStart(6, '0')}`;
    const unit = n === 7 ? 'pair' : n === 13 ? 'PRS' : item.unit;
    const unitRef = [1, unit];
    const sourcePr = { id: n, name: prNo, date_start: date, title: item.name, description: 'ข้อมูลสังเคราะห์สำหรับตรวจหน้าจอ ไม่มีการสั่งซื้อจริง', company_id: [n % 2 + 1, company], operating_unit_id: [1, `[${n % 2 ? 'D8' : 'D9'}_SF00] ${company} : Safety`], request_type: [1, 'สินค้าและบริการ'], state, estimated_cost: amount, po_ids: state === 'done' ? [n * 10] : [], line_count: 1 };
    const sourceLine = { id: 1000 + n, request_id: [n, prNo], name: item.name, product_id: [n, item.product], product_qty: qty, product_uom_id: unitRef, estimated_cost: price, analytic_account_id: false, date_required: date, specifications: item.name };
    rawSync[who] ||= { prs: [], lines: [], att: [], pos: [] };
    rawSync[who].prs.push(sourcePr); rawSync[who].lines.push(sourceLine);
    await insert(db, 'proc_pr', { odoo_id: n, pr_no: prNo, requester: who, request_date: date, company, operating_unit: sourcePr.operating_unit_id[1], state, title: item.name, description: sourcePr.description, estimated_cost: amount, po_amount: state === 'done' ? amount : 0, po_count: state === 'done' ? 1 : 0, po_list: state === 'done' ? poNo : '', vendors: state === 'done' ? vendor : '', n_lines: 1, n_attachments: 2 });
    await insert(db, 'proc_pr_lines', { odoo_id: 1000 + n, pr_odoo_id: n, pr_no: prNo, name: item.name, product: item.product, qty, uom: unit, est_unit_price: price, specifications: item.name });
    if (state === 'done') {
      poCount++;
      rawSync[who].pos.push({ id: n * 10, name: poNo, partner_id: [1, vendor], amount_untaxed: amount });
      rawPo.push({ id: 2000 + n, order_id: [n * 10, poNo], product_id: [n, item.product], name: item.name, product_qty: qty, product_uom: unitRef, price_unit: price, price_subtotal: amount, partner_id: [1, vendor], date_order: date, currency_id: [1, 'THB'], state: 'purchase' });
      await insert(db, 'proc_po_lines', { odoo_id: 2000 + n, po_no: poNo, pr_odoo_id: n, pr_no: prNo, requester: who, vendor, product: item.product, item: item.name, qty, uom: unit, unit_price: price, subtotal: amount, order_date: date, currency: 'THB', po_state: 'purchase' });
    }
    for (let q = 0; q < (n === 1 ? 1 : 2); q++) {
      const id = n * 10 + q; const qVendor = n === 1 ? 'Siam Safety Test Co., Ltd.' : suppliers[((n - 1) + q) % 3]; const qPrice = Math.round(price * (q ? 1.06 : 1) * 100) / 100;
      quoteCount++;
      const basis = item.unit === 'เดือน' ? (q ? 'year' : 'month') : 'once';
      const subtotal = qPrice * (basis === 'month' ? 1 : qty);
      const quote = { quote_id: id, file: `synthetic/offer-${id}.pdf`, person: who, pr: prNo, doc_type: 'quotation', vendor: qVendor, vendor_group: qVendor, quote_no: `QT-${id}`, date, customer: company, currency: 'THB', subtotal, discount: 0, vat: subtotal * 0.07, total: subtotal * 1.07, notes: 'เอกสารจำลอง', n_items: 1, duplicate_file: false, price_basis: basis };
      rawQuotes.quotes.push(quote);
      rawQuotes.items.push({ quote_id: id, pr: prNo, vendor: qVendor, vendor_group: qVendor, date, name: item.name, spec: item.name, qty, unit, unit_price: qPrice, amount: qPrice * qty, duplicate_file: false, check: '' });
      await insert(db, 'proc_quotes', { id, pr_no: prNo, requester: who, file_path: quote.file, doc_type: 'quotation', vendor: qVendor, vendor_group: qVendor, quote_no: quote.quote_no, quote_date: date, currency: 'THB', subtotal, discount: 0, vat: quote.vat, total: quote.total, n_items: 1, price_basis: basis });
      await insert(db, 'proc_quote_items', { id, quote_id: id, pr_no: prNo, vendor_group: qVendor, quote_date: date, name: item.name, spec: item.name, qty, unit, unit_price: qPrice, amount: qPrice * qty });
    }
  }
  // Seven deliberately varied search records: overlapping prices, unlike units and an undated quote.
  // These records live only in the local in-memory fixture, never the production database.
  const trainingPr = 'PR26000900'; const trainingWho = 'ผู้ซื้อทดสอบ AMT';
  const trainingVendors = [...suppliers, 'บริษัท อบรมอุตสาหกรรม ทดสอบ จำกัด'];
  await insert(db, 'proc_pr', { odoo_id: 90, pr_no: trainingPr, requester: trainingWho, request_date: '2026-02-16', company: 'AMT', state: 'done', title: 'อบรม รถยก', description: 'ข้อมูลสังเคราะห์สำหรับตรวจกราฟเท่านั้น', estimated_cost: 64000, po_amount: 64000, po_count: 3, po_list: 'PO-TEST-9000, PO-TEST-9001, PO-TEST-9002', vendors: trainingVendors.slice(0, 2).join(', '), n_lines: 1 });
  await insert(db, 'proc_pr_lines', { odoo_id: 1090, pr_odoo_id: 90, pr_no: trainingPr, name: 'อบรม รถยก', product: 'หลักสูตรผู้ขับรถยกสำหรับผู้ปฏิบัติงาน', qty: 1, uom: 'รุ่น', est_unit_price: 22000 });
  const training = [
    [0, '2026-02-16', 18000, 'รุ่น'], [0, '2026-03-09', 22000, 'รุ่น'], [1, '2026-07-14', 24000, 'รุ่น'],
    [0, '2026-03-09', 22000, 'รุ่น'], [0, '2026-03-09', 22000, 'งาน'], [2, '2026-07-14', 1500, 'คน'], [3, null, 24000, ''],
  ];
  for (let index = 0; index < training.length; index++) {
    const [supplierIndex, date, price, unit] = training[index]; const id = 9000 + index; const vendor = trainingVendors[supplierIndex];
    if (index < 3) {
      poCount++;
      await insert(db, 'proc_po_lines', { odoo_id: id, po_no: `PO-TEST-${id}`, pr_odoo_id: 90, pr_no: trainingPr, requester: trainingWho, vendor, product: 'หลักสูตรผู้ขับรถยก', item: 'อบรม รถยก · ข้อมูลทดสอบ', qty: 1, uom: unit, unit_price: price, subtotal: price, order_date: date, currency: 'THB', po_state: 'purchase' });
    } else {
      quoteCount++;
      await insert(db, 'proc_quotes', { id, pr_no: trainingPr, requester: trainingWho, file_path: `synthetic/training-${id}.pdf`, doc_type: 'quotation', vendor, vendor_group: vendor, quote_no: `QT-TEST-${id}`, quote_date: date, currency: 'THB', subtotal: price, total: price, n_items: 1, price_basis: 'once' });
      await insert(db, 'proc_quote_items', { id, quote_id: id, pr_no: trainingPr, vendor_group: vendor, quote_date: date, name: 'อบรม รถยก · ข้อมูลทดสอบ', spec: 'ตัวอย่างเงื่อนไขอบรม ตรวจหน่วยและฐานภาษีก่อนเทียบราคา', qty: 1, unit, unit_price: price, amount: price });
    }
  }
  // Dense and unknown-currency cases use separate search terms for browser verification.
  for (let index = 0; index < 27; index++) {
    const id = 9200 + index; const unknown = index >= 25; const currency = unknown ? '' : 'THB';
    const name = unknown ? 'สกุลเงินทดสอบ' : 'ตรวจกราฟหลายรายการ';
    quoteCount++;
    await insert(db, 'proc_quotes', { id, pr_no: trainingPr, requester: trainingWho, file_path: `synthetic/dense-${id}.pdf`, doc_type: 'quotation', vendor: suppliers[0], vendor_group: suppliers[0], quote_no: `QT-DENSE-${id}`, quote_date: '2026-03-09', currency, subtotal: 22000, total: 22000, n_items: 1, price_basis: 'once' });
    await insert(db, 'proc_quote_items', { id, quote_id: id, pr_no: trainingPr, vendor_group: suppliers[0], quote_date: '2026-03-09', name, spec: `เอกสารจำลองลำดับ ${index + 1}`, qty: 1, unit: 'งาน', unit_price: 22000, amount: 22000 });
  }
  // A personal PR outside the requester's company and an unresolved site must stay readable,
  // but neither may enter that requester's company-only summary.
  await insert(db, 'proc_pr', { odoo_id: 91, pr_no: 'PR26000901', requester: trainingWho, request_date: '2026-08-01', company: 'AAB', operating_unit: '[D9_SF00] AAB : Safety', state: 'draft', title: 'PR ข้ามบริษัทสำหรับตรวจสิทธิ์', estimated_cost: 12345 });
  await insert(db, 'proc_pr', { odoo_id: 92, pr_no: 'PR26000902', requester: 'ผู้ซื้อที่ยังไม่ผูกบริษัท', request_date: '2026-08-02', company: 'ESM', operating_unit: '[D0_SF00] HO : Safety', state: 'draft', title: 'PR ไม่ทราบบริษัทสำหรับตรวจสิทธิ์', estimated_cost: 54321 });
  await insert(db, 'proc_sync_runs', { source: 'synthetic-local-preview', counts: { proc_pr: 21, proc_pr_lines: 19, proc_po_lines: poCount, proc_quotes: quoteCount, proc_quote_items: quoteCount }, imported_by: 'local-test-admin', imported_at: '2026-10-23T03:00:00Z' });
  fs.mkdirSync(fixtures, { recursive: true });
  for (const [name, value] of Object.entries({ 'sync.json': rawSync, 'po.json': rawPo, 'quotes.json': rawQuotes })) fs.writeFileSync(path.join(fixtures, name), JSON.stringify(value, null, 2));
}
async function startPreview() {
  const fixture = await startFixture(4321, { setup: setupProcurement, handle: async ({ req, url, db, json }) => {
    if (req.method !== 'GET' || !/^\/rest\/v1\/proc_[a-z_]+$/.test(url.pathname)) return false;
    if (req.headers.authorization !== 'Bearer local-test-service-secret') { json(403, { message: 'Test fixture requires server key' }); return true; }
    const identifier = name => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid fixture identifier'); return '"' + name + '"'; };
    const table = identifier(url.pathname.split('/').pop()); const params = []; const filters = [];
    for (const [key, value] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
      const [operator, ...rest] = value.split('.'); const operand = rest.join('.');
      if (operator === 'eq') { params.push(operand); filters.push(`${identifier(key)} = $${params.length}`); }
      else if (operator === 'in') { filters.push(`${identifier(key)} in (${operand.slice(1, -1).split(',').map(item => { params.push(item); return '$' + params.length; }).join(',')})`); }
      else throw new Error('Unsupported procurement fixture filter ' + operator);
    }
    const order = url.searchParams.get('order');
    const ordering = order ? ' order by ' + order.split(',').map(value => { const [key, dir] = value.split('.'); return identifier(key) + (dir === 'desc' ? ' desc' : ' asc'); }).join(',') : '';
    const limit = Number(url.searchParams.get('limit') || 1000); const offset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) || limit < 0 || offset < 0) throw new Error('Invalid fixture paging');
    const result = await db.query(`select * from ${table}${filters.length ? ' where ' + filters.join(' and ') : ''}${ordering} limit ${limit} offset ${offset}`, params);
    // PGlite intentionally returns numeric/bigint strings; PostgREST serializes these as JSON numbers.
    // Match the production wire format without changing the shared fixture used by other test suites.
    const numeric = result.fields.filter(field => [1700, 20].includes(field.dataTypeID)).map(field => field.name);
    const rows = result.rows.map(row => { const converted = { ...row }; for (const key of numeric) if (converted[key] !== null) converted[key] = Number(converted[key]); return converted; });
    if ((req.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
      if (rows.length !== 1) json(406, { code: 'PGRST116', message: 'Expected one row', details: rows.length + ' rows' });
      else json(200, rows[0]);
    } else json(200, rows);
    return true;
  } });
  console.log('Procurement synthetic fixture ready: http://127.0.0.1:4321');
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '4320'], {
    cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-test-anon', SUPABASE_SERVICE_ROLE_KEY: 'local-test-service-secret', TOOLS_SESSION_SECRET: 'local-test-session-secret', ANTHROPIC_API_KEY: '' }, stdio: 'inherit', windowsHide: true,
  });
  const stop = () => { child.kill(); fixture.server.close(); void fixture.db.close(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  child.on('exit', code => { fixture.server.close(); fixture.db.close().then(() => process.exit(code || 0)); });
}
if (require.main === module) startPreview().catch(error => { console.error(error); process.exit(1); });
module.exports = { setupProcurement };
