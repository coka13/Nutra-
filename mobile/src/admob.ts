import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type SDK = typeof import('react-native-google-mobile-ads');
let preparation: Promise<SDK | null> | undefined;
let initialization: Promise<unknown> | undefined;

export async function initializeAds(sdk: SDK) {
  const info = await sdk.AdsConsent.getConsentInfo();
  if (info.canRequestAds) {
    initialization ??= sdk.default().initialize();
    await initialization;
  }
  return info;
}

export function prepareAdMob() {
  if (
    process.env.EXPO_PUBLIC_ADMOB_MODE === 'off' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    !['ios', 'android'].includes(Platform.OS)
  )
    return Promise.resolve(null);

  preparation ??= (async () => {
    // Do not evaluate a native module in Expo Go: TurboModule lookup would throw.
    const sdk = await import('react-native-google-mobile-ads');
    await sdk.AdsConsent.gatherConsent();
    await initializeAds(sdk);
    return sdk;
  })().catch((error) => {
    if (__DEV__) console.warn('AdMob unavailable; continuing without ads.', error);
    return null;
  });
  return preparation;
}
