import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminHostAllowed } from '@/lib/admin/auth';
import { AdminSetup } from '@/components/admin/auth-screens';

export const dynamic = 'force-dynamic';

export default async function AdminSetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  if (!adminHostAllowed((await headers()).get('host'))) notFound();
  const { token } = await searchParams;
  return <AdminSetup token={typeof token === 'string' && /^[0-9a-f]{64}$/.test(token) ? token : ''} />;
}
