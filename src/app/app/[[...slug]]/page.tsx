import { currentUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const user = await currentUser();
  if (!user) redirect('/auth');
  const section = (await params).slug?.[0];
  if (section && ['clients', 'branding', 'reports'].includes(section) && user.role !== 'COACH')
    redirect('/app');
  if (section === 'admin' && user.role !== 'ADMIN') redirect('/app');
  return null;
}
