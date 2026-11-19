'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { FA_GREEN, inputClass } from './fa';

/**
 * Text field with suggestions that always open as the complete list.
 * (A native datalist hides every choice that does not match the text already in the field, so a pre-filled
 * value looked like the only option until it was deleted.) Typing narrows the list; any typed text is accepted.
 */
export function ComboInput({ id, value, onChange, options, disabled = false, placeholder }: { id: string; value: string; onChange: (value: string) => void; options: string[]; disabled?: boolean; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false); // narrowing starts only once the user types after opening
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    // Inside a scrolling dialog the list could open below the visible part: bring it into view.
    list.current?.scrollIntoView({ block: 'nearest' });
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const shown = useMemo(() => { const q = value.trim().toLowerCase(); return typed && q ? options.filter(o => o.toLowerCase().includes(q)) : options; }, [options, typed, value]);
  const custom = typed && value.trim() !== '' && !options.some(o => o.toLowerCase() === value.trim().toLowerCase());
  const openAll = () => { if (disabled) return; setTyped(false); setActive(-1); setOpen(true); };
  const pick = (option: string) => { onChange(option); setOpen(false); setTyped(false); };
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openAll(); return; }
      if (shown.length) setActive(a => (e.key === 'ArrowDown' ? (a + 1) % shown.length : (a <= 0 ? shown.length : a) - 1));
    } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } // close the list, not the dialog around it
    else if (e.key === 'Tab') setOpen(false);
  }
  return (
    <div ref={box} className="relative">
      <input id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" autoComplete="off" className={`${inputClass} pr-9`} value={value} disabled={disabled} placeholder={placeholder}
        onFocus={e => { e.target.select(); openAll(); }} onClick={e => { if (!open) { e.currentTarget.select(); openAll(); } }}
        onChange={e => { onChange(e.target.value); setTyped(true); setActive(-1); setOpen(true); }} onKeyDown={onKeyDown} />
      <button type="button" tabIndex={-1} aria-label="แสดงตัวเลือกทั้งหมด" disabled={disabled} className="absolute inset-y-0 right-0 flex items-center px-2.5 text-gray-500 disabled:opacity-40"
        onMouseDown={e => { e.preventDefault(); if (open) setOpen(false); else openAll(); }}><ChevronDown size={16} /></button>
      {open && (shown.length > 0 || custom) && (
        <ul ref={list} id={listId} role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {shown.map((option, i) => { const current = option === value; return (
            <li key={option} role="option" aria-selected={current}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(option)} onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-gray-100' : ''} ${current ? 'font-semibold' : 'text-gray-800'}`} style={current ? { color: FA_GREEN } : undefined}>
                <span className="min-w-0 break-words">{option}</span>{current && <span aria-hidden="true">✓</span>}
              </button>
            </li>); })}
          {custom && <li className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">ใช้ “{value.trim()}” ที่พิมพ์เอง</li>}
        </ul>)}
    </div>
  );
}
