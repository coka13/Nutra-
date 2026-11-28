import { PublicPage } from '@/components/public-page';
import { currentUser } from '@/lib/auth';
import { safeNext } from '@/lib/safe-next';
import { notFound, redirect } from 'next/navigation';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ account: string; mode: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { account, mode } = await params;
  if (
    (account !== 'user' && account !== 'coach') ||
    !['login', 'register', 'recover'].includes(mode)
  )
    notFound();
  // Already signed in (e.g. "Upgrade" on the pricing card): skip the form.
  const raw = (await searchParams).next;
  const next = safeNext(Array.isArray(raw) ? raw[0] : raw);
  if (next && mode !== 'recover' && (await currentUser())) redirect(next);
  return <PublicPage mode={mode} account={account} />;
}
