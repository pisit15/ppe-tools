const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  ts = require("typescript");
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:4321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "local-test-anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-test-service-secret";
process.env.TOOLS_SESSION_SECRET = "local-test-session-secret";
const cache = new Map();
function load(file) {
  const filename = path.join(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module);
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, m);
  const native = m.require.bind(m);
  m.require = (p) =>
    p.startsWith("@/")
      ? load("src/" + p.slice(2) + ".ts")
      : p.startsWith(".") &&
          fs.existsSync(path.resolve(path.dirname(filename), p) + ".ts")
        ? load(
            path.relative(
              path.join(__dirname, ".."),
              path.resolve(path.dirname(filename), p) + ".ts",
            ),
          )
        : native(p);
  m._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
  return m.exports;
}
async function setup(db) {
  await db.exec(
    "create table ppe_products(id uuid primary key default gen_random_uuid(),company_id text,name text);insert into ppe_products(company_id,name) values ('amt','Test PPE');",
  );
  await db.exec(
    fs.readFileSync(
      path.join(
        __dirname,
        "../supabase/migrations/20261015063802_work_permit.sql",
      ),
      "utf8",
    ),
  );
  await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261015090322_permit_requester_types.sql'), 'utf8'));
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash("local-test-only", 4);
  for (const [username, id] of [
    ["permit-owner", "aaaaaaaa-1111-4111-8111-111111111111"],
    ["permit-safety", "bbbbbbbb-1111-4111-8111-111111111111"],
  ])
    await db.query(
      "insert into company_users(id,username,password,company_id,company_name) values ($1,$2,$3,$4,$5)",
      [id, username, hash, "amt", "AMT"],
    );
  await db.query(
    "insert into wp_members(company_id,actor_key,display_name,role) values ('amt','company_users:aaaaaaaa-1111-4111-8111-111111111111','เจ้าของพื้นที่ทดสอบ','area_owner'),('amt','company_users:bbbbbbbb-1111-4111-8111-111111111111','จป. ทดสอบ','safety')",
  );
}
module.exports = { load, setup };
