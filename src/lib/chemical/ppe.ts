/** Artwork sources are documented in public/ppe-label/README.md. Choose PPE from the product SDS. */
export const LABEL_PPE = [
  { code: 'goggles', name: 'แว่นตานิรภัย', caption: ['แว่นตา', 'นิรภัย'] },
  { code: 'face-shield', name: 'กระบังหน้า', caption: ['กระบังหน้า'] },
  { code: 'gloves', name: 'ถุงมือป้องกันสารเคมี', caption: ['ถุงมือ', 'กันสารเคมี'] },
  { code: 'respirator', name: 'หน้ากากกรองไอ / ก๊าซ', caption: ['กรองไอ/ก๊าซ'] },
  { code: 'dust-mask', name: 'หน้ากากกรองฝุ่น', caption: ['กรองฝุ่น'] },
  { code: 'coverall', name: 'ชุดป้องกันสารเคมี', caption: ['ชุดกัน', 'สารเคมี'] },
  { code: 'apron', name: 'ผ้ากันเปื้อน', caption: ['ผ้ากันเปื้อน'] },
  { code: 'boots', name: 'รองเท้าป้องกันสารเคมี', caption: ['บูทกัน', 'สารเคมี'] },
  { code: 'scba', name: 'เครื่องช่วยหายใจ SCBA', caption: ['SCBA'] },
] as const;
export type LabelPpeCode = typeof LABEL_PPE[number]['code'];
export const ppeFile = (code: LabelPpeCode) => `/ppe-label/${code}.svg`;
