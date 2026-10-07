import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'EA SHE Mini App',
  description: 'ทางเข้าระบบ Incident และ PPE ของ EA SHE สำหรับใช้งานบนมือถือ',
};

// Mobile-first: fill the LINE in-app browser and respect notches/home bars.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
