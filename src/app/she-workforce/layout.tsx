import PPELayout from '@/components/PPELayout';

export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PPELayout>{children}</PPELayout>;
}
