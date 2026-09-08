import { headers } from 'next/headers';
import { SuperAdminShell } from '@/components/superadmin/SuperAdminShell';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'EA SHE Admin Console',
  description: 'Super admin console for the EA SHE platform',
  robots: { index: false, follow: false },
};

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // On admin.eashe.org the middleware rewrites / -> /superadmin and sets this
  // header to '' so links stay rooted at the host. Reached directly (local dev)
  // the header is absent and links keep the /superadmin prefix.
  const requestHeaders = await headers();
  const base = requestHeaders.get('x-sa-base') ?? '/superadmin';

  return <SuperAdminShell base={base}>{children}</SuperAdminShell>;
}
