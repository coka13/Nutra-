import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/lib/api-client';

test('API client handles proxy HTML, unsafe errors and offline requests without retrying writes', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response('<html>Unavailable</html>', { status: 502 });
    };
    await assert.rejects(api('meals/add', {}), { message: 'serverError' });
    assert.equal(calls, 1);
    globalThis.fetch = async () =>
      Response.json({ error: 'database connection string with private details' }, { status: 500 });
    await assert.rejects(api('state'), { message: 'serverError' });
    globalThis.fetch = async () => Response.json({ error: 'forbidden' }, { status: 403 });
    await assert.rejects(api('state'), { message: 'forbidden' });
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await assert.rejects(api('state'), { message: 'offline' });
    globalThis.fetch = async (_url, options) => {
      assert.equal(options?.credentials, 'same-origin');
      assert.equal(options?.keepalive, false);
      return Response.json({ ok: true });
    };
    assert.deepEqual(await api('progress/bodyweight', { images: [] }), { ok: true });
  } finally {
    globalThis.fetch = original;
  }
});
