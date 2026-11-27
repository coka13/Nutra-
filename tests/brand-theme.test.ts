import assert from 'node:assert/strict';
import test from 'node:test';
import { brandTokens, contrast } from '../src/lib/brand-theme';

test('brand color becomes the accent, kept readable in both themes', () => {
  // A dark enough color is used as is.
  assert.equal(brandTokens('#1d4ed8', 'light')?.['--green'], '#1d4ed8');
  for (const color of ['#ffeb3b', '#ffffff', '#00ff00', '#000000', '#e11d48', '#16715b']) {
    const light = brandTokens(color, 'light')!;
    assert(contrast(light['--green'], '#ffffff') >= 4.5, `${color} light`);
    const dark = brandTokens(color, 'dark')!;
    assert(contrast(dark['--green'], '#1c2622') >= 4.5, `${color} dark`);
  }
  assert.equal(brandTokens('red', 'light'), null);
  assert.equal(brandTokens('', 'dark'), null);
});
