'use client';

// Shared primitives for the super admin console. The rest of the app declares
// VIZ per page; the console has seven pages that would otherwise repeat the
// same palette, toast and modal code, so it is extracted once here.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Search, X } from 'lucide-react';

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
};

export type ToastState = { type: 'success' | 'error'; msg: string } | null;

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  const success = useCallback((msg: string) => setToast({ type: 'success', msg }), []);
  const error = useCallback((msg: string) => setToast({ type: 'error', msg }), []);
  return { toast, setToast, success, error };
}

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  const isSuccess = toast.type === 'success';
  return (
    <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top-2">
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-lg"
        style={{ backgroundColor: isSuccess ? VIZ.positive : VIZ.accent }}
      >
        {isSuccess ? <Check size={16} /> : <AlertTriangle size={16} />}
        <span>{toast.msg}</span>
        <button onClick={onClose} className="opacity-80 hover:opacity-100" aria-label="ปิด">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-100 shadow-sm p-6 ${className}`}>
      {children}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  color = VIZ.primary,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  color?: string;
}) {
  return (
    <div
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <p className="text-xs font-medium" style={{ color: VIZ.lightText }}>
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color }}>
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: VIZ.lightText }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: VIZ.text }}>
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm" style={{ color: VIZ.lightText }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'ค้นหา...',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium" style={{ color: VIZ.text }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: VIZ.lightText }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export const inputClass =
  'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500';

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div ref={ref} className={`w-full ${width} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold" style={{ color: VIZ.text }}>
            {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: VIZ.primary, color: '#fff' },
    secondary: { backgroundColor: '#fff', color: VIZ.text, border: `1px solid ${VIZ.muted}` },
    danger: { backgroundColor: VIZ.accent, color: '#fff' },
    ghost: { backgroundColor: 'transparent', color: VIZ.lightText },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={styles[variant]}
      className={`rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {children}
    </span>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm" style={{ color: VIZ.text }}>
        {message}
      </p>
    </Modal>
  );
}

export function Spinner({ label = 'กำลังโหลด...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm" style={{ color: VIZ.lightText }}>
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
      {label}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-14 text-center text-sm" style={{ color: VIZ.lightText }}>
      {message}
    </div>
  );
}

// Every console request goes through here so the session cookie is always
// sent and a 401 lands the user back on the login screen instead of a blank page.
export async function saFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });

  if (response.status === 401) {
    if (typeof window !== 'undefined') {
      const base = window.location.pathname.startsWith('/superadmin') ? '/superadmin' : '';
      window.location.href = `${base}/login`;
    }
    throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || 'เกิดข้อผิดพลาด');
  }
  return payload as T;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
