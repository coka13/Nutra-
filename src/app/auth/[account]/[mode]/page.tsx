import { PublicPage } from '@/components/public-page';
import { notFound } from 'next/navigation';

export default async function Page({
  params,
}: {
  params: Promise<{ account: string; mode: string }>;
}) {
  const { account, mode } = await params;
  if (
    (account !== 'user' && account !== 'coach') ||
    !['login', 'register', 'recover'].includes(mode)
  )
    notFound();
  return <PublicPage mode={mode} account={account} />;
}
