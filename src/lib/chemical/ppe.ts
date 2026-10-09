/** Original UI/label illustrations. Select protection appropriate to the product SDS. */
export const LABEL_PPE = [
  { code: 'goggles', name: 'แว่นตานิรภัย' },
  { code: 'face-shield', name: 'กระบังหน้า' },
  { code: 'gloves', name: 'ถุงมือป้องกันสารเคมี' },
  { code: 'respirator', name: 'หน้ากากกรองไอ / ก๊าซ' },
  { code: 'dust-mask', name: 'หน้ากากกรองฝุ่น' },
  { code: 'coverall', name: 'ชุดป้องกันสารเคมี' },
  { code: 'apron', name: 'ผ้ากันเปื้อน' },
  { code: 'boots', name: 'รองเท้าป้องกันสารเคมี' },
  { code: 'scba', name: 'เครื่องช่วยหายใจ SCBA' },
] as const;
export type LabelPpeCode = typeof LABEL_PPE[number]['code'];
export const ppeFile = (code: LabelPpeCode) => `/ppe-label/${code}.svg`;
