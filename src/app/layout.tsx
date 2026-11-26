import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { languagePreferenceKey, parseLanguage } from '@/lib/language-preference';
import './globals.css';
import './viewport-layout.css';
export const metadata: Metadata = {
  title: 'Fitura+ · A healthier rhythm',
  description: 'Your workouts, nutrition and coaching. Beautifully connected.',
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#16715b' };
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = parseLanguage((await cookies()).get(languagePreferenceKey)?.value) ?? 'en';
  return (
    <html
      lang={language}
      dir={language === 'he' ? 'rtl' : 'ltr'}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
