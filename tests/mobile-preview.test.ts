import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workspaceOrigin } from '../mobile/src/origin';
import { isPrivatePreviewOrigin } from '../mobile/local-preview';

test('standalone HTTP works only for explicit private-network previews', () => {
  const lan = 'http://192.168.10.17:3000';
  assert.equal(workspaceOrigin(lan, false, undefined, true), null);
  assert.equal(workspaceOrigin(lan, false, undefined, true, true), lan);
  for (const url of [
    'http://example.com',
    'http://8.8.8.8',
    'http://localhost:3000',
    'http://172.32.0.1',
    'http://192.168.1.1/app',
    'http://user:password@10.0.0.1',
  ])
    assert.equal(workspaceOrigin(url, false, undefined, true, true), null);
  for (const url of ['http://10.0.0.2:3000', 'http://172.16.0.1', 'http://172.31.255.254', lan])
    assert.equal(isPrivatePreviewOrigin(url), true);
  assert.equal(
    workspaceOrigin('https://nutri.example', false, undefined, true),
    'https://nutri.example',
  );
});
