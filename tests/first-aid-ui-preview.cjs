/** Isolated UI fixture. Never connects to a database or reads service credentials.
 * Run: node tests/first-aid-ui-preview.cjs
 * Open /__fixture for scenario links and observable mutation counters.
 */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.FIRST_AID_FIXTURE_PORT || 4182);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const locationId = '10000000-0000-4000-8000-000000000001';
const itemId = '20000000-0000-4000-8000-000000000001';
const lotId = '30000000-0000-4000-8000-000000000001';
const evil = '<img src=x onerror="window.__firstAidXss=1">';
const stores = new Map();
function fixture(companyId) {
  if (stores.has(companyId)) return stores.get(companyId);
  const xss = companyId === 'qa-xss';
  const state = {
    asOf: today, company: { name: 'ชุดทดสอบแยกจากระบบจริง', short: 'UI QA', infirmary: true },
    session: { id: 'fixture-staff', name: xss ? evil : 'ผู้ทดสอบ', identityMethod: 'authenticated_session' },
    permissions: { canManage: true, canClinical: true }, employees: [],
    locations: [{ id: locationId, name: xss ? evil : 'จุดทดสอบ', type: xss ? evil : 'ตู้ปฐมพยาบาล', area: xss ? evil : 'พื้นที่จำลอง', issueMode: 'self_service', lastChecked: today, inspectionIssue: false }],
    items: [{ id: itemId, name: xss ? evil : 'เวชภัณฑ์ทดสอบ', generic: xss ? evil : 'สำหรับตรวจ UI เท่านั้น', category: xss ? evil : 'เวชภัณฑ์', unit: xss ? evil : 'ชิ้น', min: 2, trackExpiry: true, icon: 'box' }],
    thresholds: [{ itemId, locationId, min: 2 }],
    lots: [{ id: lotId, itemId, locationId, code: xss ? evil : 'QA-LOT', expiry: '2099-12-31', quantity: 12 }],
    events: [], inspections: [], visits: [], historyHasMore: false,
    usageSummary: { monthUsesByLocation: [], dailyUsesByLocation: [] },
  };
  if (xss) state.events.push({ id: randomUUID(), documentId: randomUUID(), date: today, kind: 'issue', itemId, locationId, quantity: 1, requester: { name: evil, department: evil, code: evil }, recipientPerson: { name: evil, department: evil }, recordedBy: { name: evil }, recordingMode: 'staff', note: evil, allocations: [{ code: evil, expiry: '2099-12-31', quantity: 1 }] });
  const store = { state, posts: 0, committed: 0, failState: false, dropped: false, keys: new Map() };
  stores.set(companyId, store); return store;
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-First-Aid-Fixture': 'isolated-no-database' });
  res.end(JSON.stringify(data));
}
async function body(req) { let value = ''; for await (const chunk of req) { value += chunk; if (value.length > 32768) throw Error('Body too large'); } return JSON.parse(value || '{}'); }
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const companyId = url.searchParams.get('company_id') || 'qa-happy';
    const store = fixture(companyId);
    if (url.pathname === '/__fixture/status') return send(res, 200, Object.fromEntries([...stores].map(([key, value]) => [key, { posts: value.posts, committed: value.committed, items: value.state.items.length, locations: value.state.locations.length, events: value.state.events.length }])));
    if (url.pathname === '/__fixture' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(`<html lang="th"><meta charset="utf-8"><title>First Aid isolated UI QA</title><body style="font:16px system-ui;padding:35px"><h1>ชุดทดสอบ UI แยกจากระบบจริง</h1><p>ไม่มีการเชื่อมฐานข้อมูลหรือข้อมูลพนักงานจริง</p>${['qa-happy','qa-refresh','qa-uncertain','qa-xss'].map(id => `<p><a href="/first-aid/index.html?company_id=${id}">${id}</a></p>`).join('')}<p><a href="/__fixture/status">ดูจำนวนคำขอและจำนวนที่บันทึกจริง</a></p></body></html>`);
    }
    if (url.pathname === '/api/first-aid/state') {
      if (store.failState) { store.failState = false; return send(res, 503, { error: 'จำลอง: บันทึกสำเร็จแล้ว แต่โหลดข้อมูลใหม่ไม่ได้' }); }
      return send(res, 200, store.state);
    }
    if (url.pathname === '/api/first-aid/manage' && req.method === 'POST') {
      const data = await body(req); store.posts++;
      const existing = store.keys.get(data.createId);
      if (existing) return send(res, 200, existing);
      let id = data.id || data.createId || randomUUID();
      if (data.action === 'item') {
        const row = { id, name: data.name, generic: data.generic || '', category: data.category, unit: data.unit, min: data.min || 0, trackExpiry: data.trackExpiry, icon: 'box' };
        const index = store.state.items.findIndex(item => item.id === id); if (index < 0) store.state.items.push(row); else store.state.items[index] = row;
      } else if (data.action === 'location') {
        const row = { id, name: data.name, type: data.type, area: data.area, issueMode: data.issueMode, lastChecked: null, inspectionIssue: false };
        const index = store.state.locations.findIndex(point => point.id === id); if (index < 0) store.state.locations.push(row); else store.state.locations[index] = { ...store.state.locations[index], ...row };
      } else if (data.action === 'settings') store.state.company.infirmary = data.infirmary;
      else if (data.action === 'thresholds') store.state.thresholds = data.thresholds.map(row => ({ ...row, locationId: data.locationId }));
      else if (data.action === 'inspection') store.state.inspections.push({ id, locationId: data.locationId, date: today, notes: data.notes, hasIssue: data.hasIssue });
      else if (data.action === 'visit') store.state.visits.push({ id, ...data });
      else return send(res, 400, { error: 'ฟังก์ชันนี้ไม่ได้อยู่ในชุดทดสอบ' });
      const result = { ok: true, id }; store.committed++; if (data.createId) store.keys.set(data.createId, result);
      if (companyId === 'qa-refresh') store.failState = true;
      if (companyId === 'qa-uncertain' && !store.dropped) { store.dropped = true; return req.socket.destroy(); }
      return send(res, 200, result);
    }
    if (url.pathname === '/api/first-aid/transactions' && req.method === 'POST') {
      const data = await body(req); store.posts++;
      if (store.keys.has(data.idempotencyKey)) return send(res, 200, store.keys.get(data.idempotencyKey));
      const before = structuredClone(store.state), documentId = randomUUID(), events = [];
      for (const line of data.lines) {
        const lot = before.lots.find(row => row.itemId === line.itemId && row.locationId === data.locationId && (!line.lotId || row.id === line.lotId));
        if (!lot || !Number.isSafeInteger(line.quantity) || line.quantity <= 0 || line.quantity > lot.quantity) return send(res, 409, { error: 'ยอดไม่เพียงพอ' });
        lot.quantity -= line.quantity;
        const requester = data.requesterPerson, recipientPerson = data.onBehalf ? data.recipientPerson : requester;
        events.push({ id: randomUUID(), documentId, date: data.date, kind: data.kind, itemId: line.itemId, locationId: data.locationId, quantity: line.quantity, requester, recipientPerson, recordedBy: { id: 'fixture-staff', name: 'ผู้ทดสอบ', identityMethod: 'authenticated_session' }, recordingMode: 'staff', onBehalf: !!data.onBehalf, allocations: [{ lotId: lot.id, code: lot.code, expiry: lot.expiry, quantity: line.quantity }], note: data.note || '' });
      }
      before.events.unshift(...events); store.state = before; store.committed++;
      const result = { events, documentId }; store.keys.set(data.idempotencyKey, result);
      if (companyId === 'qa-refresh') store.failState = true;
      if (companyId === 'qa-uncertain' && !store.dropped) { store.dropped = true; return req.socket.destroy(); }
      return send(res, 200, result);
    }
    const pathname = decodeURIComponent(url.pathname);
    if (!pathname.startsWith('/first-aid/') && !['/fonts/NotoSansThai.ttf', '/ea-logo.svg'].includes(pathname)) return send(res, 404, { error: 'Not found' });
    const filename = path.resolve(root, 'public', '.' + pathname);
    if (!filename.startsWith(path.resolve(root, 'public') + path.sep)) return send(res, 403, { error: 'Not allowed' });
    const bytes = await fs.readFile(filename);
    const mime = { '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' }[path.extname(filename)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store', 'X-First-Aid-Fixture': 'isolated-no-database' }); res.end(bytes);
  } catch (error) { send(res, 500, { error: error.message }); }
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`First Aid isolated UI fixture: http://127.0.0.1:${port}/__fixture\n`));
