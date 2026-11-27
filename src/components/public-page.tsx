import { cookies } from 'next/headers';
import { adsenseClient } from '@/lib/adsense';
import { languagePreferenceKey, parseLanguage } from '@/lib/language-preference';
import { PublicPageClient } from './public-page-client';

export async function PublicPage(props: { mode: string; account?: 'user' | 'coach' }) {
  const initialLanguage = parseLanguage((await cookies()).get(languagePreferenceKey)?.value);
  const adClient = adsenseClient();
  return (
    <>
      {/* AdSense loader (hoisted into <head>): site verification and Auto ads on public
          pages. Signed-in pages load it only for plans with ads (see AdSlot). */}
      {adClient && (
        <script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}`}
          crossOrigin="anonymous"
        />
      )}
      <PublicPageClient {...props} initialLanguage={initialLanguage} />
    </>
  );
}
