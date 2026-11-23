import { cookies } from 'next/headers';
import { languagePreferenceKey, parseLanguage } from '@/lib/language-preference';
import { PublicPageClient } from './public-page-client';

export async function PublicPage(props: { mode: string; account?: 'user' | 'coach' }) {
  const initialLanguage = parseLanguage((await cookies()).get(languagePreferenceKey)?.value);
  return <PublicPageClient {...props} initialLanguage={initialLanguage} />;
}
