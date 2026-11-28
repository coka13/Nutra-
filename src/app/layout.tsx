import type { Metadata, Viewport } from 'next';
import { DM_Sans, Heebo } from 'next/font/google';
import { cookies } from 'next/headers';
import { adsenseClient } from '@/lib/adsense';
import { languagePreferenceKey, parseLanguage } from '@/lib/language-preference';
import { a11yBootScript } from '@/lib/accessibility';
import { AccessibilityMenu } from '@/components/accessibility-menu';
import { CookieConsent } from '@/components/cookie-consent';
import './globals.css';
import './viewport-layout.css';
import './workout-builder.css';
import './design-system.css';
export const metadata: Metadata = {
  title: 'Fitura+ · A healthier rhythm',
  description: 'Your workouts, nutrition and progress. Beautifully connected.',
  manifest: '/manifest.webmanifest',
  // app/favicon.ico is picked up by file convention; this adds the crisp vector mark for
  // browsers that support SVG favicons, and the home-screen icon (app/apple-icon.png).
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // AdSense site ownership; verifies without loading any ad code.
  ...(adsenseClient() && {
    verification: { other: { 'google-adsense-account': adsenseClient()! } },
  }),
};
// Self-hosted variable fonts (every weight in one file), exposed as CSS variables for globals.css.
// Heebo is only the Hebrew face, so English pages don't preload it.
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-dm-sans' });
const heebo = Heebo({ subsets: ['hebrew', 'latin'], display: 'swap', variable: '--font-heebo', preload: false });
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#16715b' };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = parseLanguage((await cookies()).get(languagePreferenceKey)?.value) ?? 'en';
  return (
    <html
      lang={language}
      className={`${dmSans.variable} ${heebo.variable}`}
      dir={language === 'he' ? 'rtl' : 'ltr'}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* Saved accessibility settings, applied before first paint. It has already run when
            React hydrates, and third-party code (AdSense) may insert scripts beside it. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: a11yBootScript }} />
      </head>
      <body>
        {children}
        <AccessibilityMenu />
        <CookieConsent />
      </body>
    </html>
  );
}
