'use client';

import { useEffect, useState } from 'react';
import type { HomeCard } from '@/lib/home-cards';

export function useHomeCards(admin = false) {
  const [cards, setCards] = useState<HomeCard[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(admin ? '/api/admin/home-cards' : '/api/home-cards', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json();
        if (!response.ok || !Array.isArray(result.data)) throw new Error(result.error || 'โหลดรายการเครื่องมือไม่สำเร็จ');
        if (!controller.signal.aborted) setCards(result.data);
      }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'โหลดรายการเครื่องมือไม่สำเร็จ'); });
    return () => controller.abort();
  }, [admin, attempt]);
  const reload = () => { setCards(null); setError(''); setAttempt(value => value + 1); };
  const saved = (card: HomeCard) => setCards(previous => previous?.map(item => item.id === card.id ? card : item) || null);
  return { cards, error, reload, saved };
}
