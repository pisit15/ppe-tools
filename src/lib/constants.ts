// PPE Types
export const PPE_TYPES = [
  { value: 'gloves', label: 'ถุงมือ', icon: '🧤' },
  { value: 'helmet', label: 'หมวก', icon: '⛑️' },
  { value: 'glasses', label: 'แว่นตา', icon: '👓' },
  { value: 'mask', label: 'หน้ากาก', icon: '😷' },
  { value: 'shoes', label: 'รองเท้า', icon: '👢' },
  { value: 'vest', label: 'ชุดป้องกัน', icon: '🦺' },
  { value: 'goggles', label: 'แว่นนิรภัย', icon: '🥽' },
  { value: 'earplugs', label: 'ที่อุดหู', icon: '👂' },
  { value: 'glove_apron', label: 'เสื้อกันเปื้อน', icon: '👗' },
  { value: 'others', label: 'อื่น ๆ', icon: '📦' },
];

// Unit Types
export const UNIT_TYPES = [
  { value: 'piece', label: 'ชิ้น' },
  { value: 'pair', label: 'คู่' },
  { value: 'box', label: 'กล่อง' },
  { value: 'pack', label: 'แพ็ก' },
  { value: 'dozen', label: 'โหล' },
  { value: 'set', label: 'ชุด' },
];

// Transaction Types
export const TRANSACTION_TYPES = [
  { value: 'stock_in', label: 'รับเข้า', color: 'bg-green-100 text-green-800' },
  { value: 'return', label: 'รับคืน', color: 'bg-blue-100 text-blue-800' },
  { value: 'stock_out', label: 'เบิก', color: 'bg-red-100 text-red-800' },
  { value: 'borrow', label: 'ยืม', color: 'bg-yellow-100 text-yellow-800' },
];

// Color Palette (matching eashe.org)
export const COLORS = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#2B8C3E',
  warning: '#F28E2B',
  danger: '#E15759',
  info: '#4E79A7',
};

// Tailwind Color Classes
export const COLOR_CLASSES = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-orange-500 hover:bg-orange-600 text-white',
  accent: 'bg-red-600 hover:bg-red-700 text-white',
  positive: 'bg-green-600 hover:bg-green-700 text-white',
  warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
  info: 'bg-blue-600 hover:bg-blue-700 text-white',
};

// Departments
export const DEPARTMENTS = [
  { value: 'production', label: 'ฝ่ายผลิต' },
  { value: 'logistics', label: 'ฝ่ายโลจิสติกส์' },
  { value: 'admin', label: 'ฝ่ายบริหาร' },
  { value: 'hr', label: 'ฝ่าย HR' },
  { value: 'maintenance', label: 'ฝ่ายบำรุงรักษา' },
  { value: 'quality', label: 'ฝ่ายควบคุมคุณภาพ' },
];

// Date Formats
export const DATE_FORMAT = 'DD/MM/YYYY';
export const TIME_FORMAT = 'HH:mm';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
