import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { adminHostAllowed, currentAdminForPage } from '@/lib/admin/auth';
import { AdminLogin } from '@/components/admin/auth-screens';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  const host = (await headers()).get('host');
  if (!adminHostAllowed(host)) notFound();
  if (await currentAdminForPage(host)) redirect('/admin');
  return <AdminLogin />;
}
