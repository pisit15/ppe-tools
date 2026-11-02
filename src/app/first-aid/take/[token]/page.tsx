import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'บันทึกการหยิบใช้ · First Aid',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function SelfServicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main style={{ height: '100dvh', background: '#f6f8f6' }}>
    <iframe src={`/first-aid/index.html?public_token=${encodeURIComponent(token)}`} title="บันทึกการหยิบใช้ยาและเวชภัณฑ์" style={{ display: 'block', width: '100%', height: '100dvh', border: 0 }} referrerPolicy="no-referrer" />
  </main>;
}
