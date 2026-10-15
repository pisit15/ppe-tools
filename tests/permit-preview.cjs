const { spawn } = require("node:child_process");
const path = require("node:path");
const { setup } = require("./permit-helpers.cjs");
const { startFixture } = require("./chemical-db-fixture.cjs");
(async () => {
  const fixture = await startFixture(4321, {
    setup,
    handle: async ({ req, url, db, json }) => {
      if (url.pathname === "/__test/expire" && req.method === "POST") {
        await db.exec(
          "update wp_contractors set expires_at=now()-interval '1 minute',starts_at=now()-interval '2 days'",
        );
        json(200, { ok: true });
        return true;
      }
      return false;
    },
  });
  console.log("Work Permit isolated test database on 4321");
  const root = path.join(__dirname, "..");
  const child = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "4320",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        NEXT_PUBLIC_PERMIT_DEMO: "true",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-test-anon",
        SUPABASE_SERVICE_ROLE_KEY: "local-test-service-secret",
        TOOLS_SESSION_SECRET: "local-test-session-secret",
      },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  const stop = () => {
    child.kill();
    fixture.server.close();
    void fixture.db.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  child.on("exit", () => {
    fixture.server.close();
    void fixture.db.close();
  });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
