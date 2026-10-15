const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load, setup } = require("./permit-helpers.cjs");
const { createDb } = require("./chemical-db-fixture.cjs");
const { transition, documentHash } = load("src/lib/permit/workflow.ts");
const { validateData, assertReady, validateTemplate } = load(
  "src/lib/permit/validation.ts",
);
const { PERMIT_SEEDS } = load("src/lib/permit/catalog.ts");
const { issuePermitSession, decodePermitSession, canReadPermit } = load(
  "src/lib/permit/session.ts",
);
const { verifyToolsSession } = load("src/lib/toolsSession.ts");
const signature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmV8AAAAASUVORK5CYII=";
const requester = {
  key: "contractor:test",
  name: "Requester",
  companyId: "amt",
  contractor: true,
  admin: false,
  roles: [],
};
const owner = {
  key: "company_users:owner",
  name: "Owner",
  companyId: "amt",
  contractor: false,
  admin: false,
  roles: ["area_owner"],
};
const safety = {
  key: "company_users:safety",
  name: "Safety",
  companyId: "amt",
  contractor: false,
  admin: false,
  roles: ["safety"],
};
const template = {
  ...PERMIT_SEEDS[0],
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  active: true,
};
function data() {
  return {
    title: "Test job",
    location: "Area",
    detail: "Work",
    contractorName: "Test company",
    phone: "000",
    workers: "Tester",
    startsAt: new Date(Date.now() - 60000).toISOString(),
    endsAt: new Date(Date.now() + 3600000).toISOString(),
    fireImpact: "None",
    project: false,
    forms: [
      {
        template: structuredClone(template),
        answers: Object.fromEntries(
          template.config.fields.map((f) => [
            f.id,
            f.kind === "check" ? "yes" : "Test answer",
          ]),
        ),
      },
    ],
    approvers: { area_owner: owner.key, safety: safety.key },
    attachments: [],
    signatures: [],
    events: [],
  };
}
function permit() {
  return {
    id: crypto.randomUUID(),
    company_id: "amt",
    created_by: requester.key,
    status: "draft",
    version: 1,
    data: data(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
function act(p, a, action, extra = {}) {
  return transition(p, a, action, {
    signature,
    confirm: true,
    note: "Verified",
    ...extra,
  });
}
test("contractor tokens cannot authorize Tools, expire precisely and reject tampering", () => {
  const token = issuePermitSession({
    id: "x",
    password_hash: "hash",
    expires_at: new Date(Date.now() + 60000).toISOString(),
  });
  assert.equal(decodePermitSession(token).id, "x");
  assert.equal(verifyToolsSession(token), null);
  assert.equal(decodePermitSession(token + "x"), null);
  const now = Date.now;
  Date.now = () => now() + 60001;
  try {
    assert.equal(decodePermitSession(token), null);
  } finally {
    Date.now = now;
  }
});
test("company isolation and contractor ownership cannot be bypassed", () => {
  const p = permit();
  assert.doesNotThrow(() => canReadPermit(requester, p));
  assert.throws(() =>
    canReadPermit({ ...requester, key: "contractor:other" }, p),
  );
  assert.throws(() => canReadPermit({ ...owner, companyId: "aab" }, p));
});
test("workflow requires separate ordered signers and explicitly opens and closes work", () => {
  let p = permit();
  p = act(p, requester, "submit");
  assert.equal(p.status, "submitted");
  assert.throws(() => act(p, safety, "approve"));
  assert.throws(() => act(p, requester, "approve"));
  p = act(p, owner, "approve");
  assert.equal(p.status, "submitted");
  p = act(p, safety, "approve");
  assert.equal(p.status, "approved");
  assert.throws(() => act(p, requester, "start"));
  p = act(p, owner, "start");
  assert.equal(p.status, "active");
  p = act(p, safety, "inspect", { unsafe: true });
  assert.equal(p.status, "suspended");
  assert.throws(() => act(p, requester, "resume"));
  p = act(p, owner, "resume");
  p = act(p, requester, "request_close");
  assert.throws(() => act(p, safety, "close"));
  p = act(p, owner, "close");
  p = act(p, safety, "close");
  assert.equal(p.status, "closed");
  assert.equal(p.data.signatures.length, 7);
  assert.throws(() => act(p, owner, "start"));
});
test("future work, expired work and missing consent cannot be approved/opened", () => {
  let p = permit();
  assert.throws(() => act(p, requester, "submit", { confirm: false }));
  p = act(p, requester, "submit");
  p.data.endsAt = new Date(Date.now() - 1000).toISOString();
  assert.throws(() => act(p, owner, "approve"));
  p = permit();
  p.data.startsAt = new Date(Date.now() + 600000).toISOString();
  p = act(
    act(act(p, requester, "submit"), owner, "approve"),
    safety,
    "approve",
  );
  assert.throws(() => act(p, owner, "start"));
});
test("returned requests retain the signed document and invalidate previous approvals", () => {
  let p = act(act(permit(), requester, "submit"), owner, "approve");
  const hash = documentHash(p.data);
  p = act(p, safety, "return");
  assert.equal(p.status, "draft");
  assert.ok(p.data.signatures.every((s) => s.stage.startsWith("superseded:")));
  assert.equal(documentHash(p.data.events.at(-1).document), hash);
  p = act(p, requester, "submit");
  p = act(p, owner, "approve");
  assert.equal(p.status, "submitted");
});
test("required checklists fail closed and N/A needs a reason", () => {
  const d = data();
  d.forms[0].answers.check_1 = "no";
  assert.throws(() => assertReady(d));
  d.forms[0].answers.check_1 = "na:";
  assert.throws(() => assertReady(d));
  d.forms[0].answers.check_1 = "na:ไม่มีเครื่องจักร";
  assert.doesNotThrow(() => assertReady(d));
  d.approvers.safety = owner.key;
  assert.throws(() => act({ ...permit(), data: d }, requester, "submit"));
});
test("template snapshots and attachments are validated server side", () => {
  const d = data();
  d.forms[0].template.config = { fields: [], roles: [] };
  const sanitized = validateData(d, [template]);
  assert.ok(sanitized.forms[0].template.config.fields.length > 0);
  assert.throws(() => validateData(d, [{ ...template, active: false }]));
  assert.throws(() => validateTemplate({ fields: [], roles: [] }));
  d.attachments = [
    {
      name: "fake.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,SGVsbG8=",
    },
  ];
  assert.throws(() => validateData(d, [template]));
});
test("database denies direct clients, template mutation, audit erasure and stale writes", async () => {
  const db = await createDb();
  try {
    await db.exec('alter default privileges in schema public grant all on tables to service_role,anon,authenticated');
    await setup(db);
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      for (const table of [
        "wp_contractors",
        "wp_templates",
        "wp_permits",
        "wp_members",
        "wp_login_limits",
      ])
        await assert.rejects(
          db.query("select * from " + table),
          /permission denied/,
        );
      await assert.rejects(
        db.query("select wp_login_attempt('x')"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const p = permit();
    await db.query(
      "insert into wp_permits(id,company_id,created_by,data) values($1,$2,$3,$4)",
      [p.id, "amt", requester.key, JSON.stringify(p.data)],
    );
    await assert.rejects(
      db.query("update wp_permits set version=version+1 where id=$1", [p.id]),
      /append only/,
    );
    const n = act(p, requester, "submit");
    await db.query(
      "update wp_permits set data=$1,version=2,status=$2 where id=$3 and version=1",
      [JSON.stringify(n.data), n.status, p.id],
    );
    assert.equal(
      (
        await db.query(
          "update wp_permits set version=3 where id=$1 and version=1 returning id",
          [p.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("delete from wp_permits"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update wp_templates set config='{}'"),
      /permission denied/,
    );
    for (let i = 0; i < 10; i++)
      assert.equal(
        (await db.query("select wp_login_attempt('limited') as ok")).rows[0].ok,
        true,
      );
    assert.equal(
      (await db.query("select wp_login_attempt('limited') as ok")).rows[0].ok,
      false,
    );
  } finally {
    await db.close();
  }
});
test('document hashes survive JSONB key reordering and archive projection', () => {
  const original=data();
  function reverse(value){if(Array.isArray(value))return value.map(reverse);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverse(v)]));return value;}
  const reordered=reverse(original);delete reordered.events;
  assert.equal(documentHash(reordered),documentHash(original));
  reordered.title='Tampered';assert.notEqual(documentHash(reordered),documentHash(original));
});
