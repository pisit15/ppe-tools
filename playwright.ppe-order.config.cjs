const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: ['ppe-order.spec.cjs', 'ppe-reorder-setting.spec.cjs'],
  timeout: 90000,
  expect: { timeout: 15000 },
  workers: 1,
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 4320',
    cwd: __dirname,
    url: 'http://127.0.0.1:4320/ppe/reports/order?company_id=amt',
    timeout: 180000,
    reuseExistingServer: false,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-ppe-test-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'local-ppe-test-service',
      TOOLS_SESSION_SECRET: 'local-ppe-test-session-secret',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:4320',
    channel: 'chrome',
    headless: true,
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
});
