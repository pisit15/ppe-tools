import ExcelJS from 'exceljs';

export type TallyRow = { name: string; unit: string; days: number[]; total: number };
/** Monthly tally in the layout of AMT's "First aid report" workbook: medicines down, days across. */
export async function tallyWorkbook(company: string, period: string, daysInMonth: number, rows: TallyRow[], locationName: string) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'EA SHE Tools · First Aid';
  const sheet = wb.addWorksheet(period);
  const header = ['รายการ', 'หน่วย', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)), 'รวม'];
  sheet.mergeCells(1, 1, 1, header.length);
  sheet.getCell(1, 1).value = `First aid report · ${company.toUpperCase()} · ${period}${locationName ? ` · ${locationName}` : ''}`;
  sheet.getRow(1).font = { name: 'Tahoma', size: 14, bold: true, color: { argb: 'FF246047' } };
  sheet.getRow(3).values = header;
  sheet.getRow(3).font = { name: 'Tahoma', bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF246047' } };
  sheet.getRow(3).alignment = { horizontal: 'center' };
  for (const r of rows) {
    const row = sheet.addRow([r.name, r.unit, ...r.days.map(d => (d === 0 ? null : d)), r.total]);
    row.font = { name: 'Tahoma', size: 11 };
    row.getCell(header.length).font = { name: 'Tahoma', size: 11, bold: true };
  }
  const totals = sheet.addRow(['รวม', '', ...Array.from({ length: daysInMonth }, (_, i) => rows.reduce((s, r) => s + r.days[i], 0) || null), rows.reduce((s, r) => s + r.total, 0)]);
  totals.font = { name: 'Tahoma', size: 11, bold: true };
  sheet.getColumn(1).width = 34; sheet.getColumn(2).width = 8;
  for (let c = 3; c <= header.length; c++) sheet.getColumn(c).width = c === header.length ? 8 : 4.5;
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }];
  return wb.xlsx.writeBuffer();
}

export type HealthExportRow = { date: string; month: string; datePrecision: 'day' | 'month'; location: string; department: string; group: string; illness: boolean; source: string; reason: string; item: string; category: string; quantity: number; unit: string; channel: string; documentId: string };
/**
 * Dispense lines by illness group, shaped for further analysis: one long sheet (a row per line, filter/pivot-ready),
 * two ready-made pivots, the medicine → group table used for inference, and notes on how to read it. No personal names.
 */
export async function healthWorkbook(company: string, months: string[], rows: HealthExportRow[], groups: { label: string; illness: boolean }[], itemGroups: { item: string; category: string; group: string; lines: number }[], locationName: string, generatedOn: string) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'EA SHE Tools · First Aid';
  const GREEN = 'FF246047'; const font = { name: 'Tahoma', size: 11 };
  const head = (sheet: ExcelJS.Worksheet, rowNo: number, values: (string | number)[]) => {
    const row = sheet.getRow(rowNo); row.values = values; row.font = { ...font, bold: true, color: { argb: 'FFFFFFFF' } };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }; row.alignment = { vertical: 'middle', wrapText: true };
  };
  const title = `${company.toUpperCase()}${locationName ? ` · ${locationName}` : ''} · ${months[0]} ถึง ${months[months.length - 1]}`;

  // 1) long data
  const data = wb.addWorksheet('ข้อมูล');
  const cols = ['วันที่', 'เดือน', 'ความละเอียดวันที่', 'จุดปฐมพยาบาล', 'แผนก', 'กลุ่มอาการ', 'นับเป็นการเจ็บป่วย', 'ที่มาของกลุ่มอาการ', 'อาการที่ผู้เบิกระบุ', 'ยา / เวชภัณฑ์', 'หมวด', 'จำนวน', 'หน่วย', 'ช่องทางบันทึก', 'เลขอ้างอิงใบเบิก'];
  head(data, 1, cols);
  for (const r of rows) {
    const [y, m, d] = r.date.split('-').map(Number);
    const row = data.addRow([new Date(Date.UTC(y, m - 1, d)), r.month, r.datePrecision === 'month' ? 'เดือน (ไม่ทราบวัน)' : 'วัน', r.location, r.department || 'ไม่ระบุ', r.group, r.illness ? 'ใช่' : 'ไม่ใช่', r.source, r.reason, r.item, r.category, r.quantity, r.unit, r.channel, r.documentId.slice(0, 8)]);
    row.font = font; row.getCell(1).numFmt = 'yyyy-mm-dd';
  }
  [12, 9, 14, 30, 22, 30, 12, 20, 24, 34, 12, 9, 9, 20, 14].forEach((w, i) => { data.getColumn(i + 1).width = w; });
  data.views = [{ state: 'frozen', ySplit: 1 }]; data.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  // 2) group × month
  const ill = rows.filter(r => r.illness);
  const byMonth = wb.addWorksheet('สรุปรายเดือน');
  byMonth.getCell(1, 1).value = `รายการเบิกตามกลุ่มอาการ รายเดือน · ${title}`; byMonth.getRow(1).font = { ...font, size: 13, bold: true, color: { argb: GREEN } };
  head(byMonth, 3, ['กลุ่มอาการ', ...months, 'รวม', '% ของการเจ็บป่วย']);
  for (const g of groups) {
    const mine = rows.filter(r => r.group === g.label); if (mine.length === 0) continue;
    const row = byMonth.addRow([g.label, ...months.map(m => mine.filter(r => r.month === m).length || null), mine.length, g.illness && ill.length ? mine.length / ill.length : null]);
    row.font = font; row.getCell(months.length + 3).numFmt = '0.0%'; if (!g.illness) row.font = { ...font, italic: true, color: { argb: 'FF666666' } };
  }
  const total = byMonth.addRow(['รวมการเจ็บป่วย', ...months.map(m => ill.filter(r => r.month === m).length || null), ill.length, ill.length ? 1 : null]);
  total.font = { ...font, bold: true }; total.getCell(months.length + 3).numFmt = '0.0%';
  byMonth.getColumn(1).width = 46; months.forEach((_, i) => { byMonth.getColumn(i + 2).width = 9; }); byMonth.getColumn(months.length + 2).width = 9; byMonth.getColumn(months.length + 3).width = 12;
  byMonth.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];

  // 3) department × group
  const illGroups = groups.filter(g => g.illness && ill.some(r => r.group === g.label));
  const byDept = wb.addWorksheet('สรุปตามแผนก');
  byDept.getCell(1, 1).value = `รายการเบิกตามแผนก × กลุ่มอาการ (เฉพาะการเจ็บป่วย) · ${title}`; byDept.getRow(1).font = { ...font, size: 13, bold: true, color: { argb: GREEN } };
  head(byDept, 3, ['แผนก', ...illGroups.map(g => g.label), 'รวม']);
  const depts = [...new Set(ill.map(r => r.department || 'ไม่ระบุ'))].map(d => ({ d, n: ill.filter(r => (r.department || 'ไม่ระบุ') === d).length })).sort((a, b) => b.n - a.n);
  for (const { d, n } of depts) byDept.addRow([d, ...illGroups.map(g => ill.filter(r => (r.department || 'ไม่ระบุ') === d && r.group === g.label).length || null), n]).font = font;
  byDept.getColumn(1).width = 30; illGroups.forEach((_, i) => { byDept.getColumn(i + 2).width = 16; }); byDept.getColumn(illGroups.length + 2).width = 9;
  byDept.getRow(3).height = 34; byDept.views = [{ state: 'frozen', xSplit: 1, ySplit: 3 }];

  // 4) medicine → group
  const map = wb.addWorksheet('ยา-กลุ่มอาการ');
  head(map, 1, ['ยา / เวชภัณฑ์', 'หมวด', 'กลุ่มอาการที่ใช้เมื่อผู้เบิกไม่ได้ระบุ', 'รายการเบิกในช่วงนี้']);
  for (const r of itemGroups) map.addRow([r.item, r.category, r.group, r.lines]).font = font;
  [36, 12, 46, 16].forEach((w, i) => { map.getColumn(i + 1).width = w; }); map.views = [{ state: 'frozen', ySplit: 1 }];

  // 5) how to read
  const note = wb.addWorksheet('คำอธิบาย');
  const lines = [
    `First Aid · รายงานตามอาการเจ็บป่วย · ${title} · ออกรายงาน ${generatedOn}`, '',
    '1 แถว = ยา 1 ชนิดในการเบิก 1 ครั้ง (รายการเบิก) ไม่ใช่จำนวนคน และไม่ใช่จำนวนเม็ด',
    'กลุ่มอาการ: ใช้อาการที่ผู้เบิกเลือกหรือพิมพ์ไว้ก่อน ถ้าไม่มีจึงอนุมานจากยาที่เบิก (ดูคอลัมน์ "ที่มาของกลุ่มอาการ" และแผ่น "ยา-กลุ่มอาการ")',
    'การอนุมานจากยาเป็นการประมาณ: Paracetamol แยกปวดหัวกับไข้ไม่ได้ ยาแก้แพ้ใช้ได้ทั้งหวัดและภูมิแพ้ จึงไม่ใช่การวินิจฉัยโรค',
    'แถวที่ "นับเป็นการเจ็บป่วย = ไม่ใช่" คือการเติมกล่องประจำทีม หน้ากาก ถุงมือ และวัสดุ ไม่รวมในสัดส่วนร้อยละ',
    'ไม่มีชื่อบุคคลในไฟล์นี้ รายละเอียดบุคคลที่ละเอียดที่สุดคือแผนก',
    'ข้อมูลที่นำเข้าจาก Excel เดิมไม่มีแผนกและอาการ บางเดือนมีเฉพาะระดับเดือน (ดูคอลัมน์ "ความละเอียดวันที่")',
    'เดือนที่เป็นช่องว่างอาจหมายถึงไม่มีการบันทึก ไม่ได้แปลว่าไม่มีผู้เจ็บป่วย',
  ];
  lines.forEach((text, i) => { note.getCell(i + 1, 1).value = text; note.getRow(i + 1).font = i === 0 ? { ...font, size: 13, bold: true, color: { argb: GREEN } } : font; });
  note.getColumn(1).width = 140;
  return wb.xlsx.writeBuffer();
}
