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
      is(key, value) { filters.push(['is', key, value]); return this; },
      gt(key, value) { filters.push(['gt', key, value]); return this; },
      gte(key, value) { filters.push(['gte', key, value]); return this; },
      lte(key, value) { filters.push(['lte', key, value]); return this; },
      neq(key, value) { filters.push(['neq', key, value]); return this; },
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
        let rows = (tables[table] || []).filter(row => filters.every(([op, key, value]) => op === 'in' ? value.includes(row[key]) : op === 'gt' ? row[key] > value : op === 'gte' ? row[key] >= value : op === 'lte' ? row[key] <= value : op === 'neq' ? row[key] !== value : op === 'is' ? (row[key] ?? null) === value : row[key] === value));
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
      if (name === 'fa_void_issue') return Promise.resolve({ data: { documentId: args.p_document_id, restored: 2, already: false }, error: null });
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
  assert.equal(db.calls.some(row => ['fa_documents', 'fa_movements', 'fa_visits'].includes(row.table)), false);
  // Employee registers may be read for department names only (chips on the QR page), never names or codes.
  assert.equal(db.calls.filter(row => ['company_employees', 'ppe_employees'].includes(row.table)).every(row => row.columns === 'department'), true);
  assert.deepEqual(state.departments, ['Office']);
  assert.equal(JSON.stringify(state).includes('Test Employee'), false);
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

test('public submission forces self-declared mode and returns only a bare receipt, never the recorded person', async () => {
  const result = await server.postPublicFirstAidTransaction(request('public/' + token, tx(), { auth: false }), token);
  assert.equal(result.documentId, ids.doc);
  assert.deepEqual(Object.keys(result).sort(), ['documentId', 'lines']);
  const call = db.rpcCalls.find(row => row.name === 'fa_post_transaction');
  assert.equal(call.args.p_payload.mode, 'self_service');
  assert.equal(call.args.p_payload.requester.identityMethod, 'self_declared');
  assert.equal(call.args.p_public_token_hash, createHash('sha256').update(token).digest('hex'));
  await assert.rejects(server.postPublicFirstAidTransaction(request('public/' + token, tx({ requesterId: `company:${ids.employee}` }), { auth: false }), token), /ด้วยตนเอง/);
});

test('person collecting: department kept without a name, a typed employee code is matched on the server and never echoed to the QR page', async () => {
  const model = load('src/lib/first-aid/model.ts');
  const lastPayload = () => db.rpcCalls.filter(row => row.name === 'fa_post_transaction').at(-1).args.p_payload;
  // staff screen: a department chosen with the name left blank is stored, the name stays a placeholder
  await server.postFirstAidTransaction(request('transactions', tx({ requesterPerson: { name: '', department: 'ผลิต' } })));
  assert.deepEqual([lastPayload().requester.name, lastPayload().requester.department], ['ไม่ระบุ', 'ผลิต']);
  assert.equal(model.personLabel(lastPayload().requester), 'ไม่ระบุชื่อ · ผลิต');
  assert.equal(model.personLabel({ name: 'ไม่ระบุ', department: 'ไม่ระบุ' }), '');
  assert.equal(model.personLabel({ name: 'สมชาย', department: 'ไม่ระบุ' }), 'สมชาย');
  // a point that requires a name still refuses a department-only ticket
  db.tables.fa_locations[0].require_requester = true;
  await assert.rejects(server.postFirstAidTransaction(request('transactions', tx({ requesterPerson: { name: '', department: 'ผลิต' } }))), /ต้องระบุชื่อ/);
  db.tables.fa_locations[0].require_requester = false;
  // a typed code (or the exact full name) becomes the register's name, code and department
  await server.postFirstAidTransaction(request('transactions', tx({ requesterPerson: { name: ' 001 ', department: 'พิมพ์เอง' } })));
  assert.deepEqual([lastPayload().requester.name, lastPayload().requester.code, lastPayload().requester.department], ['Test Employee', '001', 'Office']);
  await server.postFirstAidTransaction(request('transactions', tx({ requesterPerson: { name: 'test  employee', department: '' } })));
  assert.equal(lastPayload().requester.name, 'Test Employee');
  // no match, or more than one person with that name → kept exactly as typed
  await server.postFirstAidTransaction(request('transactions', tx({ requesterPerson: { name: 'Visitor', department: 'ผู้รับเหมา' } })));
  assert.deepEqual([lastPayload().requester.name, lastPayload().requester.department], ['Visitor', 'ผู้รับเหมา']);
  db.tables.company_employees.push({ id: randomUUID(), company_id: 'amt', emp_code: '002', first_name: 'Test', last_name: 'Employee', department: 'Store', is_active: true });
  await server.postFirstAidTransaction(request('transactions', tx({ requesterPerson: { name: 'Test Employee', department: 'ผลิต' } })));
  assert.deepEqual([lastPayload().requester.name, lastPayload().requester.department, lastPayload().requester.code || ''], ['Test Employee', 'ผลิต', '']);
  // another company's code never matches
  await server.postFirstAidTransaction(request('transactions', tx({ requesterPerson: { name: 'SECRET', department: '' } })));
  assert.equal(lastPayload().requester.name, 'SECRET');
  // QR page: the code is matched for the record, but the response carries no person at all
  const result = await server.postPublicFirstAidTransaction(request('public/' + token, tx({ requesterPerson: { name: '001', department: '' } }), { auth: false }), token);
  assert.equal(lastPayload().requester.name, 'Test Employee');
  assert.equal(lastPayload().mode, 'self_service');
  assert.doesNotMatch(JSON.stringify(result), /Employee|Office|001/);
  const publicState = await server.loadPublicFirstAidState(token);
  assert.deepEqual(publicState.employees, []);
});

test('clinical writes require privileged actor and malformed management fields cannot change protected columns', async () => {
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'visit', date: validation.bangkokDate(), person: 'Test', service: 'Rest' })), error => error.status === 403);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'location', id: ids.location, name: 'Changed', type: 'Bag', issueMode: 'self_service', public_token_hash: 'attacker' })), /ช่องข้อมูล/);
  assert.equal(db.calls.some(row => row.table === 'fa_locations' && row.mutation), false);
});

test('a minimum entered on the item after stock was received reaches the points: points on the old standard follow, a point with its own minimum keeps it', async () => {
  const body = min => ({ action: 'item', id: ids.item, name: 'Gauze', category: 'เวชภัณฑ์', unit: 'ซอง', min, trackExpiry: true });
  const other = randomUUID(); const foreign = randomUUID();
  // received first: the point row was created with the standard of that moment (0); a second point was given its own minimum
  db.tables.fa_items[0].min = 0;
  db.tables.fa_location_items = [
    { id: randomUUID(), company_id: 'amt', item_id: ids.item, location_id: ids.location, min: 0 },
    { id: randomUUID(), company_id: 'amt', item_id: ids.item, location_id: other, min: 7 },
    { id: randomUUID(), company_id: 'amt', item_id: randomUUID(), location_id: ids.location, min: 0 },   // another item
    { id: foreign, company_id: 'other', item_id: ids.item, location_id: ids.location, min: 0 },          // another company
  ];
  const mins = () => db.tables.fa_location_items.map(row => row.min);
  await server.manageFirstAid(request('manage', body(4)));
  assert.equal(db.tables.fa_items[0].min, 4);
  assert.deepEqual(mins(), [4, 7, 0, 0]);
  // raising the standard again moves the same point, still not the one with its own value
  await server.manageFirstAid(request('manage', body(6)));
  assert.deepEqual(mins(), [6, 7, 0, 0]);
  // saving the item without touching the minimum (a rename) writes nothing to the points
  const before = db.calls.filter(row => row.table === 'fa_location_items' && row.mutation).length;
  await server.manageFirstAid(request('manage', { ...body(6), name: 'Gauze pad' }));
  assert.equal(db.calls.filter(row => row.table === 'fa_location_items' && row.mutation).length, before);
  assert.deepEqual(mins(), [6, 7, 0, 0]);
});

test('the item form can set the minimum of single points: an explicit point value wins over the standard, and only points of this company that hold the item change', async () => {
  const body = (min, points) => ({ action: 'item', id: ids.item, name: 'Gauze', category: 'เวชภัณฑ์', unit: 'ซอง', min, trackExpiry: true, ...(points ? { points } : {}) });
  const other = randomUUID(); const empty = randomUUID();
  db.tables.fa_items[0].min = 2;
  db.tables.fa_location_items = [
    { id: randomUUID(), company_id: 'amt', item_id: ids.item, location_id: ids.location, min: 2 },   // on the standard
    { id: randomUUID(), company_id: 'amt', item_id: ids.item, location_id: other, min: 2 },          // on the standard, then set here
    { id: randomUUID(), company_id: 'other', item_id: ids.item, location_id: other, min: 2 },        // another company, same ids
  ];
  const mins = () => db.tables.fa_location_items.map(row => row.min);
  // standard 2 → 5 while one point is given 9: the untouched point follows, the edited one gets its own number
  await server.manageFirstAid(request('manage', body(5, [{ locationId: other, min: 9 }])));
  assert.equal(db.tables.fa_items[0].min, 5);
  assert.deepEqual(mins(), [5, 9, 2]);
  // a point alone, standard unchanged; a point that does not hold the item creates nothing
  await server.manageFirstAid(request('manage', body(5, [{ locationId: ids.location, min: 0 }, { locationId: empty, min: 4 }])));
  assert.deepEqual(mins(), [0, 9, 2]);
  assert.equal(db.tables.fa_location_items.length, 3);
  // malformed or out-of-place input is refused before anything is written
  const writes = () => db.calls.filter(row => row.mutation && ['fa_items', 'fa_location_items'].includes(row.table)).length; const before = writes();
  await assert.rejects(server.manageFirstAid(request('manage', body(5, 'x'))), error => error.status === 400);
  await assert.rejects(server.manageFirstAid(request('manage', body(5, [{ locationId: other, min: -1 }]))), error => error.status === 400);
  await assert.rejects(server.manageFirstAid(request('manage', body(5, [{ locationId: 'not-an-id', min: 1 }]))), error => error.status === 400);
  await assert.rejects(server.manageFirstAid(request('manage', body(5, [{ locationId: other, min: 1, company_id: 'other' }]))), /ช่องข้อมูล/);
  await assert.rejects(server.manageFirstAid(request('manage', body(5, [{ locationId: other, min: 1 }, { locationId: other, min: 2 }]))), /ซ้ำกัน/);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'item', createId: randomUUID(), name: 'New', category: 'ยา', unit: 'เม็ด', min: 1, trackExpiry: true, points: [{ locationId: other, min: 1 }] })), /หลังสร้างรายการ/);
  assert.equal(writes(), before);
  assert.deepEqual(mins(), [0, 9, 2]);
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

test('shared-use items: uses never deduct stock, opened container follows the shorter of label expiry and open life', () => {
  const model = load('src/lib/first-aid/model.ts');
  const eyewash = { id: 'eyewash', name: 'ยาล้างตา', generic: '', description: '', category: 'ยา', unit: 'ขวด', min: 1, trackExpiry: true, icon: 'bottle', imageUrl: null, hasImage: false, imageSource: '', dispenseMode: 'shared', openLifeDays: 28 };
  const state = { asOf: '2026-11-09', items: [eyewash], lots: [{ id: 'l1', itemId: 'eyewash', locationId: 'p1', code: 'A', expiry: '2027-06-30', quantity: 2 }],
    thresholds: [{ itemId: 'eyewash', locationId: 'p1', min: 1, openedAt: '2026-10-01', openedLotCode: 'A', openedExpiry: '2027-06-30' }] };
  const [opened] = model.openedContainers(state, 'eyewash', 'p1');
  assert.equal(opened.until, '2026-10-29'); // 28 days after opening beats the label expiry
  assert.equal(opened.expired, true);
  assert.equal(model.itemStatus(state, eyewash, 'p1').key, 'open_expired');
  assert.equal(model.balance(state, 'eyewash', 'p1'), 2); // spares untouched
  // Fresh bottle with no spares and min 0 is still usable.
  const fresh = { ...state, items: [{ ...eyewash, min: 0 }], lots: [], thresholds: [{ ...state.thresholds[0], min: 0, openedAt: '2026-11-01' }] };
  assert.equal(model.itemStatus(fresh, fresh.items[0], 'p1').key, 'ok');
  // Payload validation: usage is only 'use' | 'open', and 'open' is always a single container.
  const base = { idempotencyKey: randomUUID(), kind: 'issue', locationId: randomUUID(), date: '2026-11-09', requester: { name: 'x', department: 'y' } };
  const parsed = validation.parseTransaction({ ...base, lines: [{ itemId: randomUUID(), quantity: 3, usage: 'use' }] }, '2026-11-09');
  assert.equal(parsed.lines[0].usage, 'use');
  assert.throws(() => validation.parseTransaction({ ...base, lines: [{ itemId: randomUUID(), quantity: 2, usage: 'open' }] }, '2026-11-09'), /ครั้งละ 1/);
  assert.throws(() => validation.parseTransaction({ ...base, lines: [{ itemId: randomUUID(), quantity: 1, usage: 'refill' }] }, '2026-11-09'), /รูปแบบการใช้/);
});

test('fixed equipment: never offered for dispensing, worded as complete/missing, write-offs grouped by reason', () => {
  const model = load('src/lib/first-aid/model.ts');
  const base = { generic: '', description: '', category: 'อุปกรณ์', min: 1, trackExpiry: false, icon: 'device', imageUrl: null, hasImage: false, imageSource: '', openLifeDays: null };
  const scissors = { ...base, id: 'scissors', name: 'กรรไกร', unit: 'อัน', dispenseMode: 'fixed' };
  const aed = { ...base, id: 'aed', name: 'เครื่อง AED', unit: 'เครื่อง', dispenseMode: 'fixed', trackExpiry: true };
  const gloves = { ...base, id: 'gloves', name: 'ถุงมือยาง', unit: 'คู่', dispenseMode: 'unit' };
  assert.equal(model.isDispensable(scissors), false);
  assert.equal(model.isDispensable(gloves), true); // consumables filed under "อุปกรณ์" stay dispensable
  const state = { asOf: '2026-11-13', items: [scissors, aed, gloves], thresholds: [],
    lots: [{ id: 'a', itemId: 'scissors', locationId: 'p1', code: 'X', expiry: null, quantity: 1 }, { id: 'b', itemId: 'aed', locationId: 'p1', code: 'PAD', expiry: '2026-10-31', quantity: 1 }] };
  assert.equal(model.statusLabel(scissors, model.itemStatus(state, scissors).key), 'ครบ');
  assert.equal(model.statusLabel(gloves, model.itemStatus(state, gloves).key), 'หมด');
  // AED pads past their date: still physically there (can be written off or re-dated), shown as past due.
  const aedStatus = model.itemStatus(state, aed);
  assert.equal(aedStatus.key, 'expired');
  assert.equal(model.statusLabel(aed, aedStatus.key), 'เกินกำหนด');
  assert.equal(model.physicalQty(state, 'aed', 'p1'), 1);
  assert.equal(model.balance(state, 'aed', 'p1'), 0);
  assert.equal(model.writeOffReason('ชำรุด — จอแตก'), 'damaged');
  assert.equal(model.writeOffReason('สูญหาย'), 'lost');
  assert.equal(model.writeOffReason('ตรวจนับ 2026-11-13: นับได้ 0 ระบบ 1 (ไม่พบที่จุด — สูญหาย)'), 'lost');
  assert.equal(model.writeOffReason('ตรวจนับ 2026-11-13: นับได้ 3 ระบบ 5 (ใช้ไปโดยไม่ได้บันทึก)'), 'uncounted');
  assert.equal(model.writeOffReason('ตรวจนับ 2026-11-13: หมดอายุ 2026-10-01'), 'expired');
  assert.equal(model.writeOffReason('อื่น ๆ — บริจาค'), 'other');
  assert.equal(model.writeOffReason('อื่น ๆ — เสียหายจากน้ำท่วม'), 'damaged');
  assert.equal(model.writeOffReason('อื่น ๆ — หายตอนย้ายตู้'), 'lost');
});

test('shared default pictures: matched by keyword on the item name, brand-specific, own picture first', async () => {
  const d = load('src/lib/first-aid/default-images.ts');
  assert.equal(d.normalizeName('BETADINE SOLUTION (30 ml)'), 'betadine solution 30 ml');
  // Suggested keyword keeps the brand and drops strength / pack size.
  assert.equal(d.suggestKeyword('Paracetamol 500 mg'), 'paracetamol');
  assert.equal(d.suggestKeyword('ยาหยอดตา Hista-Oph'), 'hista oph');
  assert.equal(d.suggestKeyword('Burnol / ยาทาแผลไฟไหม้ 10 g'), 'burnol');
  assert.equal(d.suggestKeyword('ถุงมือยาง M'), 'ถุงมือยาง');
  assert.equal(d.suggestKeyword('Cotton ball sterile ถุงเล็ก'), 'cotton ball sterile');
  assert.equal(d.suggestKeyword('Gauze pad 3x3'), 'gauze pad');
  assert.equal(d.suggestKeyword('ยาธาตุน้ำขาว 60 ml'), 'ยาธาตุน้ำขาว');
  const defaults = [
    { id: 'para', keywords: ['paracetamol', 'พารา'] }, { id: 'ors', keywords: ['ors'] }, { id: 'cotton-ball', keywords: ['cotton ball'] },
    { id: 'betadine', keywords: ['betadine'] }, { id: 'betadine-scrub', keywords: ['betadine scrub'] }, { id: 'hista', keywords: ['hista oph'] },
  ];
  const pick = name => d.pickDefault(name, defaults)?.id || null;
  assert.equal(pick('Paracetamol'), 'para');
  assert.equal(pick('พาราเซตามอล 500 มก.'), 'para');
  assert.equal(pick('ORS ผงเกลือแร่'), 'ors');
  assert.equal(pick('Norgesic'), null); // "ors" must start a word
  assert.equal(pick('Cotton ball sterile ถุงใหญ่'), 'cotton-ball');
  assert.equal(pick('Cotton bud'), null); // a different product does not borrow the picture
  assert.equal(pick('BETADINE SCRUB 500 ML'), 'betadine-scrub'); // the longer keyword wins
  assert.equal(pick('BETADINE SOLUTION (30 ml)'), 'betadine');
  assert.equal(pick('Poly oph'), null); // another brand of eye drops keeps its pictogram
  assert.deepEqual(d.parseKeywords(' Paracetamol, พารา ;sara,  paracetamol '), ['paracetamol', 'พารา', 'sara']);
});

test('shared default pictures reach every company and the public page, never replace a company picture, and only admins manage them', async () => {
  db.storage = { from: () => ({ createSignedUrls: async paths => ({ data: paths.map(p => ({ path: p, signedUrl: `https://signed.test/${p}` })) }) }) };
  db.tables.fa_default_images = [{ id: randomUUID(), title: 'Gauze pad', keywords: ['gauze'], image_path: 'shared.defaults/abc.webp', image_source: '' }];
  // No picture of its own → the shared default; staff without admin rights do not receive the library itself.
  let state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.items[0].hasImage, false);
  assert.equal(state.items[0].imageDefault, true);
  assert.equal(state.items[0].imageUrl, 'https://signed.test/shared.defaults/abc.webp');
  assert.deepEqual(state.defaultImages, []);
  const pub = await server.loadPublicFirstAidState(token);
  assert.equal(pub.items[0].imageUrl, 'https://signed.test/shared.defaults/abc.webp');
  // Admin sees the library.
  state = await server.loadFirstAidState('amt', { ...actor(), isAdmin: true });
  assert.equal(state.defaultImages.length, 1);
  assert.deepEqual(state.defaultImages[0].keywords, ['gauze']);
  // The company's own picture always wins.
  db.tables.fa_items[0].image_path = `amt/${ids.item}/own.webp`;
  state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.items[0].hasImage, true);
  assert.equal(state.items[0].imageDefault, false);
  assert.equal(state.items[0].imageUrl, `https://signed.test/amt/${ids.item}/own.webp`);
  // Only an admin may create or change defaults.
  await assert.rejects(() => server.manageFirstAid(request('manage', { action: 'default-image-add', itemId: ids.item })), /ผู้ดูแลระบบ/);
  await assert.rejects(() => server.manageFirstAid(request('manage', { action: 'default-image-delete', id: db.tables.fa_default_images[0].id })), /ผู้ดูแลระบบ/);
  assert.equal(db.tables.fa_default_images.length, 1);
});

test('current QR: shown again without changing it, older links adopted only when they match, token never in any state', async () => {
  const hash = value => createHash('sha256').update(value).digest('hex');
  const point = () => db.tables.fa_locations[0];
  const link = `https://tools.eashe.org/first-aid/take/${token}`;
  // A QR made before links were kept: the server only knows the fingerprint.
  let state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.locations[0].hasPublicLink, true);
  assert.equal(state.locations[0].qrViewable, false);
  assert.deepEqual(await server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.location })), { ok: true, known: false });
  assert.equal(point().public_token, undefined);
  // Someone else's or an old link is refused and nothing is stored.
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'qr-adopt', locationId: ids.location, link: `https://tools.eashe.org/first-aid/take/${'b'.repeat(64)}` })), /ไม่ใช่ QR ที่ใช้งานอยู่/);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'qr-adopt', locationId: ids.location, link: 'https://tools.eashe.org/first-aid' })), /ไม่ใช่ QR ที่ใช้งานอยู่/);
  assert.equal(point().public_token, undefined);
  // The live link (pasted with stray spaces / capitals) is accepted; the poster on the wall keeps working.
  const adopted = await server.manageFirstAid(request('manage', { action: 'qr-adopt', locationId: ids.location, link: `  ${link.toUpperCase().replace('HTTPS://TOOLS.EASHE.ORG/FIRST-AID/TAKE/', 'https://tools.eashe.org/first-aid/take/')}  ` }));
  assert.equal(adopted.url, link);
  assert.equal(point().public_token, token);
  assert.equal(point().public_token_hash, hash(token));
  const shown = await server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.location }));
  assert.equal(shown.known, true); assert.equal(shown.url, link); assert.equal(typeof shown.qrSvg, 'string');
  assert.equal(point().public_token_hash, hash(token), 'looking at the QR must not change it');
  // The token itself never travels in staff or public state.
  state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.locations[0].qrViewable, true);
  assert.equal(JSON.stringify(state).includes(token), false);
  assert.equal(JSON.stringify(state).includes('public_token'), false);
  const pub = await server.loadPublicFirstAidState(token);
  assert.equal(JSON.stringify(pub).includes(token), false);
  assert.equal(pub.locations[0].qrViewable, false);
  // Changing the QR keeps the new link, so it can be shown again later.
  const rotated = await server.manageFirstAid(request('manage', { action: 'rotate-token', locationId: ids.location }));
  assert.notEqual(rotated.url, link);
  assert.equal(point().public_token_hash, hash(point().public_token));
  assert.equal((await server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.location }))).url, rotated.url);
  // A stored link that no longer matches the fingerprint is never shown.
  point().public_token = token;
  assert.deepEqual(await server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.location })), { ok: true, known: false });
  // A poster made before links were kept: the first scan teaches the server its link — nothing else changes.
  delete point().public_token; point().public_token_hash = hash(token);
  await server.loadPublicFirstAidState(token);
  assert.equal(point().public_token, token);
  assert.equal(point().public_token_hash, hash(token));
  assert.equal((await server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.location }))).url, link);
  // A dead link never gets stored, and a nurse-desk point is not opened up by a scan.
  delete point().public_token;
  await assert.rejects(server.loadPublicFirstAidState('b'.repeat(64)), error => error.status === 404);
  point().issue_mode = 'controlled';
  await assert.rejects(server.loadPublicFirstAidState(token), error => error.status === 403);
  assert.equal(point().public_token, undefined);
  point().issue_mode = 'self_service';
  // Other companies' points and points without a QR are out of reach.
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.otherLocation })));
  point().public_token_hash = null;
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.location })), /ยังไม่มี QR/);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'qr-show', locationId: ids.location, link })), /ช่องข้อมูล/);
});

test('symptom chips: short keys do not catch unrelated names, dizziness remedies are findable', () => {
  const browse = load('src/lib/first-aid/browse.ts');
  const tags = (name, description = '', generic = '') => browse.SYMPTOMS.filter(t => browse.matchesSymptom(t, { name, generic, description })).map(t => t.id);
  assert.deepEqual(tags('Tylenol 500 mg', 'แก้ปวด ลดไข้', 'ยารับประทาน / ยาเม็ด (Paracetamol)'), ['pain']);
  assert.deepEqual(tags('ENO'), ['stomach']);
  assert.deepEqual(tags('ORS'), ['diarrhea']);
  assert.deepEqual(tags('Zambuk 18 g', 'ขี้ผึ้งทาแก้ปวดบวม ฟกช้ำ แมลงกัดต่อย'), ['pain']);
  assert.deepEqual(tags('ชุดAmbubag'), ['equipment']);
  assert.equal(tags('Lister bandage scissors').includes('diarrhea'), false);
  assert.equal(tags('Ammonia 450ml').includes('nausea'), true);
  assert.equal(tags('ยาดมตราโป๊ยเซียน', 'สูดดมแก้วิงเวียน คัดจมูก').includes('nausea'), true);
  assert.equal(tags('Trinolone oral paste 1 g', 'ทาแผลในปาก ร้อนใน', 'ยาใช้ภายนอก / ยาป้ายปาก').includes('allergy'), false);
});

test('illness report: stated reason first, medicine second, restocking and supplies kept apart, no names in rows', () => {
  const health = load('src/lib/first-aid/health.ts');
  const item = (name, description = '', generic = '') => ({ id: randomUUID(), name, generic, description, category: 'ยา', unit: 'เม็ด', dispenseMode: 'unit' });
  const group = (name, description, generic) => health.itemHealthGroup(item(name, description, generic));
  // medicine → group: body site before broad words, brand before description
  assert.equal(group('Tylenol 500 mg', 'แก้ปวด ลดไข้', 'ยารับประทาน / ยาเม็ด (Paracetamol)'), 'fever');
  assert.equal(group('Norgesic', 'คลายกล้ามเนื้อ ปวดเมื่อย', 'ยารับประทาน / ยาเม็ด (Orphenadrine + Paracetamol)'), 'muscle');
  assert.equal(group('Hista-Oph ยาหยอดตา 5 ml', 'ตาแดง คันตา ระคายเคืองจากภูมิแพ้'), 'eye');
  assert.equal(group('ยาธาตุน้ำขาวกระต่ายบิน 50 ml', 'ปวดท้อง ท้องเสีย ท้องอืด'), 'stomach');
  assert.equal(group('ORS'), 'diarrhea');
  assert.equal(group('Trinolone oral paste 1 g', 'ทาแผลในปาก ร้อนใน'), 'mouth');
  assert.equal(group('Siverderm cream 25 g (หลอด)'), 'burn');
  assert.equal(group('EB 3"'), 'muscle');
  assert.equal(group('Conform 2"', '', 'เวชภัณฑ์ / ผ้าพันแผล'), 'wound');
  assert.equal(group('ยาเเก้เเพ้', 'บรรเทาอาการแพ้'), 'allergy', 'double sara-e spelling is folded');
  assert.equal(group('ครีมบรรเทาการปวด', 'อาการปวดกล้ามเนื้อ แบบอุ่น', 'ยาหลอดใหญ่ ขนาด 120 กรัม'), 'muscle', 'falls back to the description');
  assert.equal(group('Face mask'), 'none');
  assert.equal(group('Plastic Bott 60 CC'), 'none');
  assert.equal(group('Vit.C'), 'other');
  // what the person said wins over the medicine
  const para = item('Paracetamol'); const ors = item('ORS'); const silver = item('Silverderm cream 25 g');
  assert.deepEqual(health.classifyDispense('ปวดเมื่อย', para), { group: 'muscle', source: 'chip', reason: 'ปวดเมื่อย' });
  assert.equal(health.classifyDispense('ปวดท้อง / ท้องเสีย · หลังอาหารกลางวัน', ors).group, 'diarrhea');
  assert.equal(health.classifyDispense('ปวดท้อง / ท้องเสีย', para).group, 'stomach');
  assert.equal(health.classifyDispense('บาดแผล', silver).group, 'burn');
  assert.deepEqual(health.classifyDispense('เติมกล่องประจำทีม', para), { group: 'none', source: 'chip', reason: 'เติมกล่องประจำทีม' });
  assert.deepEqual(health.classifyDispense('หยิบให้เพื่อน', para), { group: 'fever', source: 'medicine', reason: 'หยิบให้เพื่อน' });
  assert.equal(health.classifyDispense('หยิบให้เพื่อน · เจ็บคอ', para).group, 'cold');
  assert.deepEqual(health.classifyDispense('โดนมีดบาดนิ้ว', para), { group: 'wound', source: 'note', reason: 'โดนมีดบาดนิ้ว' });
  assert.equal(health.classifyDispense('แจ้ง จป.: ของในตู้มีปัญหา — ยาแก้ไอหมด', para).source, 'medicine', 'a cabinet problem report is not a symptom');
  assert.equal(health.classifyDispense('ฝ่ายไอที', para).source, 'medicine');
  assert.equal(health.classifyDispense('Excel Sep 2026 แถว 12 ไข้', para, true).source, 'medicine', 'imported notes are bookkeeping');
  // rows: dispenses only, department of the person treated, never a name
  const ev = (over) => ({ id: randomUUID(), documentId: randomUUID(), date: '2026-11-03', datePrecision: 'day', kind: 'issue', itemId: para.id, locationId: 'L1', quantity: 2, usage: 'stock', allocations: [], requester: { name: 'Somchai Collector', department: 'Store' }, recipientPerson: null, recipient: '', onBehalf: false, note: '', recordedBy: { id: 'u', name: 'Nurse Name', identityMethod: 'authenticated_session' }, recordingMode: 'staff', recordedAt: '', ...over });
  const rows = health.healthRows([
    ev({ note: 'ปวดหัว / ไข้' }),
    ev({ recipientPerson: { name: 'Patient Person', department: 'Production' }, onBehalf: true, recordingMode: 'self_service' }),
    ev({ kind: 'receive' }), ev({ usage: 'open' }),
    ev({ itemId: 'gone', recordingMode: 'legacy', datePrecision: 'month', requester: null }),
  ], [para], [{ id: 'L1', name: 'Cabinet 1' }]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => [r.group, r.source, r.department, r.channel]), [['fever', 'chip', 'Store', 'staff'], ['fever', 'medicine', 'Production', 'self_service'], ['other', 'medicine', '', 'legacy']]);
  assert.equal(rows[0].month, '2026-11'); assert.equal(rows[0].location, 'Cabinet 1'); assert.equal(rows[0].unit, 'เม็ด');
  assert.equal(/Somchai|Patient|Nurse/.test(JSON.stringify(rows)), false);
});

test('First Aid dates: shown and typed in the Christian era, Buddhist-era input still understood, month-only means end of month', () => {
  const { parseThaiDate, formatThaiInput, faDate, faPeriod, faDateTime } = load('src/lib/first-aid/thai-date.ts');
  const iso = (text, opts = {}) => parseThaiDate(text, { today: '2026-11-20', ...opts })?.iso ?? null;
  // what the screen shows: Thai month names, four-digit Christian-era year everywhere (also in the compact form)
  assert.equal(faDate('2026-11-24'), '24 พ.ย. 2026');
  assert.equal(faDate('2028-07-22', { short: true }), '22 ก.ค. 2028');
  assert.equal(faDate('2026-11-24', { withDay: true }), 'อ. 24 พ.ย. 2026');
  assert.equal(faDate(''), '–');
  assert.equal(faPeriod('2026-11'), 'พ.ย. 2026');
  assert.equal(faPeriod('2026-11', true), 'พฤศจิกายน 2026');
  assert.equal(faDateTime('2026-11-24T11:32:00Z'), '24 พ.ย. 2026 18:32');
  assert.equal(faDateTime('2026-12-31T18:00:00Z'), '1 ม.ค. 2027 01:00'); // Bangkok time, not UTC
  // what a date field shows after a date is typed or picked
  assert.equal(formatThaiInput('2027-12-31'), '31/12/2027');
  assert.equal(formatThaiInput(''), '');
  // full dates: Christian or Buddhist era, any separator, or digits only
  for (const text of ['31/12/2027', '31-12-2027', '31.12.2027', '31 12 2027', '31/12/2570', '31122027', '31122570', '31/12/27', '311227', '31/12/70', '311270']) assert.equal(iso(text), '2027-12-31', text);
  assert.equal(iso('1/2/2026'), '2026-02-01');
  assert.equal(iso('1/2/2569'), '2026-02-01');
  assert.equal(iso('20/11/69'), '2026-11-20');
  // a converted Buddhist-era year is flagged so the field can say so; a Christian-era one is not
  for (const [text, buddhist] of [['22/07/2028', false], ['22/07/28', false], ['22/07/2571', true], ['22/07/71', true]]) assert.deepEqual(parseThaiDate(text, { today: '2026-11-20' }), { iso: '2028-07-22', monthOnly: false, buddhist }, text);
  // month and year only is accepted for expiry dates alone, and means the last day of that month
  assert.equal(iso('12/2027'), null);
  for (const [text, buddhist] of [['12/2027', false], ['12/27', false], ['122027', false], ['1227', false], ['12/2570', true], ['12/70', true], ['122570', true]]) assert.deepEqual(parseThaiDate(text, { today: '2026-11-20', monthOnly: true }), { iso: '2027-12-31', monthOnly: true, buddhist }, text);
  assert.equal(iso('02/2028', { monthOnly: true }), '2028-02-29');
  assert.equal(iso('02/2571', { monthOnly: true }), '2028-02-29');
  assert.equal(iso('311227', { monthOnly: true }), '2027-12-31'); // six digits that are not month+year stay day/month/year
  // never month/day/year, never an impossible date
  for (const text of ['12/31/2027', '31/02/2027', '0/1/2027', '32/1/2027', '1/13/2027', '12/31/2570', 'abc', '2027', '2570', '31/12', '31/12/20270', '']) assert.equal(iso(text), null, text);
});

test('cancelled dispense tickets: cancelling needs a reason and the session actor, and they drop out of state and history unless asked for', async () => {
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'void-issue', documentId: ids.doc })), error => error.status === 400);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'void-issue', documentId: randomUUID(), reason: 'ผิดคน' })), error => error.status === 404);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'void-issue', documentId: ids.doc, reason: 'ผิดคน', actorName: 'Someone Else' })), error => error.status === 400);
  await server.manageFirstAid(request('manage', { action: 'void-issue', documentId: ids.doc, reason: ' บันทึกผิดรายการ ' }));
  const call = db.rpcCalls.find(row => row.name === 'fa_void_issue');
  assert.deepEqual(call.args, { p_company_id: 'amt', p_document_id: ids.doc, p_actor_key: `tools_users:${ids.user}`, p_actor_name: 'Test Staff', p_reason: 'บันทึกผิดรายการ' });
  // once the database has marked the ticket, it is gone from the working lists …
  Object.assign(db.tables.fa_documents[0], { voided_at: '2026-11-20T03:00:00Z', voided_by_name: 'Test Staff', void_reason: 'บันทึกผิดรายการ' });
  const state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.events.length, 0);
  const history = await server.loadFirstAidHistory(request('history?company_id=amt&from=2026-11-01&to=2026-11-30'));
  assert.equal(history.events.length, 0);
  // … and still there, marked, for the day list that shows what was cancelled
  const withVoided = await server.loadFirstAidHistory(request('history?company_id=amt&from=2026-11-01&to=2026-11-30&voided=1'));
  assert.deepEqual(withVoided.events.map(e => e.voided), [{ at: '2026-11-20T03:00:00Z', by: 'Test Staff', reason: 'บันทึกผิดรายการ' }]);
});

test('cancelled receipts: the same gate as a ticket — a reason, the session actor, a record of this company — and their own database function', async () => {
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'void-receive', documentId: ids.doc })), error => error.status === 400);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'void-receive', documentId: randomUUID(), reason: 'ผิดจำนวน' })), error => error.status === 404);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'void-receive', documentId: ids.doc, reason: 'ผิดจำนวน', actorName: 'Someone Else' })), error => error.status === 400);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'void-receive', documentId: ids.doc, reason: 'x'.repeat(301) })), error => error.status === 400);
  assert.equal(db.rpcCalls.some(row => row.name === 'fa_void_receive'), false); // nothing reached the database so far
  await server.manageFirstAid(request('manage', { action: 'void-receive', documentId: ids.doc, reason: ' ผิดจำนวน · รับจริง 3 ' }));
  const calls = db.rpcCalls.filter(row => row.name === 'fa_void_receive');
  assert.equal(calls.length, 1);
  // which records may be cancelled (kind, age, stock still there) is decided inside the database function: tests/first-aid-void-db.test.cjs
  assert.deepEqual(calls[0].args, { p_company_id: 'amt', p_document_id: ids.doc, p_actor_key: `tools_users:${ids.user}`, p_actor_name: 'Test Staff', p_reason: 'ผิดจำนวน · รับจริง 3' });
});

test('problem reports: the QR page can report without picking, scoped to its own point, capped per day, closed by staff', async () => {
  const report = (overrides = {}) => server.postPublicFirstAidTransaction(request('public/' + token, { type: 'issue-report', createId: randomUUID(), kind: 'out', detail: 'ผ้าก๊อซหมด', reporterName: 'สมชาย', reporterDepartment: 'ผลิต', ...overrides }, { auth: false }), token);
  db.tables.fa_issue_reports = [];
  assert.deepEqual(await report(), { ok: true });
  const row = db.tables.fa_issue_reports[0];
  assert.deepEqual([row.company_id, row.location_id, row.kind, row.detail, row.source, row.reporter_name], ['amt', ids.location, 'out', 'ผ้าก๊อซหมด', 'qr', 'สมชาย']);
  assert.equal(db.rpcCalls.some(call => call.name === 'fa_post_transaction'), false); // nothing is dispensed by a report
  // a retried request does not add a second row; the caller cannot choose the company, point or status
  const createId = randomUUID(); await report({ createId }); await report({ createId });
  assert.equal(db.tables.fa_issue_reports.length, 2);
  await assert.rejects(report({ locationId: ids.otherLocation }), error => error.status === 400);
  await assert.rejects(report({ status: 'closed' }), error => error.status === 400);
  await assert.rejects(report({ kind: 'anything' }), /ประเภทปัญหา/);
  await assert.rejects(report({ kind: 'other', detail: '' }), /รายละเอียด/);
  // the open page cannot flood the list
  for (const r of db.tables.fa_issue_reports) { r.created_at = new Date().toISOString(); r.status ??= 'open'; } // what the database defaults would have set
  for (let i = db.tables.fa_issue_reports.length; i < 20; i++) db.tables.fa_issue_reports.push({ id: randomUUID(), company_id: 'amt', location_id: ids.location, source: 'qr', status: 'open', created_at: new Date().toISOString(), create_id: randomUUID(), kind: 'out' });
  await assert.rejects(report(), error => error.status === 429);
  // staff see open reports in the state and close them; another company's report is out of reach
  const state = await server.loadFirstAidState('amt', actor());
  assert.equal(state.issueReports.filter(r => r.status === 'open').length, 20);
  assert.equal(state.issueReports.some(r => 'company_id' in r || 'create_id' in r), false);
  await server.manageFirstAid(request('manage', { action: 'issue-close', id: row.id, note: 'เติมแล้ว' }));
  assert.deepEqual([row.status, row.closed_by_name, row.closed_note, typeof row.closed_at], ['closed', 'Test Staff', 'เติมแล้ว', 'string']);
  const foreign = { id: randomUUID(), company_id: 'aab', location_id: ids.otherLocation, status: 'open', kind: 'out', source: 'qr', created_at: new Date().toISOString() };
  db.tables.fa_issue_reports.push(foreign);
  await assert.rejects(server.manageFirstAid(request('manage', { action: 'issue-close', id: foreign.id })), error => error.status === 404);
  assert.equal(foreign.status, 'open');
});
