const { test, expect } = require("@playwright/test");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const id = "11111111-1111-4111-8111-111111111111",
  foreign = "44444444-4444-4444-8444-444444444444";
const root = `/api/chemical/substances/${id}`,
  url = root + "/posters";
const login = async (request, username = "audit-amt") =>
  expect(
    (
      await request.post("/api/auth/login", {
        data: { username, password: "local-test-only" },
      })
    ).status(),
  ).toBe(200);
const state = async (request) => await (await request.get(url)).json();
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9XcAAAAASUVORK5CYII=",
  "base64",
);
test.beforeEach(async ({ request }) =>
  expect((await request.post("http://127.0.0.1:4311/__test/reset")).ok()).toBe(
    true,
  ),
);
test("user saves AAB Rev1/2/3, reopens on another device, resets without changing register and downloads PDF", async ({
  page,
}, info) => {
  await login(page.request);
  const before = (await (await page.request.get(root)).json()).data;
  await page.goto("/chemical?company_id=amt");
  await page
    .getByRole("link", {
      name: `โปสเตอร์สรุป SDS ของ ${before.name}`,
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(new RegExp(`/chemical/${id}/poster$`));
  await page
    .getByLabel("แม่แบบโปสเตอร์", { exact: true })
    .selectOption({ label: "AAB · ตาราง SDS หน้างาน · A4 แนวนอน" });
  await page
    .getByLabel("รหัสเอกสาร SDS", { exact: true })
    .fill("SDS-AAB-CCO-149");
  await page
    .getByLabel("วันที่มีผล (Effective date)", { exact: true })
    .fill("10/10/2025");
  await page.getByLabel("Rev. บนเอกสาร", { exact: true }).fill("01");
  await page.getByText("ผลิตภัณฑ์", { exact: true }).click();
  await page
    .getByLabel("ชื่อผลิตภัณฑ์ / สารเคมี", { exact: true })
    .fill("Sulfuric acid 50.00");
  await page.getByText("ข้อมูลความปลอดภัยจาก SDS", { exact: true }).click();
  await page
    .getByLabel("ข้อความแสดงอันตราย", { exact: true })
    .fill("H314 ทำให้ผิวหนังไหม้อย่างรุนแรงและทำลายดวงตา");
  await page
    .getByLabel("ข้อควรระวัง / วิธีปฏิบัติ", { exact: true })
    .fill("ข้อความตัวอย่างสำหรับตรวจการจัดหน้า");
  await page
    .getByLabel("การปฐมพยาบาล", { exact: true })
    .fill("ข้อความทดสอบจาก SDS\nบรรทัดที่สอง ทดสอบภาษาไทยและการตัดคำ");
  await page
    .getByLabel("รายละเอียด PPE ตาม SDS", { exact: true })
    .fill("ถุงมือป้องกันสารเคมี\nแว่นตาป้องกันสารเคมี\nชุดป้องกันสารเคมี");
  await page.getByText("สัญลักษณ์ GHS และคำสัญญาณ", { exact: true }).click();
  await page.getByLabel("กัดกร่อน", { exact: true }).check();
  await page.getByLabel("คำสัญญาณตาม SDS").selectOption("Danger");
  await page.getByText("รูป PPE และรูปผลิตภัณฑ์", { exact: true }).click();
  await page.getByLabel("PPE แว่นตานิรภัย", { exact: true }).check();
  await page
    .getByLabel("รูปผลิตภัณฑ์ (ใช้ในแบบตาราง AAB)")
    .setInputFiles({ name: "product.png", mimeType: "image/png", buffer: png });
  const save = page.getByRole("button", {
    name: "บันทึกเป็น Rev ใหม่",
    exact: true,
  });
  await save.click();
  await expect(
    page.getByText("บันทึก Rev1 แล้ว", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("รหัสเอกสาร SDS", { exact: true })).toHaveValue(
    "SDS-AAB-CCO-149",
  );
  await expect(page.getByLabel("รหัสแบบฟอร์ม", { exact: true })).toHaveValue(
    "AAB-AABX-OHS-FM-031",
  );
  await page.getByLabel("Rev. บนเอกสาร", { exact: true }).fill("02");
  await save.click();
  await expect(
    page.getByText("บันทึก Rev2 แล้ว", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("เลือก Rev โปสเตอร์").selectOption("1");
  await expect(page.getByLabel("Rev. บนเอกสาร", { exact: true })).toHaveValue(
    "01",
  );
  await page.getByLabel("ชื่อ Rev / หมายเหตุ (ถ้ามี)").fill("แก้ไขจาก Rev1");
  await save.click();
  await expect(
    page.getByText("บันทึก Rev3 แล้ว", { exact: false }),
  ).toBeVisible();
  const another = await page
    .context()
    .browser()
    .newContext({ baseURL: "http://127.0.0.1:4310" });
  try {
    await login(another.request);
    expect((await state(another.request)).latest.version).toBe(3);
  } finally {
    await another.close();
  }
  const pdf = page.getByRole("button", { name: "ดาวน์โหลด PDF", exact: true });
  await expect(pdf).toBeEnabled();
  const download = page.waitForEvent("download");
  await pdf.click();
  const downloaded = await download;
  await downloaded.saveAs(info.outputPath("aab-poster.pdf"));
  expect(fs.statSync(info.outputPath("aab-poster.pdf")).size).toBeGreaterThan(
    20000,
  );
  await page
    .getByTestId("poster-preview")
    .screenshot({ path: info.outputPath("aab-preview.png") });
  const after = (await (await page.request.get(root)).json()).data;
  expect(after.updated_at).toBe(before.updated_at);
  expect(after.name).toBe(before.name);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "เริ่มใหม่จากทะเบียน", exact: true })
    .click();
  await expect(page.getByLabel("รหัสเอกสาร SDS", { exact: true })).toHaveValue(
    "",
  );
  expect((await state(page.request)).versions.map((v) => v.version)).toEqual([
    3, 2, 1,
  ]);
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.getByLabel("รหัสเอกสาร SDS", { exact: true })).toHaveValue(
    "SDS-AAB-CCO-149",
  );
  await page
    .getByLabel("แม่แบบโปสเตอร์", { exact: true })
    .selectOption({ label: "แบบสรุปแนวตั้ง · A4 แนวตั้ง" });
  await expect(pdf).toBeEnabled();
  const second = page.waitForEvent("download");
  await pdf.click();
  await (await second).saveAs(info.outputPath("summary-poster.pdf"));
  await page.getByText("ข้อมูลความปลอดภัยจาก SDS", { exact: true }).click();
  await page
    .getByLabel("ข้อความแสดงอันตราย", { exact: true })
    .fill("ข้อความทดสอบยาวเกินพื้นที่ ".repeat(220));
  await expect(
    page.getByRole("alert").filter({ hasText: "ข้อความบางส่วนเกินพื้นที่" }),
  ).toBeVisible();
  await expect(pdf).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("Admin creates, edits, hides company templates; users cannot change designs and old snapshots remain usable", async ({
  page,
  browser,
}) => {
  await login(page.request, "audit-admin");
  await page.goto("/chemical/poster-templates");
  await page
    .getByLabel("เลือกแม่แบบที่ต้องการแก้ไข")
    .selectOption({ label: "AAB · ตาราง SDS หน้างาน" });
  await page.getByRole("button", { name: "ทำสำเนา", exact: true }).click();
  await page.getByLabel("ชื่อแม่แบบ", { exact: true }).fill("AMT ทดสอบ");
  await page.getByLabel("บริษัทต้นแบบ").selectOption("amt");
  await page.getByLabel("ชื่อบริษัทเริ่มต้น").fill("บริษัท AMT");
  await page.getByRole("button", { name: "บันทึกแม่แบบ", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "บันทึกแม่แบบแล้ว" }),
  ).toBeVisible();
  const templates = (
    await (
      await page.request.get("/api/chemical/poster-templates?manage=1")
    ).json()
  ).data;
  const t = templates.find((t) => t.name === "AMT ทดสอบ");
  expect(t.company_id).toBe("amt");
  const user = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  try {
    await login(user.request);
    const tab = await user.newPage();
    await tab.goto(`/chemical/${id}/poster`);
    await tab.getByLabel("แม่แบบโปสเตอร์", { exact: true }).selectOption(t.id);
    await tab.getByRole("button", { name: "บันทึกเป็น Rev ใหม่" }).click();
    await expect(
      tab.getByText("บันทึก Rev1 แล้ว", { exact: false }),
    ).toBeVisible();
    const v = (await state(user.request)).latest;
    expect(
      (
        await user.request.post("/api/chemical/poster-templates", { data: t })
      ).status(),
    ).toBe(403);
    expect(
      (
        await user.request.get("/api/chemical/poster-templates?manage=1")
      ).status(),
    ).toBe(403);
    expect(
      (
        await user.request.get(`/api/chemical/substances/${foreign}/posters`)
      ).status(),
    ).toBe(404);
    expect(
      (
        await user.request.get("/api/chemical/poster-templates?company_id=aab")
      ).status(),
    ).toBe(403);
    expect(
      (
        await user.request.post(url, {
          data: {
            title: "forged",
            request_id: randomUUID(),
            snapshot: {
              ...v.snapshot,
              template: {
                ...v.snapshot.template,
                config: { ...v.snapshot.template.config, title: "forged" },
              },
            },
          },
        })
      ).status(),
    ).toBe(409);
    const cross = await user.request.post(url, {
      headers: { origin: "https://other.invalid" },
      data: {},
    });
    expect(cross.status()).toBe(403);
    const updated = await page.request.patch("/api/chemical/poster-templates", {
      data: {
        ...t,
        is_visible: false,
        config: { ...t.config, title: "Changed heading" },
      },
    });
    expect(updated.status()).toBe(200);
    expect(
      (
        await page.request.patch("/api/chemical/poster-templates", { data: t })
      ).status(),
    ).toBe(409);
    expect(
      (
        await (
          await user.request.get(
            "/api/chemical/poster-templates?company_id=amt",
          )
        ).json()
      ).data.some((i) => i.id === t.id),
    ).toBe(false);
    await tab.reload();
    await expect(tab.getByLabel("แม่แบบโปสเตอร์", { exact: true })).toHaveValue(
      "saved",
    );
    await tab
      .getByLabel("รหัสเอกสาร SDS", { exact: true })
      .fill("still editable");
    await tab.getByRole("button", { name: "บันทึกเป็น Rev ใหม่" }).click();
    await expect(
      tab.getByText("บันทึก Rev2 แล้ว", { exact: false }),
    ).toBeVisible();
    expect(
      (await state(user.request)).latest.snapshot.template.config.title,
    ).toBe(t.config.title);
    const payload = {
      title: "retry",
      request_id: randomUUID(),
      base_version: 2,
      snapshot: (await state(user.request)).latest.snapshot,
    };
    const first = await user.request.post(url, { data: payload }),
      second = await user.request.post(url, { data: payload });
    expect(first.status()).toBe(201);
    expect((await second.json()).data.id).toBe((await first.json()).data.id);
    const bad = {
      ...payload,
      request_id: randomUUID(),
      snapshot: {
        ...payload.snapshot,
        draft: {
          ...payload.snapshot.draft,
          productImage: "https://evil.invalid/image",
        },
      },
    };
    expect((await user.request.post(url, { data: bad })).status()).toBe(400);
  } finally {
    await user.close();
  }
  const anonymous = await browser.newContext({
    baseURL: "http://127.0.0.1:4310",
  });
  try {
    expect((await anonymous.request.get(url)).status()).toBe(401);
    expect(
      (
        await anonymous.request.get(
          "/api/chemical/poster-templates?company_id=amt",
        )
      ).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
});

test("AMT seven-section template is shared, editable, revisioned and exports A4 with SDS QR", async ({
  page,
  browser,
}, info) => {
  await login(page.request);
  const before = (await (await page.request.get(root)).json()).data;
  const ts = (
    await (
      await page.request.get("/api/chemical/poster-templates?company_id=amt")
    ).json()
  ).data;
  const amt = ts.find((t) => t.config.layout === "amt");
  expect(amt.company_id).toBe("amt");
  expect(amt.config.logo).toMatch(/^data:image\/png;base64,/);
  await page.goto(`/chemical/${id}/poster`);
  await page.getByLabel("แม่แบบโปสเตอร์", { exact: true }).selectOption(amt.id);
  await page.getByLabel("รหัสเอกสาร SDS", { exact: true }).fill("HSE-SDS-001");
  await page
    .getByLabel("วันที่มีผล (Effective date)", { exact: true })
    .fill("12-Oct-2026");
  await page
    .getByLabel("ผู้จัดทำ (Issued)", { exact: true })
    .fill("ผู้จัดทำทดสอบ");
  await page.getByText("ผลิตภัณฑ์", { exact: true }).click();
  await page
    .getByLabel("ชื่อผลิตภัณฑ์ / สารเคมี", { exact: true })
    .fill("SITAP C-110");
  await page
    .getByLabel("ชื่อทางเคมี", { exact: true })
    .fill("Polyphosphates and Polymer");
  await page.locator("#poster-cas").fill("");
  await page.locator("#poster-un").fill("");
  await page.getByText("ข้อมูลความปลอดภัยจาก SDS", { exact: true }).click();
  for (const [key, value] of Object.entries({
    storageClass: "",
    physical:
      "ลักษณะทั่วไป: ของเหลวใส เหลืองอ่อน\npH: 7.4 - 9.4\nความสามารถในการละลายได้: ละลายน้ำได้ทุกส่วน",
    ingredients: "Polyphosphates · CAS: ไม่ระบุ\nPolymer · CAS: ไม่ระบุ",
    ppeNotes:
      "ระบบหายใจ: หน้ากาก\nตา: แว่นตากันสารเคมี\nผิวหนัง: ถุงมือป้องกันสารเคมี",
    hazards: "ข้อความอันตรายจาก SDS ที่ผู้ใช้กรอก",
    firstAid:
      "กรณีสัมผัสผิวหนังหรือดวงตา: ข้อมูลการปฐมพยาบาลจาก SDS\nกรณีได้รับทางหายใจ: ข้อมูลจาก SDS\nกรณีกลืนกิน: ข้อมูลจาก SDS",
    storage: "เก็บในภาชนะปิดสนิท เย็น มืด และมีการระบายอากาศที่ดี",
    precautions: "มีระบบระบายอากาศที่ดี",
    spill:
      "วิธีการและวัสดุสำหรับกักเก็บและทำความสะอาด: ข้อมูลจาก SDS\nข้อควรระวังส่วนบุคคล: ข้อมูลจาก SDS\nข้อควรระวังด้านสิ่งแวดล้อม: ข้อมูลจาก SDS",
    fire: "สารดับเพลิงที่เหมาะสม: ข้อมูลจาก SDS\nความเป็นอันตรายเฉพาะ: ข้อมูลจาก SDS\nอุปกรณ์สำหรับนักผจญเพลิง: ข้อมูลจาก SDS",
    emergency: "หน่วยงานฉุกเฉินของบริษัท",
  }))
    await page.locator(`#poster-${key}`).fill(value);
  await page
    .getByRole("button", { name: "บันทึกเป็น Rev ใหม่", exact: true })
    .click();
  await expect(
    page.getByText("บันทึก Rev1 แล้ว", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("แม่แบบโปสเตอร์", { exact: true })).toHaveValue(
    amt.id,
  );
  const first = (await state(page.request)).latest;
  expect(first.snapshot.draft.company).toBe(
    "Amita Technology (Thailand) Co., Ltd.",
  );
  expect(first.snapshot.draft.formCode).toBe("AHS-002");
  expect(first.snapshot.template.config.layout).toBe("amt");
  const pdf = page.getByRole("button", { name: "ดาวน์โหลด PDF", exact: true });
  await expect(pdf).toBeEnabled();
  await page.addScriptTag({ path: require.resolve("jsqr") });
  const decoded = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="poster-preview"]');
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const p = ctx.getImageData(0, 0, c.width, c.height);
    return {
      width: c.width,
      height: c.height,
      qr: window.jsQR(p.data, p.width, p.height)?.data,
    };
  });
  expect(decoded.width).toBe(2480);
  expect(decoded.height).toBe(3508);
  expect(decoded.qr).toBe(`https://tools.eashe.org/sds/${id}`);
  const png = await page.getByTestId("poster-preview").getAttribute("src");
  fs.mkdirSync(".verification/amt-poster", { recursive: true });
  fs.writeFileSync(
    ".verification/amt-poster/preview.png",
    Buffer.from(png.split(",")[1], "base64"),
  );
  const download = page.waitForEvent("download");
  await pdf.click();
  await (await download).saveAs(".verification/amt-poster/amt-poster.pdf");
  await page.getByText("รูป PPE และรูปผลิตภัณฑ์", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: "PPE แว่นตานิรภัย", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "PPE ถุงมือป้องกันสารเคมี", exact: true })
    .check();
  await expect(pdf).toBeEnabled();
  const ppePng = await page.getByTestId("poster-preview").getAttribute("src");
  fs.writeFileSync(
    ".verification/amt-poster/ppe-preview.png",
    Buffer.from(ppePng.split(",")[1], "base64"),
  );
  await page.getByLabel("รหัสเอกสาร SDS", { exact: true }).fill("HSE-SDS-002");
  await page
    .getByRole("button", { name: "บันทึกเป็น Rev ใหม่", exact: true })
    .click();
  await expect(
    page.getByText("บันทึก Rev2 แล้ว", { exact: false }),
  ).toBeVisible();
  expect((await state(page.request)).latest.snapshot.draft.ppe).toEqual([
    "goggles",
    "gloves",
  ]);
  await page.getByLabel("เลือก Rev โปสเตอร์").selectOption("1");
  await expect(page.getByLabel("รหัสเอกสาร SDS", { exact: true })).toHaveValue(
    "HSE-SDS-001",
  );
  expect((await (await page.request.get(root)).json()).data.updated_at).toBe(
    before.updated_at,
  );
  const admin = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  try {
    await login(admin.request, "audit-admin");
    const foreign = (
      await (
        await admin.request.get("/api/chemical/poster-templates?company_id=aab")
      ).json()
    ).data;
    expect(foreign.some((t) => t.id === amt.id)).toBe(true);
    const response = await admin.request.patch(
      "/api/chemical/poster-templates",
      {
        data: {
          ...amt,
          is_visible: false,
          config: { ...amt.config, title: "AMT updated heading" },
        },
      },
    );
    expect(response.status()).toBe(200);
    await page.reload();
    await expect(
      page.getByLabel("แม่แบบโปสเตอร์", { exact: true }),
    ).toHaveValue("saved");
    expect(
      (await state(page.request)).latest.snapshot.template.config.title,
    ).toBe(amt.config.title);
    await expect(pdf).toBeEnabled();
  } finally {
    await admin.close();
  }
  await page.getByText("ข้อมูลความปลอดภัยจาก SDS", { exact: true }).click();
  await page
    .locator("#poster-hazards")
    .fill("ข้อความยาวเกินพื้นที่ ".repeat(150));
  await expect(
    page.getByRole("alert").filter({ hasText: "ข้อความบางส่วนเกินพื้นที่" }),
  ).toBeVisible();
  await expect(pdf).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("AMT routes precautions to their sections, removes duplicates, keeps general text and downloads the same composed PDF", () => {
  const { execFileSync } = require("node:child_process");
  const result = execFileSync(
    process.execPath,
    [
      require.resolve("./chemical-poster-sections-deployed.cjs"),
      "http://127.0.0.1:4310",
    ],
    { encoding: "utf8", timeout: 80000 },
  );
  expect(result).toContain('"rendered":true');
  expect(result).toContain('"downloaded":true');
  expect(result).toContain('"unchangedSnapshot":true');
});

test("AAB sees AMT, sets a persistent company default, and keeps existing Rev while other companies stay isolated", async ({
  page,
  browser,
}) => {
  await login(page.request, "audit-aab");
  const templates = (
    await (
      await page.request.get("/api/chemical/poster-templates?company_id=aab")
    ).json()
  ).data;
  expect(templates.map((t) => t.config.layout).sort()).toEqual([
    "aab",
    "amt",
    "summary",
  ]);
  const amt = templates.find((t) => t.config.layout === "amt");
  const aab = templates.find((t) => t.config.layout === "aab");
  const settings = "/api/chemical/settings?company_id=aab";
  await page.request.put("/api/chemical/settings", {
    data: {
      company_id: "aab",
      show_emergency: false,
      emergency_contacts: [{ label: "เดิม", phone: "123" }],
    },
  });
  await page.goto(`/chemical/${foreign}/poster`);
  await page.getByLabel("แม่แบบโปสเตอร์", { exact: true }).selectOption(amt.id);
  await page
    .getByRole("button", {
      name: "ใช้เป็นแม่แบบเริ่มต้นของบริษัท",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("ตั้งแม่แบบเริ่มต้นของบริษัทแล้ว", { exact: false }),
  ).toBeVisible();
  const savedSettings = (await (await page.request.get(settings)).json()).data;
  expect(savedSettings.default_poster_template_id).toBe(amt.id);
  expect(savedSettings.show_emergency).toBe(false);
  expect(savedSettings.emergency_contacts).toEqual([
    { label: "เดิม", phone: "123" },
  ]);
  await page.reload();
  await expect(page.getByLabel("แม่แบบโปสเตอร์", { exact: true })).toHaveValue(
    amt.id,
  );
  await page
    .getByRole("button", { name: "บันทึกเป็น Rev ใหม่", exact: true })
    .click();
  await expect(
    page.getByText("บันทึก Rev1 แล้ว", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("แม่แบบโปสเตอร์", { exact: true }).selectOption(aab.id);
  await page
    .getByRole("button", {
      name: "ใช้เป็นแม่แบบเริ่มต้นของบริษัท",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("ตั้งแม่แบบเริ่มต้นของบริษัทแล้ว", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("แม่แบบโปสเตอร์", { exact: true })).toHaveValue(
    amt.id,
  );
  expect(
    (await (await page.request.get(settings)).json()).data
      .default_poster_template_id,
  ).toBe(aab.id);
  expect(
    (
      await page.request.put("/api/chemical/settings", {
        data: { company_id: "amt", default_poster_template_id: amt.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.put("/api/chemical/settings", {
        data: { company_id: "aab", default_poster_template_id: randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.put("/api/chemical/settings", {
        data: { company_id: "aab", default_poster_template_id: "invalid" },
      })
    ).status(),
  ).toBe(400);
  expect((await page.request.get(root)).status()).toBe(404);
  const other = await browser.newContext({ baseURL: "http://127.0.0.1:4310" });
  try {
    await login(other.request);
    const cfg = (
      await (
        await other.request.get("/api/chemical/settings?company_id=amt")
      ).json()
    ).data;
    expect(cfg.default_poster_template_id).toBeNull();
    expect(cfg.sds_review_years).toBe(2);
  } finally {
    await other.close();
  }
});

for (const layout of ["summary", "aab", "amt"]) {
  test(`direct preview editing in ${layout} adds/deletes text, persists Rev and exports without changing registry`, async ({
    page,
  }, info) => {
    await login(page.request);
    const before = (await (await page.request.get(root)).json()).data;
    const templates = (
      await (
        await page.request.get("/api/chemical/poster-templates?company_id=amt")
      ).json()
    ).data;
    await page.goto(`/chemical/${id}/poster`);
    await page
      .getByLabel("แม่แบบโปสเตอร์", { exact: true })
      .selectOption(templates.find((t) => t.config.layout === layout).id);
    await page.getByText("ข้อมูลความปลอดภัยจาก SDS", { exact: true }).click();
    if (layout === "amt") {
      await page
        .locator("#poster-precautions")
        .fill(
          "P310 ติดต่อแพทย์ทันที\nP280 สวมถุงมือ\nP220 เก็บให้ห่างจากเสื้อผ้าและวัสดุติดไฟได้",
        );
    }
    await page.getByTestId("poster-edit-firstAid").click();
    const inline = page.getByLabel("ข้อความบนโปสเตอร์: การปฐมพยาบาล", {
      exact: true,
    });
    if (layout === "amt") await expect(inline).toHaveValue(/P310/);
    await inline.fill("เข้าตา: ล้างตาทันที\nข้อความที่ผู้ใช้เพิ่ม");
    await page.getByRole("button", { name: "เสร็จ", exact: true }).click();
    await expect(page.locator("#poster-firstAid")).toHaveValue(
      "เข้าตา: ล้างตาทันที\nข้อความที่ผู้ใช้เพิ่ม",
    );
    if (layout === "amt") {
      await expect(page.locator("#poster-precautions")).toHaveValue("");
      await expect(page.locator("#poster-ppeNotes")).toHaveValue(
        "P280 สวมถุงมือ",
      );
      await expect(page.locator("#poster-storage")).toHaveValue(
        "P220 เก็บให้ห่างจากเสื้อผ้าและวัสดุติดไฟได้",
      );
    }
    await page.getByTestId("poster-edit-ingredients").click();
    await page
      .getByLabel("ข้อความบนโปสเตอร์: ส่วนประกอบ / สารเคมีอันตราย", {
        exact: true,
      })
      .fill("Test ingredient · CAS 67-64-1 · 1–10%");
    await page.getByRole("button", { name: "เสร็จ", exact: true }).click();
    await page.getByTestId("poster-edit-fire").click();
    await page
      .getByLabel("ข้อความบนโปสเตอร์: การดับเพลิง", { exact: true })
      .fill("ข้อความที่จะลบ");
    await page
      .getByRole("button", { name: "ล้างข้อความ", exact: true })
      .click();
    await page.getByRole("button", { name: "เสร็จ", exact: true }).click();
    await expect(page.locator("#poster-fire")).toHaveValue("");
    await page
      .getByRole("button", { name: "บันทึกเป็น Rev ใหม่", exact: true })
      .click();
    await expect(
      page.getByText("บันทึก Rev1 แล้ว", { exact: false }),
    ).toBeVisible();
    await page.reload();
    await page.getByTestId("poster-edit-firstAid").click();
    await expect(inline).toHaveValue(
      "เข้าตา: ล้างตาทันที\nข้อความที่ผู้ใช้เพิ่ม",
    );
    await page.screenshot({
      path: info.outputPath(`${layout}-inline.png`),
      fullPage: true,
    });
    await inline.press("Escape");
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })
      .click();
    await (await download).saveAs(info.outputPath(`${layout}-inline.pdf`));
    const version = (await state(page.request)).latest;
    expect(version.snapshot.draft.fire).toBe("");
    expect(version.snapshot.draft.ingredients).toContain("1–10%");
    expect((await (await page.request.get(root)).json()).data).toEqual(before);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("poster-edit-firstAid").click();
    await expect(inline).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`${layout}-mobile-inline.png`),
      fullPage: true,
    });
    await inline.fill("แก้จากมือถือ");
    await page.getByRole("button", { name: "เสร็จ", exact: true }).click();
    await page
      .getByRole("button", { name: "บันทึกเป็น Rev ใหม่", exact: true })
      .click();
    await expect(
      page.getByText("บันทึก Rev2 แล้ว", { exact: false }),
    ).toBeVisible();
  });
}
