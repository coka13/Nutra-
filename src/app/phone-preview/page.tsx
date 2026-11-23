import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { PhonePreview } from './phone-preview';

export default async function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const request = await headers();
  const host = request.get('host') ?? '';
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) notFound();
  const preview = 'exp://' + new URL('http://' + host).hostname + ':8081';
  return <PhonePreview preview={preview} hebrew={/^he\b/i.test(request.get('accept-language') ?? '')} />;
}
