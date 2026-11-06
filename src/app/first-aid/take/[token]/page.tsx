import type { Metadata } from 'next';
import TakeClient from './TakeClient';

export const metadata: Metadata = {
  title: 'บันทึกการหยิบใช้ · First Aid',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default async function SelfServicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TakeClient token={token} />;
}
