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
