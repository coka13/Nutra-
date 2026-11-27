import { cookies } from 'next/headers';
import { adsenseClient } from '@/lib/adsense';
import { languagePreferenceKey, parseLanguage } from '@/lib/language-preference';
import { PublicPageClient } from './public-page-client';

// Home and the sign-in/sign-up flow stay ad-free; AdSense verifies the site through the
// google-adsense-account meta tag in the root layout instead.
const adFreeModes = new Set([
  'home',
  'login',
  'coach-login',
  'register',
  'recover',
  'reset',
  'verify-email',
]);

export async function PublicPage(props: { mode: string; account?: 'user' | 'coach' }) {
  const initialLanguage = parseLanguage((await cookies()).get(languagePreferenceKey)?.value);
  const adClient = adFreeModes.has(props.mode) ? null : adsenseClient();
  return (
    <>
      {/* AdSense loader (hoisted into <head>) for Auto ads on the remaining public pages.
          Signed-in pages load it only for plans with ads (see AdSlot). */}
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
