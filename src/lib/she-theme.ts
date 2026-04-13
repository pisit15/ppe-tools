/**
 * SHE Workforce — Centralized Color Theme
 * Based on Stephen Few's palette + colorblind-safe choices
 *
 * Rules:
 * 1. Green+Red combos replaced with Blue+Orange for colorblind safety
 * 2. Semantic: blue=neutral/actual, orange=warning, red=critical only for severe
 * 3. Same constants used across company page AND admin page
 */

// ── Responsibility Colors (colorblind-safe) ──────────────────
export const RESP_COLORS: Record<string, string> = {
  Safety: '#E68000',           // Deep orange — primary safety function
  Environment: '#2B8C3E',      // Dark green — environment (distinct from blue)
  'Occupational Health': '#4E79A7', // Steel blue — health
  Admin: '#8C8C8C',            // Medium gray — admin/support
  'อื่นๆ': '#BAB0AC',          // Light gray — uncategorized
};

// ── Employment Type Colors ───────────────────────────────────
export const EMP_TYPE_COLORS: Record<string, string> = {
  permanent: '#4E79A7',        // Steel blue
  subcontract: '#F28E2B',      // Orange
  outsource: '#B07AA1',        // Purple
  part_time: '#76B7B2',        // Teal
  dvt: '#9C755F',              // Brown
};

export const EMP_TYPES: Record<string, string> = {
  permanent: 'พนักงานประจำ',
  subcontract: 'ผู้รับเหมา',
  outsource: 'Outsource',
  part_time: 'Part-time',
  dvt: 'ทวิภาคี',
};

// ── Status Colors (colorblind-safe: blue/orange instead of green/red) ──
export const STATUS = {
  ok: '#4E79A7',               // Blue — met target / normal
  okBg: '#4E79A710',
  warning: '#F28E2B',          // Orange — attention needed
  warningBg: '#F28E2B10',
  critical: '#C23B22',         // Dark red — severe / far below target
  criticalBg: '#C23B2210',
  neutral: '#BAB0AC',          // Gray — no data / not applicable
  neutralBg: '#BAB0AC10',
  positive: '#2B8C3E',         // Dark green — surplus / passed
  positiveBg: '#2B8C3E10',
};

// ── License Matrix Colors (avoid green/red combo) ────────────
export const LICENSE = {
  has: '#4E79A7',              // Blue check — has license
  hasBg: '#4E79A720',
  missing: '#D4A574',          // Muted tan — missing (not alarming red)
  missingBg: '#D4A57415',
  required: '#4E79A7',         // Blue underline — required by law
  optional: '#D1D5DB',         // Light gray underline — optional
};

// ── Bullet Chart Colors (per Few's design) ──────────────────
export const BULLET = {
  actual: '#4E79A7',           // Blue bar — actual value
  target: '#C23B22',           // Red line — target/required
  bgBand: '#EEEEEE',          // Light gray — background band
};

// ── Category Colors ──────────────────────────────────────────
export const CATEGORY_COLORS: Record<string, string> = {
  safety: '#E68000',
  environment: '#2B8C3E',
  health: '#4E79A7',
};

// ── General Palette ──────────────────────────────────────────
export const PALETTE = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  text: '#333333',
  textSecondary: '#666666',
  border: '#E5E7EB',
  grid: '#EEEEEE',
  muted: '#BAB0AC',
};

// ── UI Neutral Tokens (drawer, forms, cards) ────────────────
export const UI = {
  // Backgrounds
  bgWhite: '#ffffff',
  bgPage: '#f9fafb',        // gray-50  — card/panel background
  bgMuted: '#f3f4f6',       // gray-100 — input/button neutral bg
  bgHover: '#e5e7eb',       // gray-200 — hover state
  // Text
  textStrong: '#1f2937',    // gray-800 — primary text on white
  textBody: '#374151',      // gray-700 — body text
  textLabel: '#6b7280',     // gray-500 — labels, captions
  textPlaceholder: '#9ca3af', // gray-400 — placeholders, muted
  textDisabled: '#d1d5db',  // gray-300 — disabled text
  // Borders
  borderStrong: '#d1d5db',  // gray-300 — input borders
  borderDefault: '#e5e7eb', // gray-200 — card/divider borders (= PALETTE.border)
  borderLight: '#f3f4f6',   // gray-100 — subtle separators
};

// ── Missing Data Style ───────────────────────────────────────
export const MISSING_DATA_COLOR = '#D1D5DB';  // Lighter gray for "-" placeholders
