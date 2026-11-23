import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { bannerUnitId, mobileAdPlacement } from '../mobile/src/admob-policy';
import { sessionScript } from '../mobile/src/session-script';

test('native config uses the owner iOS ID and rejects live builds without real platform IDs', () => {
  const configure = createRequire(import.meta.url)('../mobile/app.config.js');
  const keys = [
    'EXPO_PUBLIC_ADMOB_MODE',
    'EAS_BUILD_PLATFORM',
    'ADMOB_IOS_APP_ID',
    'ADMOB_ANDROID_APP_ID',
    'EXPO_PUBLIC_ADMOB_IOS_BANNER_ID',
    'EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID',
  ];
  const saved = keys.map((key) => process.env[key]);
  try {
    keys.forEach((key) => delete process.env[key]);
    const base = { config: { plugins: ['expo-router'] } };
    const plugin = configure(base).plugins.at(-1);
    assert.equal(plugin[1].iosAppId, 'ca-app-pub-3933096627211440~5867449397');
    assert.equal(plugin[1].delayAppMeasurementInit, true);
    process.env.EXPO_PUBLIC_ADMOB_MODE = 'live';
    process.env.EAS_BUILD_PLATFORM = 'ios';
    assert.throws(() => configure(base), /real AdMob/);
    process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID = 'ca-app-pub-3933096627211440/1234567890';
    assert.doesNotThrow(() => configure(base));
    process.env.EAS_BUILD_PLATFORM = 'android';
    assert.throws(() => configure(base), /real AdMob/);
  } finally {
    keys.forEach((key, i) =>
      saved[i] === undefined ? delete process.env[key] : (process.env[key] = saved[i]),
    );
  }
});

test('mobile ads require a free-plan flag and an allowed content screen', () => {
  for (const page of ['dashboard', 'workouts', 'library']) {
    assert.equal(mobileAdPlacement(true, page), true);
    assert.equal(mobileAdPlacement(false, page), false);
  }
  for (const page of [
    'active',
    'nutrition',
    'progress',
    'activity',
    'settings',
    'onboarding',
    'messages',
    'billing',
    'unknown',
  ])
    assert.equal(mobileAdPlacement(true, page), false);
});

test('development and preview ads use test units; live mode requires a unit ID', () => {
  const realId = 'ca-app-pub-3933096627211440/1234567890';
  assert.equal(bannerUnitId(undefined, false, realId, 'test'), 'test');
  assert.equal(bannerUnitId('test', false, realId, 'test'), 'test');
  assert.equal(bannerUnitId('live', true, realId, 'test'), 'test');
  assert.equal(bannerUnitId('off', true, realId, 'test'), null);
  assert.equal(bannerUnitId('live', false, realId, 'test'), realId);
  assert.equal(bannerUnitId('live', false, undefined, 'test'), null);
  assert.equal(bannerUnitId('live', false, realId.replace('/', '~'), 'test'), null);
  assert.equal(bannerUnitId('invalid', false, realId, 'test'), null);
});

test('native bridge starts without ad permission, propagates entitlement changes and sends no account data', () => {
  const sent: Record<string, unknown>[] = [];
  const dataset: Record<string, string> = { portalPage: 'library', theme: 'light' };
  let publish: () => void = () => {};
  let observed: string[] = [];
  vm.runInNewContext(sessionScript, {
    document: { documentElement: { dataset, lang: 'he' } },
    location: { pathname: '/app/library' },
    window: { ReactNativeWebView: { postMessage: (json: string) => sent.push(JSON.parse(json)) } },
    MutationObserver: class {
      constructor(callback: () => void) {
        publish = callback;
      }
      observe(_root: unknown, options: { attributeFilter: string[] }) {
        observed = options.attributeFilter;
      }
    },
  });
  assert.equal(sent[0].adsEligible, false);
  assert.ok(observed.includes('data-native-ads-eligible'));
  dataset.nativeAdsEligible = 'true';
  publish();
  assert.equal(sent.at(-1)?.adsEligible, true);
  dataset.nativeAdsEligible = 'false';
  publish();
  assert.equal(sent.at(-1)?.adsEligible, false);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['adsEligible', 'lang', 'page', 'theme', 'type']);
});
