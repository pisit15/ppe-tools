const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createDb } = require("./chemical-db-fixture.cjs");
test("migration denies direct client access and service updates; RPC checks scope, active record and retry identity", async () => {
  const db = await createDb();
  try {
    const privileges = (
      await db.query(`select c.relrowsecurity,
      has_table_privilege('anon','public.chem_poster_versions','SELECT') as anon_read,
      has_table_privilege('authenticated','public.chem_poster_versions','INSERT') as user_write,
      has_table_privilege('service_role','public.chem_poster_versions','UPDATE') as service_update,
      has_table_privilege('service_role','public.chem_poster_versions','DELETE') as service_delete,
      has_function_privilege('anon','public.chem_save_poster_version(uuid,text,uuid,text,jsonb,jsonb)','EXECUTE') as anon_rpc,
      has_function_privilege('authenticated','public.chem_save_poster_version(uuid,text,uuid,text,jsonb,jsonb)','EXECUTE') as user_rpc
      from pg_class c where c.oid='public.chem_poster_versions'::regclass`)
    ).rows[0];
    assert.deepEqual(privileges, {
      relrowsecurity: true,
      anon_read: false,
      user_write: false,
      service_update: false,
      service_delete: false,
      anon_rpc: false,
      user_rpc: false,
    });
    const id = "11111111-1111-4111-8111-111111111111";
    const args = [
      id,
      "amt",
      randomUUID(),
      "test",
      '{"schema":1}',
      '{"id":"verified-actor"}',
    ];
    const sql =
      "select * from public.chem_save_poster_version($1,$2,$3,$4,$5::jsonb,$6::jsonb)";
    await db.exec("set role service_role");
    const before = (
      await db.query("select updated_at from chem_substances where id=$1", [id])
    ).rows[0];
    const first = (await db.query(sql, args)).rows[0];
    assert.equal(first.version, 1);
    assert.equal((await db.query(sql, args)).rows[0].id, first.id);
    await assert.rejects(
      db.query(sql, [id, "aab", randomUUID(), "test", "{}", "{}"]),
      /unavailable/,
    );
    await assert.rejects(
      db.query(sql, [...args.slice(0, 3), "changed", ...args.slice(4)]),
      /already used/,
    );
    await assert.rejects(
      db.query("update chem_poster_versions set title=$1 where id=$2", [
        "overwrite",
        first.id,
      ]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from chem_poster_versions where id=$1", [first.id]),
      /permission denied/,
    );
    assert.deepEqual(
      (
        await db.query("select updated_at from chem_substances where id=$1", [
          id,
        ])
      ).rows[0],
      before,
    );
  } finally {
    await db.close();
  }
});

test("templates are admin-server managed and unavailable directly to clients", async () => {
  const db = await createDb();
  try {
    assert.equal(
      (await db.query("select count(*)::int as n from chem_poster_templates"))
        .rows[0].n,
      3,
    );
    assert.equal(
      (
        await db.query(
          "select config->>'formCode' as code from chem_poster_templates where config->>'layout'='aab'",
        )
      ).rows[0].code,
      "AAB-AABX-OHS-FM-031",
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(
        db.query("select * from chem_poster_templates"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from chem_poster_versions"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("poster default is nullable, references an existing template, and preserves company settings", async () => {
  const db = await createDb();
  try {
    await db.exec("set role service_role");
    const before = (
      await db.query(
        "select * from chem_company_settings where company_id='amt'",
      )
    ).rows[0];
    assert.equal(before.default_poster_template_id, null);
    const id = (
      await db.query(
        "select id from chem_poster_templates where config->>'layout'='amt'",
      )
    ).rows[0].id;
    await db.query(
      "update chem_company_settings set default_poster_template_id=$1 where company_id='amt'",
      [id],
    );
    const after = (
      await db.query(
        "select * from chem_company_settings where company_id='amt'",
      )
    ).rows[0];
    assert.equal(after.default_poster_template_id, id);
    assert.deepEqual(after.emergency_contacts, before.emergency_contacts);
    assert.equal(after.sds_review_years, before.sds_review_years);
    await assert.rejects(
      db.query(
        "update chem_company_settings set default_poster_template_id=$1 where company_id='amt'",
        [randomUUID()],
      ),
      /foreign key/,
    );
    await db.exec("reset role; set role authenticated");
    await assert.rejects(
      db.exec(
        "update chem_company_settings set default_poster_template_id=null",
      ),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
