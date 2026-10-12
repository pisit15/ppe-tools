// Isolated browser: all APIs are intercepted, so even production checks cannot
// write customer data. Optional snapshot reproduces an existing poster locally.
const { chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const base = process.argv[2] || "http://127.0.0.1:4310";
const file = process.argv[3];
const migration = fs
  .readdirSync(path.join(__dirname, "../supabase/migrations"))
  .find((f) => f.endsWith("_chemical_amt_poster_template.sql"));
const config = JSON.parse(
  fs
    .readFileSync(
      path.join(__dirname, "../supabase/migrations", migration),
      "utf8",
    )
    .match(/\$json\$([\s\S]*?)\$json\$/)[1],
);
const fields = [
  "name",
  "chemicalName",
  "cas",
  "un",
  "formula",
  "supplier",
  "company",
  "department",
  "documentCode",
  "documentRevision",
  "effectiveDate",
  "formCode",
  "formRevision",
  "issued",
  "checked",
  "approved",
  "ingredients",
  "physical",
  "hazards",
  "precautions",
  "firstAid",
  "storage",
  "storageClass",
  "fire",
  "spill",
  "ppeNotes",
  "emergency",
  "sdsDate",
];
const snapshot = file
  ? JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""))
  : {
      schema: 1,
      fontSize: 9,
      template: {
        id: "869518ab-bb68-4ebc-9a59-fda4fc7e6c22",
        name: "AMT · SDS 7 หมวด",
        revision: 1,
        config,
      },
      draft: {
        ...Object.fromEntries(fields.map((f) => [f, ""])),
        name: "Section routing test",
        company: "AMT",
        pictograms: ["GHS05"],
        signal: "Danger",
        ppe: ["goggles"],
        showPpeCaptions: true,
        productImage: "",
        ppeNotes: "สวมถุงมือ",
        firstAid: "กลืนกิน: ห้ามทำให้อาเจียน รีบติดต่อแพทย์ทันที",
        precautions:
          "P280 สวมถุงมือ\nP280 สวมถุงมือ\nP284 สวมอุปกรณ์ป้องกันระบบทางเดินหายใจ\nP301+P330+P331 หากกลืนกิน: บ้วนปาก ห้ามทำให้อาเจียน\nP305+P351 หากเข้าตา: ล้างด้วยน้ำ\nP220 เก็บห่างวัสดุติดไฟ\nP370+P378 เมื่อเกิดไฟไหม้: ใช้สารดับเพลิงตาม SDS\nP391 เก็บสารที่หก\nP501 กำจัดภาชนะตาม SDS",
      },
    };
snapshot.template.config.logo ||= config.logo;
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const fill = CanvasRenderingContext2D.prototype.fillText;
      let lastCanvas;
      CanvasRenderingContext2D.prototype.fillText = function (
        text,
        x,
        y,
        ...rest
      ) {
        if (this.canvas.width === 2480 && this.canvas.height === 3508) {
          if (lastCanvas !== this.canvas) {
            window.posterTexts = [];
            lastCanvas = this.canvas;
          }
          window.posterTexts.push({ text, x, y });
        }
        return fill.call(this, text, x, y, ...rest);
      };
    });
    const id = "00000000-0000-4000-8000-000000000001";
    const root = `/api/chemical/substances/${id}`;
    await page.context().route("**/api/**", (route) => {
      const req = route.request(),
        p = new URL(req.url()).pathname;
      expect(req.method()).toBe("GET");
      if (p === "/api/auth/session")
        return route.fulfill({
          json: {
            user: {
              id: "fixture",
              username: "fixture",
              role: "admin",
              companyId: "admin",
              displayName: "Fixture",
            },
          },
        });
      if (p === root)
        return route.fulfill({
          json: {
            data: {
              id,
              name: snapshot.draft.name,
              company_id: "amt",
              sds_url: "https://example.com/sds.pdf",
            },
          },
        });
      if (p === root + "/posters")
        return route.fulfill({
          json: {
            versions: [
              {
                id,
                version: 2,
                title: "Saved",
                created_at: "2026-10-12T00:00:00Z",
                created_by: { displayName: "Fixture" },
              },
            ],
            latest: { id, version: 2, snapshot },
            hasMore: false,
          },
        });
      if (p === "/api/chemical/poster-templates")
        return route.fulfill({
          json: {
            data: [
              { ...snapshot.template, company_id: "amt", is_visible: true },
            ],
          },
        });
      if (p === "/api/chemical/settings")
        return route.fulfill({
          json: { data: { company_id: "amt", show_emergency: false } },
        });
      if (p === "/api/companies")
        return route.fulfill({
          json: [{ company_id: "amt", company_name: "AMT" }],
        });
      throw new Error("Unexpected API " + p);
    });
    await page.goto(`${base}/chemical/${id}/poster`);
    const pdf = page.getByRole("button", {
      name: "ดาวน์โหลด PDF",
      exact: true,
    });
    try {
      await expect(pdf).toBeEnabled({ timeout: 30000 });
    } catch (e) {
      console.log(await page.getByRole("alert").allTextContents());
      throw e;
    }
    const rows = await page.evaluate(() => window.posterTexts);
    const sectionY = (prefix) => rows.find((r) => r.text.startsWith(prefix))?.y;
    const firstAid = sectionY("Section 4"),
      storage = sectionY("Section 5"),
      spill = sectionY("Section 6"),
      fire = sectionY("Section 7");
    const has = (text, low, high) =>
      rows.some((r) => r.text.includes(text) && r.y > low && r.y < high);
    expect(has("P220", storage, spill)).toBe(true);
    expect(has("P301+P330", firstAid, storage)).toBe(true);
    expect(has("P305", firstAid, storage)).toBe(true);
    expect(has("P280", storage, spill)).toBe(false);
    expect(has("P301", storage, spill)).toBe(false);
    if (!file) {
      expect(has("P284", sectionY("Section 2"), sectionY("Section 3"))).toBe(
        true,
      );
      expect(has("P391", spill, fire)).toBe(true);
      expect(has("P370", fire, 280)).toBe(true);
      expect(rows.filter((r) => r.text === "สวมถุงมือ")).toHaveLength(1);
      expect(
        rows.filter((r) => r.text.includes("ห้ามทำให้อาเจียน")),
      ).toHaveLength(1);
      expect(rows.some((r) => r.text.includes("P301+P330+P331"))).toBe(false);
      const other = sectionY(config.headings.precautions);
      expect(has("P501", other, spill)).toBe(true);
    }
    const folder = path.join(__dirname, "../.verification/amt-sections");
    fs.mkdirSync(folder, { recursive: true });
    const tag =
      (file ? "reported" : "regression") +
      (base.includes("tools.eashe.org") ? "-production" : "-local");
    fs.writeFileSync(
      path.join(folder, tag + ".json"),
      JSON.stringify({ base, errors, rows }, null, 2),
    );
    const img = await page.getByTestId("poster-preview").getAttribute("src");
    fs.writeFileSync(
      path.join(folder, tag + ".png"),
      Buffer.from(img.split(",")[1], "base64"),
    );
    const download = page.waitForEvent("download");
    await pdf.click();
    await (await download).saveAs(path.join(folder, tag + ".pdf"));
    await page.reload();
    await expect(pdf).toBeEnabled();
    await expect(page.locator("#poster-precautions")).toHaveValue(
      snapshot.draft.precautions,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        base,
        case: tag,
        rendered: true,
        downloaded: true,
        unchangedSnapshot: true,
        errors,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
