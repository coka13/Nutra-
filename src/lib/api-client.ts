import { messages } from './i18n';

/** No automatic write retries: a lost response can follow a successful write. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    /(?:^|\/)ai(?:\/|$)/.test(path) ? 130000 : 30000,
  );
  try {
    const response = await fetch(`/api/${path}`, {
      signal: controller.signal,
      credentials: 'same-origin',
      ...(body === undefined
        ? { cache: 'no-store' as const }
        : {
            method: 'POST',
            keepalive: ![
              'progress/photos',
              'progress/bodyweight',
              'branding/logo',
              'branding/background',
              'ai/photo',
            ].includes(path),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    const data = await response.json().catch(() => {
      throw new Error('serverError');
    });
    if (!response.ok) {
      const key =
        typeof data?.error === 'string' && Object.hasOwn(messages, data.error)
          ? data.error
          : 'serverError';
      throw new Error(key);
    }
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('requestTimeout');
    if (error instanceof TypeError) throw new Error('offline');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
