// Compile-only verification. Do not deploy this output: it uses non-production placeholders.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'build'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://chemical-build.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'build-only-placeholder', SUPABASE_SERVICE_ROLE_KEY: 'build-only-placeholder', TOOLS_SESSION_SECRET: 'build-only-placeholder' },
});
process.exit(result.status ?? 1);
