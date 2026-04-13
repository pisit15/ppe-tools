import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PPE Inventory System - tools.eashe.org',
  description: 'Personal Protective Equipment Inventory Management System',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
