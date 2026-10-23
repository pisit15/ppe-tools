const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const { NextRequest } = require('next/server');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261023110422_ppe_product_reorder_policy.sql'), 'utf8');
const ids = {
  reused: '10000000-0000-4000-8000-000000000001',
  otherCompany: '10000000-0000-4000-8000-000000000002',
  regular: '10000000-0000-4000-8000-000000000003',
  inactive: '10000000-0000-4000-8000-000000000004',
};

async function fixture() {
  const db = new PGlite();
  // Use the real catalog, transaction and stock-view definitions, before the
  // unrelated employee/auth policies in the original schema migration.
  const initial = fs.readFileSync(path.join(root, 'supabase/migrations/001_ppe_tables.sql'), 'utf8');
  const end = initial.indexOf('-- Employees');
  assert.ok(end > 0, 'Initial PPE schema includes catalog, transactions and stock view');
  await db.exec(initial.slice(0, end));
  for (const [id, company, name, active] of [
    [ids.reused, 'amt', 'หมวกเซฟตี้ มือสอง สีขาว', true],
    [ids.otherCompany, 'aab', 'รองเท้านิรภัย (มือสอง) 41', true],
    [ids.regular, 'amt', 'ถุงมือใหม่', true],
    [ids.inactive, 'aab', 'มือสอง เสื้อสะท้อนแสง', false],
  ]) {
    await db.query('INSERT INTO ppe_products (id, company_id, name, type, min_stock, is_active) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, company, name, 'equipment', 3, active]);
  }
  for (const [company, product, kind, quantity] of [
    ['amt', ids.reused, 'return', 7],
    ['amt', ids.reused, 'stock_out', 5],
    ['aab', ids.otherCompany, 'return', 2],
    ['aab', ids.otherCompany, 'borrow', 2],
    ['amt', ids.regular, 'stock_in', 20],
  ]) {
    await db.query('INSERT INTO ppe_transactions (company_id, product_id, transaction_type, quantity, unit, notes) VALUES ($1, $2, $3, $4, $5, $6)',
      [company, product, kind, quantity, 'ชิ้น', 'Preserve this transaction']);
  }
  return db;
}

async function preservedData(db) {
  return {
    products: (await db.query('SELECT id, company_id, name, type, unit, image_url, min_stock, is_active, created_at, updated_at FROM ppe_products ORDER BY id')).rows,
    transactions: (await db.query('SELECT * FROM ppe_transactions ORDER BY id')).rows,
    stock: (await db.query('SELECT * FROM ppe_stock_summary ORDER BY product_id')).rows,
  };
}

test('purchase-policy migration initializes all company catalogs once and preserves stock/history', async () => {
  const db = await fixture();
  try {
    const before = await preservedData(db);
    await db.exec(migration);
    assert.deepEqual(await preservedData(db), before);
    const policies = (await db.query('SELECT id, can_reorder FROM ppe_products ORDER BY id')).rows;
    assert.deepEqual(policies, [
      { id: ids.reused, can_reorder: false },
      { id: ids.otherCompany, can_reorder: false },
      { id: ids.regular, can_reorder: true },
      { id: ids.inactive, can_reorder: false },
    ]);

    const fresh = (await db.query("INSERT INTO ppe_products (company_id, name, type) VALUES ('amt', 'รายการใหม่ มือสอง', 'equipment') RETURNING can_reorder")).rows[0];
    assert.equal(fresh.can_reorder, true, 'Name matching is only a one-time migration, not an ongoing trigger');
    await assert.rejects(db.query('UPDATE ppe_products SET can_reorder = NULL WHERE id = $1', [ids.reused]), /not-null constraint/);
    await assert.rejects(db.query("INSERT INTO ppe_products (company_id, name, type, can_reorder) VALUES ('amt', 'Invalid null policy', 'equipment', NULL)"), /not-null constraint/);

    await db.query('UPDATE ppe_products SET can_reorder = true WHERE id = $1', [ids.reused]);
    await db.query('UPDATE ppe_products SET name = $1, min_stock = 9 WHERE id = $2', ['หมวกมือสอง เปลี่ยนชื่อ', ids.reused]);
    await db.query('UPDATE ppe_products SET name = $1 WHERE id = $2', ['รองเท้ารับคืน เปลี่ยนชื่อ', ids.otherCompany]);
    assert.deepEqual((await db.query('SELECT id, can_reorder FROM ppe_products WHERE id IN ($1, $2) ORDER BY id', [ids.reused, ids.otherCompany])).rows, [
      { id: ids.reused, can_reorder: true },
      { id: ids.otherCompany, can_reorder: false },
    ]);
    assert.deepEqual((await preservedData(db)).transactions, before.transactions);
    assert.deepEqual((await db.query('SELECT product_id, current_stock FROM ppe_stock_summary WHERE product_id IN ($1, $2, $3, $4) ORDER BY product_id', Object.values(ids))).rows,
      before.stock.map(({ product_id, current_stock }) => ({ product_id, current_stock })));
  } finally {
    await db.close();
  }
});

// A small Supabase transport adapter uses actual Postgres rows for persistence.
// It deliberately does not implement purchase-policy validation or defaults;
// those are exercised in the route and migration under test.
function databaseAdapter(db) {
  const writes = [];
  const quote = key => {
    assert.match(key, /^[a-z_]+$/);
    return `"${key}"`;
  };
  return {
    writes,
    from(table) {
      assert.equal(table, 'ppe_products');
      return {
        insert(rows) {
          assert.equal(rows.length, 1);
          const data = Object.fromEntries(Object.entries(rows[0]).filter(([, value]) => value !== undefined));
          return { async select() {
            writes.push({ action: 'insert', data });
            const keys = Object.keys(data);
            const result = await db.query(`INSERT INTO ppe_products (${keys.map(quote).join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, Object.values(data));
            return { data: result.rows, error: null };
          } };
        },
        update(data) {
          return { eq(field, id) {
            assert.equal(field, 'id');
            return { async select() {
              writes.push({ action: 'update', id, data });
              const keys = Object.keys(data);
              const result = await db.query(`UPDATE ppe_products SET ${keys.map((key, i) => `${quote(key)} = $${i + 1}`).join(', ')} WHERE id = $${keys.length + 1} RETURNING *`, [...Object.values(data), id]);
              return { data: result.rows, error: null };
            } };
          } };
        },
      };
    },
  };
}

function loadRoute(adapter) {
  const file = path.join(root, 'src/app/api/ppe/products/route.ts');
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = module.paths;
  loaded.require = name => name === '@/lib/supabase'
    ? { getSupabaseServer: () => adapter, supabase: adapter }
    : require(name);
  loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, file);
  return loaded.exports;
}

function request(method, body) {
  return new NextRequest('http://localhost:3110/api/ppe/products', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

test('product API persists boolean policies and leaves existing policies intact when omitted', async t => {
  const db = await fixture();
  try {
    await db.exec(migration);
    const adapter = databaseAdapter(db);
    const { POST, PATCH } = loadRoute(adapter);
    const before = await preservedData(db);
    const stored = async id => (await db.query('SELECT * FROM ppe_products WHERE id = $1', [id])).rows[0];

    await t.test('POST saves true and false, and omitted policy defaults to true', async () => {
      for (const policy of [true, false, undefined]) {
        const body = { company_id: 'amt', name: 'New product มือสอง', type: 'equipment' };
        if (policy !== undefined) body.can_reorder = policy;
        const response = await POST(request('POST', body));
        assert.equal(response.status, 201);
        const { data } = await response.json();
        assert.equal(data.can_reorder, policy ?? true);
        assert.equal((await stored(data.id)).can_reorder, policy ?? true);
      }
    });

    await t.test('PATCH saves both values and ordinary edits never reset them', async () => {
      for (const policy of [true, false]) {
        const response = await PATCH(request('PATCH', { id: ids.reused, can_reorder: policy }));
        assert.equal(response.status, 200);
        assert.equal((await response.json()).data.can_reorder, policy);
        assert.equal((await stored(ids.reused)).can_reorder, policy);
        const rename = await PATCH(request('PATCH', { id: ids.reused, name: 'หมวกมือสอง เปลี่ยนชื่อ', min_stock: 8 }));
        assert.equal(rename.status, 200);
        assert.equal((await rename.json()).data.can_reorder, policy);
        assert.equal((await stored(ids.reused)).can_reorder, policy);
        assert.equal(Object.hasOwn(adapter.writes.at(-1).data, 'can_reorder'), false);
      }
    });

    await t.test('POST and PATCH reject non-boolean policies before any database write', async () => {
      const count = adapter.writes.length;
      const previous = await stored(ids.reused);
      for (const value of [null, 'false', 'true', 0, 1, [], {}]) {
        for (const [method, handler, body] of [
          ['POST', POST, { company_id: 'amt', name: 'Invalid policy', type: 'equipment' }],
          ['PATCH', PATCH, { id: ids.reused }],
        ]) {
          const response = await handler(request(method, { ...body, can_reorder: value }));
          assert.equal(response.status, 400, `${method} must reject ${JSON.stringify(value)}`);
          assert.match((await response.json()).error, /boolean/);
        }
      }
      assert.equal(adapter.writes.length, count);
      assert.deepEqual(await stored(ids.reused), previous);
    });

    assert.deepEqual((await preservedData(db)).transactions, before.transactions);
    assert.equal((await stored(ids.reused)).is_active, true, 'Disabling purchase does not deactivate the item');
    assert.equal((await db.query('SELECT current_stock FROM ppe_stock_summary WHERE product_id = $1', [ids.reused])).rows[0].current_stock, 2);
  } finally {
    await db.close();
  }
});
