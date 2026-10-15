const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests",
  testMatch: /permit-flow\.spec\.cjs/,
  timeout: 240000,
  expect: { timeout: 15000 },
  workers: 1,
  webServer: {
    command: "node tests/permit-preview.cjs",
    cwd: __dirname,
    url: "http://127.0.0.1:4320/api/auth/session",
    timeout: 180000,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://127.0.0.1:4320",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/permit-results.json" }],
  ],
});
