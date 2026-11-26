import { PublicPage } from '@/components/public-page';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  if (
    ![
      'login',
      'coach-login',
      'register',
      'recover',
      'reset',
      'verify-email',
      'features',
      'pricing',
      'terms',
    ].includes(page)
  )
    notFound();
  return <PublicPage mode={page} />;
}
