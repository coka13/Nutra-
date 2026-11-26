import type { Metadata } from 'next';
import './admin.css';

export const metadata: Metadata = {
  title: 'Fitura+ Admin',
  // Never indexed; the proxy also sends X-Robots-Tag and the admin host serves Disallow: /.
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
