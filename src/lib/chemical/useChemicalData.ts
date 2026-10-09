'use client';
import { useEffect, useState } from 'react';
export function useChemicalData<T>(url: string, refresh = 0) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string; refresh: number }>({ url: '', refresh: -1 });
  useEffect(() => {
    const abort = new AbortController();
    fetch(url, { signal: abort.signal, cache: 'no-store' }).then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'โหลดข้อมูลไม่สำเร็จ');
      return d as T;
    }).then(data => { if (!abort.signal.aborted) setState({ url, data, refresh }); })
      .catch(e => { if (!abort.signal.aborted) setState({ url, error: e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ', refresh }); });
    return () => abort.abort();
  }, [url, refresh]);
  const current = state.url === url && state.refresh === refresh;
  return { data: current ? state.data : undefined, error: current ? state.error : undefined, loading: !current };
}
