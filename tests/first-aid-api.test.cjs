const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

process.env.TOOLS_SESSION_SECRET = 'first-aid-test-session-secret';
const root = path.join(__dirname, '..');
let db;
const cache = new Map();
function load(relative) {
  const file = path.join(root, relative);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} }; cache.set(file, module.exports);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const requireLocal = specifier => {
    if (specifier === '@/lib/supabase') return { getSupabaseServer: () => db };
    if (specifier === 'next/server') return { NextRequest, NextResponse };
    if (specifier === 'qrcode') return { toString: async () => '<svg></svg>' };
    if (specifier.startsWith('@/')) return load(`src/${specifier.slice(2)}.ts`);
    if (specifier.startsWith('./')) return load(path.relative(root, path.join(path.dirname(file), specifier + '.ts')));
    return require(specifier);
  };
  new Function('require', 'module', 'exports', output)(requireLocal, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}
const validation = load('src/lib/first-aid/validation.ts');
const session = load('src/lib/toolsSession.ts');
const server = load('src/lib/first-aid/server.ts');
const ids = {
  user: randomUUID(), location: randomUUID(), otherLocation: randomUUID(), item: randomUUID(), lot: randomUUID(),
  employee: randomUUID(), otherEmployee: randomUUID(), doc: randomUUID(), movement: randomUUID(),
};
const token = 'a'.repeat(64);

function fakeDb(tables) {
  const calls = []; const rpcCalls = [];
  function from(table) {
    const filters = []; let range = null, limit = null, one = false, mutation = null, payload;
    const builder = {
      select(columns) { this.columns = columns; return this; },
      eq(key, value) { filters.push(['eq', key, value]); return this; },
      is(key, value) { filters.push(['eq', key, value]); return this; },
      gt(key, value) { filters.push(['gt', key, value]); return this; },
      in(key, value) { filters.push(['in', key, value]); return this; },
      order() { return this; },
      range(start, end) { range = [start, end]; return this; },
      limit(value) { limit = value; return this; },
      maybeSingle() { one = true; return this; }, single() { one = true; return this; },
      insert(value) { mutation = 'insert'; payload = value; return this; },
      update(value) { mutation = 'update'; payload = value; return this; },
      upsert(value) { mutation = 'upsert'; payload = value; return this; },
      then(resolve, reject) {
        calls.push({ table, filters: structuredClone(filters), columns: this.columns, mutation, payload });
        let rows = (tables[table] || []).filter(row => filters.every(([op, key, value]) => op === 'in' ? value.includes(row[key]) : op === 'gt' ? row[key] > value : row[key] === value));
        if (mutation === 'insert') { const row = { id: randomUUID(), ...payload }; (tables[table] ||= []).push(row); rows = [row]; }
        if (mutation === 'update') rows.forEach(row => Object.assign(row, payload));
        if (mutation === 'upsert') rows = [{ id: randomUUID(), ...payload }];
        if (range) rows = rows.slice(range[0], range[1] + 1);
        if (limit != null) rows = rows.slice(0, limit);
        return Promise.resolve({ data: one ? rows[0] || null : rows, error: null }).then(resolve, reject);
      },
    };
    return builder;
  }
  return {
    tables, calls, rpcCalls, from,
    rpc(name, args) {
      rpcCalls.push({ name, args });
      if (name === 'fa_usage_summary') return Promise.resolve({ data: { monthUsesByLocation: [], dailyUsesByLocation: [] }, error: null });
      return Promise.resolve({ data: { document: { id: ids.doc, company_id: 'amt', kind: args.p_payload?.kind, location_id: args.p_payload?.locationId, date: args.p_payload?.date, actor_key: args.p_actor_key, actor_name: args.p_actor_name, requester: args.p_payload?.requester, recipient_person: args.p_payload?.recipientPerson, recording_mode: args.p_payload?.mode }, movements: [] }, error: null });
    },
  };
}

function actorRow(modules = ['first-aid']) { return { id: ids.user, company_id: 'amt', username: 'test', display_name: 'Test Staff', is_active: true, password: 'test-hash', allowed_modules: modules }; }
function actor() { return { id: ids.user, accountTable: 'tools_users', username: 'test', companyId: 'amt', isAdmin: false, displayName: 'Test Staff', row: actorRow() }; }
function request(route, body, opts = {}) {
  const url = `https://tools.eashe.org/api/first-aid/${route}${route.includes('?') ? '' : '?company_id=amt'}`;
  const headers = { ...(opts.auth === false ? {} : { cookie: `ea_tools_session=${session.issueToolsSession(actorRow(), opts.admin ? 'admin_accounts' : 'tools_users')}` }), ...(body ? { 'content-type': 'application/json', origin: opts.origin || 'https://tools.eashe.org' } : {}) };
  return new NextRequest(url, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function tx(overrides = {}) { return { idempotencyKey: randomUUID(), kind: 'issue', locationId: ids.location, date: validation.bangkokDate(), lines: [{ itemId: ids.item, quantity: 2 }], requesterId: 'manual', requesterPerson: { name: 'Test Collector', department: 'Test Department' }, ...overrides }; }
beforeEach(() => {
  db = fakeDb({
    tools_users: [actorRow()],
    admin_accounts: [actorRow()],
    company_settings: [{ company_id: 'amt', company_name: 'AMT', full_name: 'Amita' }],
    fa_company_settings: [{ company_id: 'amt', infirmary_enabled: true }],
    fa_locations: [{ id: ids.location, company_id: 'amt', name: 'AMT point', type: 'ตู้ปฐมพยาบาล', issue_mode: 'self_service', active: true, public_token_hash: createHash('sha256').update(token).digest('hex') }, { id: ids.otherLocation, company_id: 'aab', name: 'Secret other point', active: true }],
    fa_items: [{ id: ids.item, company_id: 'amt', name: 'Gauze', category: 'เวชภัณฑ์', unit: 'ซอง', min: 1, track_expiry: true, active: true }],
    fa_location_items: [{ id: randomUUID(), company_id: 'amt', item_id: ids.item, location_id: ids.location, min: 1 }],
    fa_lots: [{ id: ids.lot, company_id: 'amt', item_id: ids.item, location_id: ids.location, code: 'LOT1', expiry: '2027-12-31', quantity: 10 }, { id: randomUUID(), company_id: 'aab', item_id: ids.item, location_id: ids.otherLocation, code: 'SECRET', expiry: '2027-12-31', quantity: 999 }],
    fa_documents: [{ id: ids.doc, company_id: 'amt', date: '2026-11-02', kind: 'issue', actor_key: 'staff:1', actor_name: 'Test Staff', recording_mode: 'staff', requester: { name: 'Test Collector' }, recipient_person: { name: 'Test Recipient' }, request_payload: { internal: 'must not be exposed' } }],
    fa_movements: [{ id: ids.movement, company_id: 'amt', document_id: ids.doc, item_id: ids.item, location_id: ids.location, quantity: 2 }],
    fa_visits: [{ id: randomUUID(), company_id: 'amt', person: 'Health Private', note: 'Private health note' }],
    company_employees: [{ id: ids.employee, company_id: 'amt', emp_code: '001', first_name: 'Test', last_name: 'Employee', department: 'Office', gender: 'private', is_active: true }, { id: ids.otherEmployee, company_id: 'aab', emp_code: 'SECRET', first_name: 'Other', last_name: 'Employee', is_active: true }],
    ppe_employees: [],
  });
});

test('session/module/company checks reject anonymous and cross-company access before stock reads', async () => {
  await assert.rejects(server.firstAidActor(request('state', null, { auth: false })), error => error.status === 401);
  await assert.rejects(server.firstAidActor(request('state?company_id=aab')), error => error.status === 403);
  db.tables.tools_users[0].allowed_modules = ['ppe'];
  await assert.rejects(server.firstAidActor(request('state')), error => error.status === 403);
  assert.equal(db.calls.some(row => row.table.startsWith('fa_')), false);
});

test('writes require same-origin and never accept caller-supplied actor or company snapshots', async () => {
  await assert.rejects(server.postFirstAidTransaction(request('transactions', tx(), { origin: 'https://attacker.test' })), error => error.status === 403);
  await assert.rejects(server.postFirstAidTransaction(request('transactions', tx({ actor_key: 'admin', company_id: 'aab' }))), /ช่องข้อมูล/);
  assert.equal(db.rpcCalls.length, 0);
});

test('staff state is company-scoped, excludes clinical data for stock users, and omits internal token/request payload', async () => {
  const state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.locations.length, 1);
  assert.equal(state.lots.length, 1);
  assert.equal(state.employees.length, 1);
  assert.deepEqual(state.visits, []);
  assert.equal(state.permissions.canClinical, false);
  assert.equal(db.calls.some(row => row.table === 'fa_visits'), false);
  const json = JSON.stringify(state);
  assert.equal(json.includes('Secret other'), false);
  assert.equal(json.includes('private'), false);
  assert.equal(json.includes('request_payload'), false);
  assert.equal(json.includes('public_token_hash'), false);
  assert.equal(db.calls.some(row => row.mutation), false);
});

test('stock lists paginate beyond the default PostgREST row limit without truncating balances', async () => {
  db.tables.fa_lots = Array.from({ length: 1007 }, (_, index) => ({ id: `${index}`.padStart(4, '0'), company_id: 'amt', item_id: ids.item, location_id: ids.location, quantity: 1 }));
  const state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.lots.length, 1007);
  assert.equal(state.lots.reduce((sum, lot) => sum + lot.quantity, 0), 1007);
});

test('archived item and location names remain available for history without appearing in active inventory or public stock', async () => {
  const archived = { ...db.tables.fa_items[0], id: randomUUID(), name: 'Historic old packaging', active: false };
  const archivedPoint = { ...db.tables.fa_locations[0], id: randomUUID(), name: 'Company-wide historical log; point unknown', active: false, public_token_hash: null };
  db.tables.fa_items.push(archived);
  db.tables.fa_locations.push(archivedPoint);
  db.tables.fa_movements[0].item_id = archived.id;
  db.tables.fa_movements[0].location_id = archivedPoint.id;
  const state = await server.loadFirstAidState('amt', actor());
  assert.deepEqual(state.items.map(row => row.id), [ids.item]);
  assert.deepEqual(state.archivedItems.map(row => row.name), ['Historic old packaging']);
  assert.deepEqual(state.locations.map(row => row.id), [ids.location]);
  assert.deepEqual(state.archivedLocations.map(row => row.name), ['Company-wide historical log; point unknown']);
  assert.equal(state.events[0].itemId, archived.id);
  assert.equal(state.events[0].locationId, archivedPoint.id);
  const publicState = await server.loadPublicFirstAidState(token);
  assert.equal(publicState.items.some(row => row.id === archived.id), false);
  assert.equal(publicState.locations.some(row => row.id === archivedPoint.id), false);
  assert.equal('archivedItems' in publicState, false);
  assert.equal('archivedLocations' in publicState, false);
});

test('Excel history preserves unknown recorder identity and month-only date precision', () => {
  const movement = db.tables.fa_movements[0],document = db.tables.fa_documents[0];
  const monthly = server.mapEvent(movement, { ...document, actor_key: 'excel-import:month:source-hash', requester: null, recipient_person: null });
  assert.equal(monthly.recordingMode, 'legacy');
  assert.equal(monthly.recordedBy.identityMethod, 'legacy_import');
  assert.equal(monthly.datePrecision, 'month');
  assert.equal(monthly.requester, null);
  assert.equal(server.mapEvent(movement, document).datePrecision, 'day');
  assert.equal(server.mapEvent(movement, document).recordedBy.identityMethod, 'authenticated_session');
});

test('view balances exclude unknown tracked expiry while preserving physical stock and usable equipment', async () => {
  const model = load('src/lib/first-aid/model.ts');
  const state = { asOf: '2026-11-02', items: [{ id: 'medicine', trackExpiry: true, min: 0 },{ id: 'equipment', trackExpiry: false, min: 0 }], locations: [{ id: 'point', lastChecked: '2026-11-02' }], thresholds: [{ itemId: 'medicine', locationId: 'point', min: 0 }], lots: [
    { id: 'pending', itemId: 'medicine', locationId: 'point', expiry: null, quantity: 12 },
    { id: 'expired', itemId: 'medicine', locationId: 'point', expiry: '2026-10-01', quantity: 3 },
    { id: 'usable', itemId: 'medicine', locationId: 'point', expiry: '2027-10-01', quantity: 4 },
    { id: 'equipment-lot', itemId: 'equipment', locationId: 'point', expiry: null, quantity: 2 },
  ] };
  assert.equal(model.balance(state, 'medicine'), 4);
  assert.equal(model.balance(state, 'equipment'), 2);
  assert.equal(model.pendingLots(state, 'medicine').reduce((sum,lot) => sum+lot.quantity,0), 12);
  assert.equal(model.itemStatus(state, state.items[0]).pendingQty, 12);
  assert.equal(model.itemStatus(state, state.items[0]).expiredQty, 3);
  assert.equal(state.lots.reduce((sum,lot) => sum+lot.quantity,0), 21);
});

test('public state exposes only the token point stock and no employee directory, history, clinical data or session', async () => {
  const state = await server.loadPublicFirstAidState(token);
  assert.equal(state.locations.length, 1);
  assert.deepEqual(state.employees, []);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.inspections, []);
  assert.deepEqual(state.visits, []);
  assert.equal(state.session, undefined);
  assert.equal(db.calls.some(row => ['company_employees', 'ppe_employees', 'fa_documents', 'fa_movements', 'fa_visits'].includes(row.table)), false);
  assert.equal(JSON.stringify(state).includes('public_token_hash'), false);
  assert.equal(state.permissions.canManage, false);
});

test('public token must still be active/self-service and cannot mutate another point or non-issue stock', async () => {
  await assert.rejects(server.loadPublicFirstAidState('invalid'), error => error.status === 404);
  await assert.rejects(server.postPublicFirstAidTransaction(request('public/' + token, tx({ kind: 'receive' }), { auth: false }), token), error => error.status === 403);
  await assert.rejects(server.postPublicFirstAidTransaction(request('public/' + token, tx({ locationId: ids.otherLocation }), { auth: false }), token), error => error.status === 403);
  db.tables.fa_locations[0].issue_mode = 'controlled';
  await assert.rejects(server.loadPublicFirstAidState(token), error => error.status === 403);
  assert.equal(db.rpcCalls.length, 0);
});

test('staff employee identities are resolved in company scope and cannot be spoofed with supplied names', async () => {
  await server.postFirstAidTransaction(request('transactions', tx({ requesterId: `company:${ids.employee}`, requesterPerson: { name: 'Spoofed', department: 'Wrong' } })));
  const call = db.rpcCalls.find(row => row.name === 'fa_post_transaction');
  assert.equal(call.args.p_actor_name, 'Test Staff');
  assert.equal(call.args.p_payload.mode, 'staff');
  assert.equal(call.args.p_payload.requester.name, 'Test Employee');
  assert.equal(call.args.p_payload.requester.identityMethod, 'self_declared');
  assert.equal(call.args.p_actor_key, `tools_users:${ids.user}`);
  await assert.rejects(server.postFirstAidTransaction(request('transactions', tx({ requesterId: `company:${ids.otherEmployee}` }))), /ไม่พบพนักงาน/);
});

test('public submission forces self-declared mode and returns only its receipt without directory lookups', async () => {
  const result = await server.postPublicFirstAidTransaction(request('public/' + token, tx(), { auth: false }), token);
  assert.equal(result.documentId, ids.doc);
  assert.deepEqual(Object.keys(result).sort(), ['documentId', 'events']);
  const call = db.rpcCalls.find(row => row.name === 'fa_post_transaction');
  assert.equal(call.args.p_payload.mode, 'self_service');
  assert.equal(call.args.p_payload.requester.identityMethod, 'self_declared');
  assert.equal(call.args.p_public_token_hash, createHash('sha256').update(token).digest('hex'));
  assert.equal(db.calls.some(row => ['company_employees', 'ppe_employees'].includes(row.table)), false);
  await assert.rejects(server.postPublicFirstAidTransaction(request('public/' + token, tx({ requesterId: `company:${ids.employee}` }), { auth: false }), token), /ด้วยตนเอง/);
});

test('clinical writes require privileged actor and malformed management fields cannot change protected columns', async () => {
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'visit', date: validation.bangkokDate(), person: 'Test', service: 'Rest' })), error => error.status === 403);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'location', id: ids.location, name: 'Changed', type: 'Bag', issueMode: 'self_service', public_token_hash: 'attacker' })), /ช่องข้อมูล/);
  assert.equal(db.calls.some(row => row.table === 'fa_locations' && row.mutation), false);
});

test('a unit cannot change after any lot or movement exists, including zero stock', async () => {
  db.tables.fa_lots[0].quantity = 0;
  const body = { action: 'item', id: ids.item, name: 'Gauze', category: 'เวชภัณฑ์', unit: 'กล่อง', min: 1, trackExpiry: true };
  await assert.rejects(server.manageFirstAid(request('manage', body)), error => error.status === 409 && /หน่วยนับ/.test(error.message));
  assert.equal(db.tables.fa_items[0].unit, 'ซอง');
  assert.equal(db.calls.some(row => row.table === 'fa_items' && row.mutation), false);
  db.tables.fa_lots = [];
  await assert.rejects(server.manageFirstAid(request('manage', body)), error => error.status === 409);
});

test('expiry tracking cannot be enabled while existing physical stock has no expiry', async () => {
  db.tables.fa_items[0].track_expiry = false;
  db.tables.fa_lots[0].expiry = null;
  const body = { action: 'item', id: ids.item, name: 'Gauze', category: 'เวชภัณฑ์', unit: 'ซอง', min: 1, trackExpiry: true };
  await assert.rejects(server.manageFirstAid(request('manage', body)), /วันหมดอายุ/);
  assert.equal(db.tables.fa_items[0].track_expiry, false);
  db.tables.fa_lots[0].quantity = 0;
  await server.manageFirstAid(request('manage', body));
  assert.equal(db.tables.fa_items[0].track_expiry, true);
});

test('stable create IDs make uncertain item and location submissions safely retryable', async () => {
  for (const [action, body] of [
    ['item', { name: 'New item', generic: '', category: 'เวชภัณฑ์', unit: 'ซอง', min: 1, trackExpiry: true }],
    ['location', { name: 'New point', type: 'กระเป๋าฉุกเฉิน', area: 'Office', issueMode: 'self_service' }],
  ]) {
    const createId = randomUUID(); const input = { action, createId, ...body };
    const first = await server.manageFirstAid(request('manage', input));
    const second = await server.manageFirstAid(request('manage', input));
    assert.equal(first.id, createId); assert.equal(second.id, createId);
    const table = action === 'item' ? 'fa_items' : 'fa_locations';
    assert.equal(db.tables[table].filter(row => row.id === createId).length, 1);
    await assert.rejects(server.manageFirstAid(request('manage', { ...input, name: 'Changed after retry' })), error => error.status === 409);
    assert.equal(db.tables[table].find(row => row.id === createId).name, body.name);
  }
});

test('clinical visit retries retain the original record and normalize stored PostgreSQL time precision', async () => {
  const createId = randomUUID();
  const body = { action: 'visit', createId, date: validation.bangkokDate(), person: 'Visit Test', service: 'Rest', note: 'Test care note', timeIn: '09:30', timeOut: '10:15' };
  const first = await server.manageFirstAid(request('manage', body, { admin: true }));
  const stored = db.tables.fa_visits.find(row => row.id === createId);
  stored.time_in = '09:30:00'; stored.time_out = '10:15:00';
  const retry = await server.manageFirstAid(request('manage', body, { admin: true }));
  assert.equal(first.id, createId); assert.equal(retry.id, createId);
  assert.equal(db.tables.fa_visits.filter(row => row.id === createId).length, 1);
  await assert.rejects(server.manageFirstAid(request('manage', { ...body, note: 'Changed clinical content' }, { admin: true })), error => error.status === 409);
});

test('inspection writes require a stable UUID and pass the authoritative recorder to the atomic helper', async () => {
  const body = { action: 'inspection', locationId: ids.location, notes: 'Checked', hasIssue: false };
  await assert.rejects(server.manageFirstAid(request('manage', body)), /รหัสบันทึกผลตรวจ/);
  assert.equal(db.rpcCalls.length, 0);
  const createId = randomUUID();
  await server.manageFirstAid(request('manage', { ...body, createId }));
  const call = db.rpcCalls.find(row => row.name === 'fa_record_inspection');
  assert.equal(call.args.p_create_id, createId);
  assert.equal(call.args.p_company_id, 'amt');
  assert.equal(call.args.p_location_id, ids.location);
  assert.equal(call.args.p_actor_key, `tools_users:${ids.user}`);
});

test('transaction validation enforces exact dates, integer quantities, explicit idempotency and note rules', () => {
  assert.throws(() => validation.parseTransaction(tx({ idempotencyKey: '' })), /รหัสป้องกัน/);
  assert.throws(() => validation.parseTransaction(tx({ date: '2026-02-30' })), /วันที่/);
  assert.throws(() => validation.parseTransaction(tx({ date: '2099-01-01' })), /ล่วงหน้า/);
  assert.throws(() => validation.parseTransaction(tx({ lines: [{ itemId: ids.item, quantity: 0.5 }] })), /จำนวนเต็ม/);
  assert.throws(() => validation.parseTransaction(tx({ kind: 'dispose' })), /เหตุผล/);
  assert.throws(() => validation.manualPerson({ name: 'Guest', department: '' }), /หน่วยงาน/);
  assert.equal(validation.bangkokDate(new Date('2026-11-01T18:00:00Z')), '2026-11-02');
});

test('request size bounds apply without Content-Length and errors do not expose raw database details', async () => {
  await assert.rejects(validation.readJsonBody(new Request('https://example.test', { method: 'POST', body: 'x'.repeat(33000) })), error => error.status === 413);
  const response = server.firstAidFailure({ code: 'XX000', message: 'secret password server-host internal SQL' });
  assert.equal(response.status, 500);
  assert.equal(JSON.stringify(await response.json()).includes('secret'), false);
  assert.match(response.headers.get('cache-control'), /no-store/);
});
