// Compiled-client verification in an isolated browser. Every API response in the
// page is intercepted; this never logs into production or writes customer data.
const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs"),
  path = require("node:path");
const base = process.argv[2] || "https://tools.eashe.org";
const sourcePath = process.argv[3];
const source = sourcePath
  ? JSON.parse(fs.readFileSync(sourcePath, "utf8"))
  : {
      id: "00000000-0000-4000-8000-000000000001",
      company_id: "amt",
      name: "โปสเตอร์ทดสอบ",
      ghs_pictograms: ["GHS05"],
      signal_word: "Danger",
      h_codes: ["H314"],
      p_codes: ["P280"],
      ppe_required: [],
      sds_url: "https://example.com/sds.pdf",
      first_aid: {},
      is_demo: true,
    };
const migration = fs
  .readdirSync(path.join(__dirname, "../supabase/migrations"))
  .find((n) => n.endsWith("_chemical_poster_templates_versions.sql"));
const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations", migration),
  "utf8",
);
const configs = [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) =>
  JSON.parse(m[1]),
);
const templates = configs.map((config, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  name: i ? "AAB · ตาราง SDS หน้างาน" : "แบบสรุปแนวตั้ง",
  company_id: "all",
  is_visible: true,
  revision: 1,
  config,
}));
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        acceptDownloads: true,
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const report = { base, errors, downloads: [], anonymous: [] };
    for (const endpoint of [
      `/api/chemical/substances/${source.id}/posters`,
      "/api/chemical/poster-templates?company_id=amt",
    ]) {
      const r = await page.request.get(base + endpoint);
      expect(r.status()).toBe(401);
      report.anonymous.push(r.status());
    }
    await page.route("**/api/**", (route) => {
      const req = route.request(),
        p = new URL(req.url()).pathname;
      expect(req.method()).toBe("GET");
      if (p === "/api/auth/session")
        return route.fulfill({
          json: {
            user: {
              id: "browser-fixture",
              username: "read-only-fixture",
              role: "admin",
              companyId: "admin",
              companyName: "EA SHE Admin",
              displayName: "Rendering check",
            },
          },
        });
      if (p === `/api/chemical/substances/${source.id}`)
        return route.fulfill({ json: { data: source } });
      if (p === `/api/chemical/substances/${source.id}/posters`)
        return route.fulfill({
          json: { versions: [], latest: null, hasMore: false },
        });
      if (p === "/api/chemical/poster-templates")
        return route.fulfill({ json: { data: templates } });
      if (p === "/api/chemical/settings")
        return route.fulfill({
          json: {
            data: {
              company_id: source.company_id,
              show_emergency: true,
              emergency_contacts: [],
            },
          },
        });
      if (p === "/api/companies")
        return route.fulfill({
          json: [
            { company_id: "amt", company_name: "AMT" },
            { company_id: "aab", company_name: "AAB" },
          ],
        });
      throw new Error("Unexpected API request blocked: " + p);
    });
    await page.goto(`${base}/chemical/${source.id}/poster`);
    await expect(
      page.getByLabel("แม่แบบโปสเตอร์", { exact: true }),
    ).toHaveValue(templates[0].id);
    const folder = path.join(__dirname, "../.verification/poster");
    fs.mkdirSync(folder, { recursive: true });
    await page.addScriptTag({ path: require.resolve("jsqr") });
    for (const [i, t] of templates.entries()) {
      await page
        .getByLabel("แม่แบบโปสเตอร์", { exact: true })
        .selectOption(t.id);
      try {
        await expect(
          page.getByRole("button", { name: "ดาวน์โหลด PDF", exact: true }),
        ).toBeEnabled({ timeout: 20000 });
      } catch (e) {
        console.log({
          layout: t.config.layout,
          alerts: await page.getByRole("alert").allTextContents(),
        });
        await page.screenshot({
          path: path.join(folder, "failed-render.png"),
          fullPage: true,
        });
        throw e;
      }
      const decoded = await page.evaluate(() => {
        const img = document.querySelector('[data-testid="poster-preview"]');
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const p = ctx.getImageData(0, 0, c.width, c.height);
        return window.jsQR(p.data, p.width, p.height)?.data;
      });
      expect(decoded).toBe(`https://tools.eashe.org/sds/${source.id}`);
      const event = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
        .click();
      const file = path.join(folder, `${i ? "aab" : "summary"}-compiled.pdf`);
      await (await event).saveAs(file);
      report.downloads.push({
        layout: t.config.layout,
        bytes: fs.statSync(file).size,
        qr: decoded,
      });
    }
    await page.screenshot({
      path: path.join(folder, "editor.png"),
      fullPage: true,
    });
    await page.goto(base + "/chemical/poster-templates");
    await expect(
      page.getByRole("heading", { name: "จัดการแม่แบบโปสเตอร์", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("ชื่อแม่แบบ", { exact: true })).toHaveValue(
      templates[0].name,
    );
    await page.screenshot({
      path: path.join(folder, "admin.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    fs.writeFileSync(
      path.join(folder, "smoke.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
