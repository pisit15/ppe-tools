import type { PermitTemplate, TemplateField } from "./types";
import { PERMIT_SEEDS } from "./legacy-catalog";

// Reviewed against the supplied AHS-003 Rev.D and AHS-004 Rev.D PDFs.
// Mark coordinates are checkbox CENTRES in the 827 x 1170 source render.
// Text coordinates are the top-left of the available writing space.
const layoutVersion = "amt-2026-11-v2";
const usedOptions = [
  { value: "yes", label: "ใช้ / จัดให้มี" },
  { value: "no", label: "ไม่ใช้" },
];
function choice(id: string, label: string, section: string, x: number, y: number): TemplateField {
  return { id, label, section, kind: "choice", required: true,
    options: usedOptions.map(o => ({...o})),
    print: {x, y, marks: [{value: "yes", x, y}]},
  };
}
function note(id: string, label: string, section: string, print?: TemplateField["print"]): TemplateField {
  return {id, label, section, kind: "textarea", required: false, ...(print ? {print} : {})};
}
const sharedNotes: TemplateField[] = [
  {id: "equipment", label: "เครื่องมือและอุปกรณ์ที่ใช้เพิ่มเติม", section: "ข้อมูลประกอบการทำงาน", kind: "textarea", required: true},
  note("hazards", "อันตรายหรือมาตรการอื่นนอกเหนือจากรายการ", "มาตรการเพิ่มเติม"),
  note("additional", "มาตรการเพิ่มเติม", "มาตรการเพิ่มเติม"),
];

type Hazard = {id: string; label: string; y: number; controls: [string, string, number][]};
const leftHazards: Hazard[] = [
  {id: "machine", label: "มีจุดหนีบของเครื่องจักร", y: 424, controls: [
    ["guard", "ติดตั้งการ์ดครอบ", 425], ["isolate", "ปิดเครื่องจักรและตัดพลังงาน", 445],
  ]},
  {id: "slip", label: "ลื่น สะดุด หกล้ม หรือช่องเปิดที่พื้น", y: 474, controls: [
    ["tidy", "จัดวางของให้เป็นระเบียบ", 475], ["clean", "ทำความสะอาดพื้นที่ทำงาน", 494],
    ["opening", "กั้น หรือปิดช่องเปิดที่พื้น", 514], ["light", "จัดให้มีแสงสว่างที่เพียงพอ", 533],
  ]},
  {id: "noise", label: "เสียงดัง", y: 552, controls: [
    ["reduce", "ใช้อุปกรณ์ลดเสียง", 553], ["time", "จำกัดเวลาในการทำงาน", 573],
  ]},
  {id: "toxic", label: "เป็นพิษ: หายใจ เข้าปาก ผิวหนัง ดวงตา", y: 599, controls: [
    ["mask", "สวมหน้ากากป้องกัน", 599], ["label", "บรรจุภัณฑ์ระบุชื่อสารเคมี", 619],
    ["ppe", "สวมแว่นตาและถุงมือ", 639], ["brief", "ผู้ปฏิบัติงานทราบอันตราย", 658],
  ]},
  {id: "electricity", label: "กระแสไฟฟ้า", y: 678, controls: [
    ["isolate", "ตัดระบบไฟฟ้า", 679], ["loto", "ใช้อุปกรณ์ Lock Out / Tag Out", 698],
    ["competent", "ผู้ปฏิบัติงานมีความชำนาญ", 718],
  ]},
  {id: "pressure", label: "แรงดันสูง (น้ำ ลม อื่น ๆ)", y: 737, controls: [
    ["barricade", "กั้นพื้นที่ ห้ามผู้ไม่เกี่ยวข้องเข้า", 738], ["competent", "ผู้ปฏิบัติงานมีความชำนาญ", 758],
  ]},
  {id: "smell", label: "กลิ่น", y: 778, controls: [
    ["ventilation", "มีพัดลมระบายอากาศ", 779], ["seal", "ปิดช่องไม่ให้กลิ่นฟุ้งกระจาย", 798],
  ]},
];
const rightHazards: Hazard[] = [
  {id: "falling_object", label: "วัตถุร่วงหล่น", y: 424, controls: [
    ["barricade", "กั้นพื้นที่อันตรายด้านล่าง", 425], ["stacked_work", "ไม่ทำงานซ้อนกับงานด้านบน", 445],
  ]},
  {id: "low_height", label: "ตกจากที่สูงน้อยกว่า 2 เมตร เช่น บันได นั่งร้าน ฯลฯ", y: 474, controls: [
    ["condition", "บันได / นั่งร้าน อยู่ในสภาพดี", 475], ["hold", "มีคนจับบันได ป้องกันบันไดล้ม", 495],
    ["other_1", "มาตรการเพิ่มเติมสำหรับการตกจากที่สูง ข้อ 1", 514],
    ["other_2", "มาตรการเพิ่มเติมสำหรับการตกจากที่สูง ข้อ 2", 534],
  ]},
  {id: "sharp", label: "ตัด บาด โดยมีด หรือขอบคม", y: 552, controls: [
    ["tool", "เลือกใช้เครื่องมือที่ปลอดภัยกว่า", 553], ["gloves", "สวมถุงมือกันบาด", 573],
  ]},
  {id: "heat", label: "ลมแดด หรือการทำงานท่ามกลางสภาพอากาศร้อน", y: 599, controls: [
    ["ready", "ผู้ทำงานอยู่ในสภาพพร้อมทำงาน", 600], ["ventilation", "มีพัดลม / การระบายความร้อน", 620],
    ["water", "จัดเตรียมน้ำดื่มให้เพียงพอ", 640], ["rescue", "ผู้ปฏิบัติงานทราบวิธีช่วยเหลือ", 659],
  ]},
  {id: "fire", label: "ไฟไหม้ และระเบิด", y: 678, controls: [
    ["electric", "อุปกรณ์ไฟฟ้าอยู่ในสภาพดี", 679], ["smoking", "ห้ามสูบบุหรี่นอกพื้นที่กำหนด", 698],
    ["combustible", "เก็บวัตถุติดไฟให้ห่างความร้อน", 718],
  ]},
  {id: "hot_surface", label: "สัมผัสพื้นผิวหรือวัสดุที่ร้อน", y: 737, controls: [
    ["isolate", "ตัดพลังงานความร้อน", 738], ["ppe", "สวมถุงมือหรือชุดกันความร้อน", 758],
  ]},
  {id: "vehicle", label: "รถยก / เครื่องจักรเคลื่อนที่", y: 778, controls: [
    ["authorized", "ขับขี่ได้เฉพาะผู้ได้รับอนุญาต", 779], ["phone", "ห้ามใช้โทรศัพท์มือถือขณะขับรถ", 798],
  ]},
];
function hazardFields(hazards: Hazard[], hazardX: number, controlX: number): TemplateField[] {
  return hazards.flatMap(h => {
    const section = `อันตราย: ${h.label}`;
    const hazard = choice(`hazard_${h.id}`, `มีอันตราย: ${h.label}`, section, hazardX, h.y);
    hazard.options = [{value: "yes", label: "มีอันตรายนี้"}, {value: "no", label: "ไม่มีอันตรายนี้"}];
    return [hazard, ...h.controls.flatMap(([id, label, y]) => {
      const control = choice(`control_${h.id}_${id}`, label, section, controlX, y);
      return h.id === "low_height" && id.startsWith("other_")
        ? [control, note(`control_${h.id}_${id}_text`, `รายละเอียด${label}`, section, {x: 682, y: y - 14, width: 105, height: 14})]
        : [control];
    })];
  });
}
const generalFields: TemplateField[] = [
  ...sharedNotes.map(f => structuredClone(f)),
  ...hazardFields(leftHazards, 31, 275),
  ...hazardFields(rightHazards, 425, 670),
];

const heightEquipment: [string, string, number, number][] = [
  ["mewp", "รถกระเช้า Mobile Elevated Work Platform (MEWP)", 37, 302],
  ["scaffold", "นั่งร้าน (Scaffolding)", 299, 302],
  ["ladder", "บันได (Ladder)", 428, 302],
  ["other", "อุปกรณ์และระบบความปลอดภัยอื่น ๆ", 537, 302],
];
const heightPpe: [string, string, number, number][] = [
  ["helmet", "หมวกนิรภัย (Helmet)", 44, 350],
  ["harness", "เข็มขัดนิรภัยชนิดเต็มตัว (Full Body Harness)", 44, 372],
  ["shoes", "รองเท้านิรภัย (Safety shoes)", 44, 393],
  ["glasses", "แว่นตานิรภัย (Safety Glasses)", 302, 350],
  ["gloves", "ถุงมือ (Gloves)", 302, 372],
  ["other_1", "PPE อื่น ๆ ข้อ 1", 302, 393],
  ["mask", "หน้ากากป้องกันฝุ่น / เคมี (Dust / Chemical mask)", 550, 350],
  ["hearing", "ครอบหูหรือปลั๊กอุดหู (Ears muff or ear plug)", 550, 372],
  ["other_2", "PPE อื่น ๆ ข้อ 2", 550, 393],
];
const heightChecks: [string, number][] = [
  ["บันไดอยู่ในสภาพดี เหมาะกับการทำงาน และใช้อย่างถูกต้อง", 528],
  ["ติดตั้งนั่งร้านอย่างถูกต้อง วัสดุนั่งร้านมีความแข็งแรง และใช้งานอย่างถูกต้อง", 565],
  ["จัดเตรียมชุดกันตกชนิดเต็มตัวให้ผู้ปฏิบัติงาน และดูแลให้ผู้ปฏิบัติงานสวมชุดกันตกตลอดเวลาที่ทำงาน", 605],
  ["ผู้ปฏิบัติงานได้รับการฝึกอบรมด้านความปลอดภัยแล้ว และมีสภาพร่างกายที่เหมาะสมกับการทำงานบนที่สูง", 650],
  ["มีมาตรการป้องกันอันตรายจากสิ่งของตกจากที่สูง เช่น กั้นพื้นที่ มีป้ายเตือน", 694],
  ["กั้นพื้นที่อันตราย ซึ่งผู้ปฏิบัติงานอาจตกลงไปได้ ก่อนเริ่มงาน", 732],
  ["จัดเตรียมให้มีจุดคล้องเกี่ยวสายชุดกันตก", 770],
  ["ห้ามยืนหรือไต่ขึ้นบนราวกั้น", 807],
  ["ห้ามโยนหรือทิ้งวัสดุใด ๆ จากแพลตฟอร์มหรือจากหลังคา", 840],
];
const heightFields: TemplateField[] = [
  ...sharedNotes.map(f => structuredClone(f)),
  {id: "access", label: "ความสูงและวิธีเข้าถึงพื้นที่ทำงาน", section: "วิธีเข้าถึงพื้นที่", kind: "textarea", required: true},
  ...heightEquipment.map(([id, label, x, y]) => choice(`equipment_${id}`, label, "อุปกรณ์และระบบความปลอดภัยที่ต้องใช้", x, y)),
  note("equipment_other_text", "ระบุอุปกรณ์และระบบความปลอดภัยอื่น ๆ", "อุปกรณ์และระบบความปลอดภัยที่ต้องใช้", {x: 626, y: 298, width: 67, height: 13}),
  ...heightPpe.map(([id, label, x, y]) => choice(`ppe_${id}`, label, "อุปกรณ์ป้องกันอันตรายส่วนบุคคลที่ต้องใช้", x, y)),
  note("ppe_other_1_text", "ระบุ PPE อื่น ๆ ข้อ 1", "อุปกรณ์ป้องกันอันตรายส่วนบุคคลที่ต้องใช้", {x: 365, y: 386, width: 120, height: 14}),
  note("ppe_other_2_text", "ระบุ PPE อื่น ๆ ข้อ 2", "อุปกรณ์ป้องกันอันตรายส่วนบุคคลที่ต้องใช้", {x: 610, y: 386, width: 125, height: 14}),
  ...heightChecks.map(([label, y], i): TemplateField => ({
    id: `check_${i + 1}`, label, section: "รายการตรวจสอบความปลอดภัย", kind: "check", required: true,
    print: {x: 423, y, marks: [{value: "yes", x: 423, y}, {value: "na", x: 467, y}]},
  })),
];

export const AMT_V2_SEEDS: Omit<PermitTemplate, "id" | "created_at">[] = [
  ["003", generalFields, "019a09d4afae5920a1cb783862cd00503ba229ebad97b7b66832953fc13c1fc3"],
  ["004", heightFields, "9833d1b8e6ac08075eb2edfaf94cf64097088421241ce3ecfa2f74d0a14d0718"],
].map(([source, fields, sha]) => {
  const seed = PERMIT_SEEDS.find(s => s.source_code === source)!;
  return {...structuredClone(seed), version: 2, active: false,
    review_note: "แม่แบบดิจิทัลรายช่องตรงต้นฉบับ Rev.D พร้อมผังพิมพ์ ตรวจทานรายการและผู้ลงนามก่อนเปิดใช้ เวอร์ชันเดิมและใบงานเดิมไม่เปลี่ยนแปลง",
    config: {...structuredClone(seed.config), fields: fields as TemplateField[], layoutVersion, sourceSha256: sha as string},
  };
});
