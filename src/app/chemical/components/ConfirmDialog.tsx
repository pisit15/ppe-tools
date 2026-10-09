'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function ConfirmDialog({children, onCancel}: {children: ReactNode; onCancel: () => void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} aria-labelledby="confirm-title" onCancel={onCancel} className="m-auto max-w-sm w-[calc(100%-2rem)] rounded-2xl p-6 shadow-2xl backdrop:bg-black/40">{children}</dialog>;
}
