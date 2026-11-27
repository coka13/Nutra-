import type { Metadata, Viewport } from 'next';
import { DM_Sans, Heebo } from 'next/font/google';
import { cookies } from 'next/headers';
import { adsenseClient } from '@/lib/adsense';
import { languagePreferenceKey, parseLanguage } from '@/lib/language-preference';
import './globals.css';
import './viewport-layout.css';
import './workout-builder.css';
export const metadata: Metadata = {
  title: 'Fitura+ · A healthier rhythm',
  description: 'Your workouts, nutrition and progress. Beautifully connected.',
  manifest: '/manifest.webmanifest',
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
      <body>{children}</body>
    </html>
  );
}
