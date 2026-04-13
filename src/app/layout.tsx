import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = {
  title: 'EA SHE Tools - tools.eashe.org',
  description: 'Safety & Environment Tools Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
