const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    file,
  );
const { amtSections } = require("../src/lib/chemical/poster-sections.ts");
const blank = {
  ppeNotes: "",
  firstAid: "",
  storage: "",
  spill: "",
  fire: "",
  precautions: "",
};
test("routes the reported P statements, fire and spill independently", () => {
  const d = {
    ...blank,
    precautions: [
      "P220 เก็บให้ห่างจากเสื้อผ้าและวัสดุติดไฟได้",
      "P280 สวมถุงมือ ชุดป้องกัน อุปกรณ์ป้องกันดวงตาและใบหน้า",
      "P301+P330+P331 หากกลืนกิน: บ้วนปาก ห้ามทำให้อาเจียน",
      "P305 + P351 + P338 หากเข้าตา: ล้างตา",
      "P303+P361+P353 หากสัมผัสผิวหนัง: ถอดเสื้อผ้า ล้างผิวหนัง",
      "P310 ติดต่อแพทย์ทันที",
      "P370+P376 เมื่อเกิดไฟไหม้: หยุดรั่วถ้าปลอดภัย",
      "P391 เก็บสารที่หก",
      "P403+P233 ระบายอากาศและปิดภาชนะ",
    ].join("\n"),
  };
  const before = JSON.stringify(d);
  const out = amtSections(d);
  assert.match(out.storage, /P220/);
  assert.match(out.storage, /P403/);
  assert.doesNotMatch(out.storage, /P280|P30|P310|P37|P391/);
  assert.match(out.ppeNotes, /P280/);
  assert.match(out.firstAid, /P301\+P330\+P331/);
  assert.match(out.firstAid, /P305 \+ P351 \+ P338/);
  assert.match(out.firstAid, /P303/);
  assert.match(out.firstAid, /P310/);
  assert.match(out.fire, /P370\+P376/);
  assert.match(out.spill, /P391/);
  assert.equal(out.precautions, "");
  assert.equal(JSON.stringify(d), before);
});
test("removes exact duplicates across descriptions and P entries, preserving custom wording and extra safety details", () => {
  const out = amtSections({
    ...blank,
    ppeNotes: "สวมถุงมือ\nสวมถุงมือ",
    storage: "ปิดภาชนะให้สนิท",
    firstAid: "กลืนกิน: ห้ามทำให้อาเจียน รีบติดต่อแพทย์ทันที",
    precautions:
      "P280 สวมถุงมือ\np280 สวมถุงมือ\nP233 ปิดภาชนะให้สนิท\nP301+P330+P331 หากกลืนกิน: บ้วนปาก ห้ามทำให้อาเจียน\nP301+P330+P331 หากกลืนกิน: บ้วนปาก ห้ามทำให้อาเจียน\nP280 สวมถุงมือไนไตรล์",
  });
  assert.equal(out.ppeNotes, "สวมถุงมือ\nP280 สวมถุงมือไนไตรล์");
  assert.equal(out.storage, "ปิดภาชนะให้สนิท");
  assert.equal(
    out.firstAid,
    "กลืนกิน: ห้ามทำให้อาเจียน รีบติดต่อแพทย์ทันที\nP301+P330 หากกลืนกิน: บ้วนปาก",
  );
});
test("does not collapse negation, exposure routes, durations or reworded/custom combined statements", () => {
  const out = amtSections({
    ...blank,
    storage: "ห้ามเก็บในที่เย็น",
    firstAid: "ผิวหนัง: ล้างด้วยน้ำ 15 นาที\nกลืนกิน: ห้ามบ้วนปาก",
    precautions:
      "P235 เก็บในที่เย็น\nP305+P351 หากเข้าตา: ล้างด้วยน้ำ 15 นาที\nP305+P351 หากเข้าตา: ล้างด้วยน้ำ 20 นาที\nP301+P330 หากกลืนกิน: บ้วนปาก\nP301+P330+P331 ข้อความเฉพาะจากผู้ใช้ ห้ามทำให้อาเจียน",
  });
  assert.match(out.storage, /P235/);
  assert.match(out.firstAid, /15 นาที/);
  assert.match(out.firstAid, /20 นาที/);
  assert.match(out.firstAid, /P301\+P330 หากกลืนกิน: บ้วนปาก/);
  assert.match(out.firstAid, /ข้อความเฉพาะจากผู้ใช้ ห้ามทำให้อาเจียน/);
});
test("keeps free text, disposal, unknown and mixed-topic codes in their own precaution heading", () => {
  const out = amtSections({
    ...blank,
    precautions:
      "P280 สวมถุงมือ, P233 ปิดภาชนะ\nอ่าน SDS ก่อนใช้\nP999 ข้อความใหม่\nP501 กำจัดภาชนะ\nP280+P233 ข้อความรวมต่างหมวด\nP280+P999 มีรหัสไม่รู้จัก",
  });
  assert.equal(out.ppeNotes, "P280 สวมถุงมือ");
  assert.equal(out.storage, "P233 ปิดภาชนะ");
  for (const value of [
    "อ่าน SDS ก่อนใช้",
    "P999",
    "P501",
    "P280+P233",
    "P280+P999",
  ])
    assert.ok(out.precautions.includes(value));
});
test("deduplicates plain text only when the whole text is present, never by a shared code alone", () => {
  const out = amtSections({
    ...blank,
    spill: "เก็บสารที่หก",
    precautions:
      "เก็บสารที่หก\nP391 เก็บสารที่หก\nP391 เก็บสารด้วยวัสดุที่เหมาะสม\nP391 เก็บสารด้วยวัสดุที่เหมาะสม",
  });
  assert.equal(out.spill, "เก็บสารที่หก\nP391 เก็บสารด้วยวัสดุที่เหมาะสม");
  assert.equal(out.precautions, "");
});

const {
  amtGhsLayout,
  AMT_SDS_QR,
} = require("../src/lib/chemical/poster-ghs-layout.ts");
test("AMT enlarges three GHS symbols to 18 mm and keeps up to nine clear of QR and signal", () => {
  assert.equal(amtGhsLayout(3, 93.3, true).size, 18);
  for (let count = 0; count <= 9; count++) {
    for (const qr of [false, true]) {
      const layout = amtGhsLayout(count, 93.3, qr);
      assert.ok(layout, `count ${count}, QR ${qr}`);
      assert.equal(layout.positions.length, count);
      assert.ok(layout.size >= 10);
      for (const [i, p] of layout.positions.entries()) {
        assert.ok(p.y >= 93.3 && p.y + layout.size <= 128);
        assert.ok(p.x >= 13 && p.x + layout.size <= 72);
        if (qr)
          assert.ok(
            p.x + layout.size <= AMT_SDS_QR.x - 1 ||
              p.y + layout.size <= AMT_SDS_QR.y - 1,
          );
        for (const other of layout.positions.slice(i + 1)) {
          assert.ok(
            p.x + layout.size <= other.x ||
              other.x + layout.size <= p.x ||
              p.y + layout.size <= other.y ||
              other.y + layout.size <= p.y,
          );
        }
      }
    }
  }
  assert.equal(amtGhsLayout(9, 106, true), null);
});
