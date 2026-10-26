import ExcelJS from 'exceljs';
import { usageTotals, type UsageGroup, type UsageView } from './ppe-usage';

export async function usageWorkbook(groups: UsageGroup[], view: UsageView, from: string, to: string, filter: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PPE Inventory';
  const name = view === 'dept' ? 'ตามแผนก' : view === 'product' ? 'ตามสินค้า' : 'ตามพนักงาน';
  const sheet = wb.addWorksheet(name);
  const employee = view === 'emp';
  const columns = view === 'product' ? ['บริษัท','สินค้า','แผนก','หน่วยนับ','เบิกออก','ยืม'] : ['บริษัท','แผนก','สินค้า','หน่วยนับ','เบิกออก','ยืม'];
  if (employee) columns.splice(2,0,'รหัสพนักงาน','พนักงาน');
  const count = columns.length;
  for (let row=1;row<=3;row++) sheet.mergeCells(row,1,row,count);
  sheet.getCell(1,1).value = `รายงานการเบิก PPE ${name}`;
  sheet.getCell(2,1).value = `ช่วงเดือน ${from} ถึง ${to} (รวมวันแรกและวันสุดท้ายของช่วงเดือน)`;
  sheet.getCell(3,1).value = filter ? `ตัวกรอง: ${filter}` : 'ทุกรายการในบริษัทและช่วงเวลาที่เลือก';
  sheet.getRow(1).font = {name:'Tahoma',size:16,bold:true,color:{argb:'FF4E79A7'}};
  sheet.getRow(1).height = 30;
  sheet.getRow(3).height = 36;
  sheet.getRow(5).values = columns;
  sheet.getRow(5).font = {name:'Tahoma',bold:true,color:{argb:'FFFFFFFF'}};
  sheet.getRow(5).fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FF4E79A7'}};
  const rows = groups.flatMap(g => g.rows);
  for (const r of rows) {
    const values = view === 'product' ? [r.company.toUpperCase(),r.product,r.department,r.unit,r.issued,r.borrowed] : [r.company.toUpperCase(),r.department,r.product,r.unit,r.issued,r.borrowed];
    if (employee) values.splice(2,0,r.employeeCode,r.employee);
    const row = sheet.addRow(values);
    row.font = {name:'Tahoma',size:11};
    row.height = Math.max(30,Math.ceil(r.product.length/42)*16,Math.ceil(r.department.length/30)*16);
    if (row.number%2===0) row.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFF3F6FA'}};
  }
  columns.forEach((column,i) => {
    sheet.getColumn(i+1).width = column === 'สินค้า' ? 58 : column === 'แผนก' ? 42 : column === 'พนักงาน' ? 30 : 17;
    if (['เบิกออก','ยืม'].includes(column)) sheet.getColumn(i+1).numFmt = '#,##0.##';
  });
  sheet.views = [{state:'frozen',ySplit:5}];
  sheet.autoFilter = {from:{row:5,column:1},to:{row:Math.max(5,sheet.rowCount),column:count}};
  sheet.addRow([]);
  sheet.addRow(['รวมแยกตามหน่วยนับ','เบิกออก','ยืม']).font = {name:'Tahoma',bold:true};
  for (const total of usageTotals(rows)) sheet.addRow([total.unit,total.issued,total.borrowed]);
  sheet.eachRow(row => row.eachCell(cell => {cell.alignment = {vertical:'middle',wrapText:true};}));
  sheet.pageSetup = {orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:5'};
  return wb.xlsx.writeBuffer();
}
