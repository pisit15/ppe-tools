'use client';

import { useEffect, useState } from 'react';

/** Data-URL QR for a text, via the `qrcode` package already used by the permit module. */
export function useQr(text: string | null | undefined, width = 160) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!text) { setQr(''); return; }
    let live = true;
    import('qrcode')
      .then(q => q.toDataURL(text, { width, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1F2937', light: '#FFFFFF' } }))
      .then(v => { if (live) setQr(v); })
      .catch(() => { if (live) setQr(''); });
    return () => { live = false; };
  }, [text, width]);
  return qr;
}
