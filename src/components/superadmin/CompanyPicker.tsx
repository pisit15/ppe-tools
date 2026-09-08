'use client';

// Searchable company dropdown. The platform has ~20 companies and grows, so a
// native <select> is not usable — this follows the same pattern as the PPE pages.
import { useEffect, useMemo, useRef, useState } from 'react';
import { VIZ, inputClass } from './ui';

export type CompanyOption = { company_id: string; company_name: string };

export function CompanyPicker({
  companies,
  value,
  onChange,
  allowAll = false,
  placeholder = 'เลือกบริษัท',
}: {
  companies: CompanyOption[];
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const options = useMemo(() => {
    const base = allowAll
      ? [{ company_id: 'all', company_name: 'ทุกบริษัท' }, ...companies]
      : companies;
    const needle = term.trim().toLowerCase();
    if (!needle) return base;
    return base.filter(
      (c) =>
        c.company_id.toLowerCase().includes(needle) ||
        (c.company_name || '').toLowerCase().includes(needle)
    );
  }, [allowAll, companies, term]);

  const selected = useMemo(() => {
    if (value === 'all') return 'ทุกบริษัท';
    const found = companies.find((c) => c.company_id === value);
    return found ? `${found.company_name} (${found.company_id})` : value;
  }, [companies, value]);

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className={`${inputClass} text-left`}>
        {value ? selected : <span className="text-gray-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="พิมพ์เพื่อค้นหา..."
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {options.length === 0 && (
              <p className="px-3 py-2 text-sm" style={{ color: VIZ.lightText }}>
                ไม่พบบริษัท
              </p>
            )}
            {options.map((c) => (
              <button
                key={c.company_id}
                type="button"
                onClick={() => {
                  onChange(c.company_id);
                  setOpen(false);
                  setTerm('');
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
              >
                {c.company_name}
                {c.company_id !== 'all' && (
                  <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>
                    {c.company_id}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Generic searchable picker for people / license types, same interaction model.
export type PickerOption = { value: string; label: string; hint?: string };

export function SearchablePicker({
  options,
  value,
  onChange,
  placeholder = 'เลือก',
  emptyText = 'ไม่พบรายการ',
}: {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(needle) || (o.hint || '').toLowerCase().includes(needle)
    );
  }, [options, term]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className={`${inputClass} text-left`}>
        {selected ? (
          <>
            {selected.label}
            {selected.hint && (
              <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>
                {selected.hint}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 p-2">
            <input
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="พิมพ์เพื่อค้นหา..."
              className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm" style={{ color: VIZ.lightText }}>
                {emptyText}
              </p>
            )}
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setTerm('');
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
              >
                {option.label}
                {option.hint && (
                  <span className="ml-2 text-xs" style={{ color: VIZ.lightText }}>
                    {option.hint}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
