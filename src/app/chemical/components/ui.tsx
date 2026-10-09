'use client';

import { ghsPictogram } from '@/lib/chemical/ghs';
import { storageClassDef } from '@/lib/chemical/storage-classes';
import type { StorageClassDef } from '@/lib/chemical/storage-classes';

export const VIZ = {
  primary: '#4E79A7',
  secondary: '#F28E2B',
  accent: '#E15759',
  positive: '#59A14F',
  neutral: '#BAB0AC',
  muted: '#D4D4D4',
  bg: '#EEEEEE',
  text: '#333333',
  lightText: '#666666',
  grid: '#EEEEEE',
  purple: '#7C3AED',
};

/** สีตามกลุ่มประเภทการจัดเก็บ */
export const GROUP_COLORS: Record<StorageClassDef['group'], { bg: string; fg: string }> = {
  explosive: { bg: '#fde8e8', fg: '#9b1c1c' },
  gas: { bg: '#e0f2fe', fg: '#075985' },
  flammable: { bg: '#ffedd5', fg: '#9a3412' },
  oxidizer: { bg: '#fef9c3', fg: '#854d0e' },
  toxic: { bg: '#ede9fe', fg: '#5b21b6' },
  radioactive: { bg: '#fce7f3', fg: '#9d174d' },
  corrosive: { bg: '#dcfce7', fg: '#166534' },
  other: { bg: '#f3f4f6', fg: '#374151' },
};

export function GhsIcons({ codes, size = 28 }: { codes: string[]; size?: number }) {
  if (!codes || codes.length === 0) return <span className="text-xs text-gray-600">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap min-w-20 max-w-32">
      {[...new Set(codes)].map(c => {
        const p = ghsPictogram(c);
        if (!p) return null;
        // eslint-disable-next-line @next/next/no-img-element
        return <img key={c} src={p.file} alt={p.nameTh} title={`${c} ${p.nameTh}`} width={size} height={size} style={{ width: size, height: size }} />;
      })}
    </span>
  );
}

export function StorageClassChip({ code, showName = false }: { code: string | null | undefined; showName?: boolean }) {
  const def = storageClassDef(code);
  if (!def) return <span className="text-xs text-gray-600" title="ยังไม่ระบุประเภทการจัดเก็บ">ยังไม่ระบุ</span>;
  const col = GROUP_COLORS[def.group];
  return (
    <span title={`${def.code} ${def.nameTh}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold whitespace-nowrap"
      style={{ background: col.bg, color: col.fg }}>
      {def.code}{showName && <span className="font-normal">· {def.nameTh}</span>}
    </span>
  );
}

export function SignalWordBadge({ word }: { word: string | null | undefined }) {
  if (!word || word === 'None') return <span className="text-xs text-gray-600">—</span>;
  const danger = word === 'Danger';
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-bold" style={{ background: danger ? '#fee2e2' : '#fef3c7', color: danger ? '#b91c1c' : '#b45309' }}>
      {danger ? 'อันตราย' : 'ระวัง'}
    </span>
  );
}

export function Toast({ toast }: { toast: { type: 'success' | 'error'; msg: string } | null }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 max-w-[calc(100%-2rem)] z-[3000] px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
      style={{ background: toast.type === 'success' ? VIZ.positive : VIZ.accent }} role="status">
      {toast.msg}
    </div>
  );
}

export const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white';
export const labelCls = 'block text-sm font-semibold text-gray-700 mb-1';
