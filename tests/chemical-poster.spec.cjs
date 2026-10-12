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
  await page.goto(`/chemical/${id}/poster`);
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
  await page.getByLabel("บริษัทที่เลือกใช้ได้").selectOption("amt");
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
