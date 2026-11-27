import { cookies } from 'next/headers';
import { adsenseClient } from '@/lib/adsense';
import { languagePreferenceKey, parseLanguage } from '@/lib/language-preference';
import { cookieConsentKey, parseCookieChoice } from '@/lib/cookie-consent';
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
  // Legal pages load no third-party ad code before a visitor has read them.
  'privacy',
  'terms',
  'accessibility',
]);

export async function PublicPage(props: { mode: string; account?: 'user' | 'coach' }) {
  const jar = await cookies();
  const initialLanguage = parseLanguage(jar.get(languagePreferenceKey)?.value);
  const adClient = adFreeModes.has(props.mode) ? null : adsenseClient();
  // Personalized ads only after the visitor chose "Accept all" in the cookie banner.
  const personalized = parseCookieChoice(jar.get(cookieConsentKey)?.value) === 'all';
  return (
    <>
      {/* AdSense loader for Auto ads on the remaining public pages. Inline (not a hoisted
          async tag) so the non-personalized flag is always set before the library runs.
          Signed-in pages load it only for plans with ads (see AdSlot). adClient is validated. */}
      {adClient && (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var a=window.adsbygoogle=window.adsbygoogle||[];${personalized ? '' : 'a.requestNonPersonalizedAds=1;'}var s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.dataset.adsense='true';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adClient}';document.head.appendChild(s)})()`,
          }}
        />
      )}
      <PublicPageClient {...props} initialLanguage={initialLanguage} />
    </>
  );
}
