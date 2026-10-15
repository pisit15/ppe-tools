const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
let signature =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jmV8AAAAASUVORK5CYII=";
async function login(request, username) {
  const r = await request.post("/api/auth/login", {
    data: { username, password: "local-test-only" },
  });
  expect(r.status(), await r.text()).toBe(200);
}
async function api(request, resource, method = "get", data, company = "amt") {
  const r = await request[method](
    "/api/permit/" + resource + "?company_id=" + company,
    data ? { data } : undefined,
  );
  return { r, body: await r.json() };
}
test("full permit workflow, authorization, signatures, template versions and PDF print", async ({
  page,
  browser,
}) => {
  await page.request.post("http://127.0.0.1:4321/__test/reset");
  await login(page.request, "audit-admin");
  expect(
    (await page.request.get("/api/ppe/products?company_id=amt")).status(),
  ).toBe(200);
  await page.goto("/permit?company_id=amt");
  signature = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 100;
    const x = c.getContext("2d");
    x.strokeStyle = "#23436d";
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(40, 60);
    x.bezierCurveTo(130, 0, 60, 95, 180, 35);
    x.bezierCurveTo(260, 0, 190, 95, 350, 30);
    x.stroke();
    x.font = "14px Arial";
    x.fillStyle = "#789";
    x.fillText("TEST ONLY", 140, 90);
    return c.toDataURL("image/png");
  });
  await page.getByRole("button", { name: "แม่แบบเอกสาร", exact: true }).click();
  await page
    .getByRole("button", { name: "นำเข้าต้นแบบ AMITA 9 ประเภท" })
    .click();
  await expect(page.getByText("บันทึกเรียบร้อย")).toBeVisible();
  const templates = (await api(page.request, "templates")).body.data;
  expect(templates).toHaveLength(9);
  const general = templates.find((t) => t.code === "AHS-003");
  await api(page.request, "templates", "patch", {
    id: general.id,
    active: true,
    confirm: true,
  });
  const now = Date.now();
  const account = {
    username: "contractor-test",
    password: "local-test-only",
    display_name: "ผู้รับเหมาทดสอบ",
    contractor_name: "บริษัททดสอบ จำกัด",
    starts_at: new Date(now - 60000).toISOString(),
    expires_at: new Date(now + 86400000).toISOString(),
  };
  expect(
    (await api(page.request, "contractors", "post", account)).r.status(),
  ).toBe(201);
  const ctx = await browser.newContext({ baseURL: "http://127.0.0.1:4320" });
  const worker = await ctx.newPage();
  await worker.goto("/permit");
  await worker.getByRole("button", { name: "ผู้รับเหมา", exact: true }).click();
  await worker.getByLabel("ชื่อผู้ใช้", { exact: true }).fill(account.username);
  await worker.getByLabel("รหัสผ่าน", { exact: true }).fill(account.password);
  await worker
    .getByRole("button", { name: "เข้าสู่ Work Permit", exact: true })
    .click();
  await expect(
    worker.getByRole("button", { name: "สร้างคำขอใหม่" }),
  ).toBeVisible();
  expect((await worker.request.get("/api/auth/session")).status()).toBe(401);
  expect(
    (await worker.request.get("/api/ppe/products?company_id=amt")).status(),
  ).toBe(401);
  expect(
    (
      await worker.request.get("/api/chemical/substances?company_id=amt")
    ).status(),
  ).toBe(401);
  expect((await api(worker.request, "contractors")).r.status()).toBe(403);
  expect(
    (await api(worker.request, "permits", "get", null, "aab")).r.status(),
  ).toBe(403);
  await worker.getByRole("button", { name: "สร้างคำขอใหม่" }).click();
  await worker
    .getByLabel("ชื่องาน", { exact: true })
    .fill("ตรวจซ่อมระบบระบายอากาศ — ข้อมูลทดสอบ");
  await worker
    .getByLabel("พื้นที่ปฏิบัติงาน", { exact: true })
    .fill("อาคารผลิต / พื้นที่ทดสอบ");
  await worker.getByLabel("เบอร์ติดต่อ", { exact: true }).fill("0000000000");
  await worker
    .getByLabel("รายละเอียด / ขอบเขตงาน")
    .fill("ตรวจสอบก่อนเริ่มงานสำหรับทดสอบระบบ");
  await worker
    .getByLabel("รายชื่อผู้ปฏิบัติงานและหน้าที่")
    .fill("บุคลากรทดสอบ 1 คน");
  await worker.getByLabel("ผลกระทบต่อระบบดับเพลิง").fill("ไม่มี — ข้อมูลทดสอบ");
  await worker.getByText("AHS-003", { exact: true }).click();
  for (const f of general.config.fields) {
    if (f.kind === "check")
      await worker
        .getByLabel(f.label + " *", { exact: true })
        .selectOption("yes");
    else
      await worker
        .getByLabel(f.label + (f.required ? " *" : ""), { exact: true })
        .fill("ตรวจทานแล้ว — ข้อมูลทดสอบ");
  }
  await worker
    .getByLabel("เจ้าของพื้นที่", { exact: true })
    .selectOption("company_users:aaaaaaaa-1111-4111-8111-111111111111");
  await worker
    .getByLabel("เจ้าหน้าที่ความปลอดภัย", { exact: true })
    .selectOption("company_users:bbbbbbbb-1111-4111-8111-111111111111");
  await worker.getByRole("button", { name: "บันทึกร่างคำขอ" }).click();
  await expect(
    worker.getByRole("button", { name: "ลงนามส่งคำขอ", exact: true }),
  ).toBeVisible();
  let permit = (await api(worker.request, "permits")).body.data[0];
  const id = permit.id;
  await worker
    .getByRole("button", { name: "ลงนามส่งคำขอ", exact: true })
    .click();
  await worker
    .getByLabel("ภาพลายเซ็น", { exact: true })
    .setInputFiles({
      name: "signature.png",
      mimeType: "image/png",
      buffer: Buffer.from(signature.split(",")[1], "base64"),
    });
  await worker.getByRole("checkbox").check();
  await worker
    .getByRole("button", { name: "ยืนยันลงนามส่งคำขอ", exact: true })
    .click();
  await expect(worker.locator(".wp-document .wp-status")).toHaveText(
    "รออนุมัติ",
  );
  permit = (await api(worker.request, "permits/" + id)).body.data;
  const owner = await browser.newContext({ baseURL: "http://127.0.0.1:4320" }),
    safety = await browser.newContext({ baseURL: "http://127.0.0.1:4320" });
  await login(owner.request, "permit-owner");
  await login(safety.request, "permit-safety");
  async function action(request, action, extra = {}) {
    const result = await api(request, "permits/" + id, "post", {
      version: permit.version,
      action,
      signature,
      confirm: true,
      note: "ตรวจยืนยันสำหรับการทดสอบ",
      ...extra,
    });
    expect(result.r.status(), JSON.stringify(result.body)).toBe(200);
    permit = result.body.data;
  }
  expect(
    (
      await api(safety.request, "permits/" + id, "post", {
        version: permit.version,
        action: "approve",
        signature,
        confirm: true,
      })
    ).r.status(),
  ).toBe(409);
  await action(owner.request, "approve");
  const version = permit.version;
  await action(safety.request, "approve");
  expect(
    (
      await api(owner.request, "permits/" + id, "post", {
        version,
        action: "start",
        signature,
        confirm: true,
        note: "stale",
      })
    ).r.status(),
  ).toBe(409);
  await action(owner.request, "start");
  await action(safety.request, "inspect", { unsafe: true });
  expect(permit.status).toBe("suspended");
  await action(owner.request, "resume");
  await action(worker.request, "request_close");
  await action(owner.request, "close");
  await action(safety.request, "close");
  expect(permit.status).toBe("closed");
  expect(permit.data.signatures.length).toBe(7);
  const before = permit.data.forms[0].template;
  const v2 = await api(page.request, "templates", "post", {
    ...general,
    name: "แม่แบบแก้ไขใหม่",
    revision: "E",
  });
  expect(v2.r.status()).toBe(201);
  const after = (await api(worker.request, "permits/" + id)).body.data;
  expect(after.data.forms[0].template).toEqual(before);
  await worker.reload();
  await worker
    .getByRole("button", { name: permit.data.title, exact: true })
    .click();
  await expect(worker.locator(".wp-document .wp-status")).toHaveText(
    "ปิดงานแล้ว",
  );
  await expect(worker.locator(".wp-signature")).toHaveCount(7);
  fs.mkdirSync(path.join(__dirname, "../output/permit"), { recursive: true });
  await worker.screenshot({
    path: path.join(__dirname, "../output/permit/permit-document.png"),
    fullPage: true,
  });
  await worker.emulateMedia({ media: "print" });
  await worker.screenshot({
    path: path.join(__dirname, "../output/permit/permit-print.png"),
    fullPage: true,
  });
  await worker.emulateMedia({ media: "screen" });
  await worker.getByRole("button", { name: "กลับรายการ", exact: true }).click();
  await worker.screenshot({
    path: path.join(__dirname, "../output/permit/permit-dashboard.png"),
    fullPage: true,
  });
  await worker.setViewportSize({ width: 390, height: 844 });
  await worker.screenshot({
    path: path.join(__dirname, "../output/permit/permit-mobile.png"),
    fullPage: true,
  });
  expect(
    await worker.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await worker.request.post("http://127.0.0.1:4321/__test/expire");
  expect((await api(worker.request, "permits")).r.status()).toBe(401);
  await ctx.close();
  await owner.close();
  await safety.close();
});
