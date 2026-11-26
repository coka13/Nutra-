import { Suspense } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { adminHostAllowed, currentAdminForPage, publicAdmin } from '@/lib/admin/auth';
import { AdminConsole } from '@/components/admin/console';
import type { Me } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

/** Server-side gate: no console markup is sent without a valid administrator session. */
export default async function AdminPage() {
  const host = (await headers()).get('host');
  if (!adminHostAllowed(host)) notFound();
  const context = await currentAdminForPage(host);
  if (!context) redirect('/admin/login');
  const me = JSON.parse(JSON.stringify(publicAdmin(context.admin, context.session))) as Me;
  return (
    <Suspense>
      <AdminConsole initialMe={me} />
    </Suspense>
  );
}
