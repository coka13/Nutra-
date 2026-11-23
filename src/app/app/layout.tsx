import { Workspace } from '@/components/workspace';
import { currentUser } from '@/lib/auth';
import { catalogQuery, loadCatalog } from '@/lib/exercise-catalog';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/auth');
  const catalog = await loadCatalog(catalogQuery.parse({}));
  return (
    <>
      {children}
      <Workspace initialLanguage={user.language === 'he' ? 'he' : 'en'} initialCatalog={catalog} />
    </>
  );
}
