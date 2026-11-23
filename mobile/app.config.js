const { isPrivatePreviewOrigin } = require('./local-preview');

module.exports = ({ config }) => {
  const url = process.env.EXPO_PUBLIC_NUTRI_URL;
  const localPreview = process.env.EXPO_PUBLIC_NUTRI_LOCAL_PREVIEW === 'true';
  if (
    localPreview &&
    (!isPrivatePreviewOrigin(url) ||
      (process.env.EAS_BUILD_PROFILE && process.env.EAS_BUILD_PROFILE !== 'preview-lan'))
  )
    throw new Error(
      'Local preview requires a private HTTP IPv4 origin and the preview-lan build profile.',
    );
  if (process.env.EAS_BUILD === 'true' && !localPreview && (!url || !/^https:\/\//.test(url)))
    throw new Error(
      'Set EXPO_PUBLIC_NUTRI_URL to the deployed HTTPS Nutra+ origin in the EAS build environment.',
    );
  const mode = process.env.EXPO_PUBLIC_ADMOB_MODE || 'test';
  if (!['off', 'test', 'live'].includes(mode)) throw new Error('Invalid EXPO_PUBLIC_ADMOB_MODE.');
  const iosAppId = process.env.ADMOB_IOS_APP_ID || 'ca-app-pub-3933096627211440~5867449397';
  const androidAppId = process.env.ADMOB_ANDROID_APP_ID || 'ca-app-pub-3940256099942544~3347511713';
  for (const id of [iosAppId, androidAppId]) {
    if (!/^ca-app-pub-\d{16}~\d{10}$/.test(id))
      throw new Error('Invalid AdMob App ID (expected ~).');
  }
  if (mode === 'live') {
    const platform = process.env.EAS_BUILD_PLATFORM;
    for (const target of platform ? [platform] : ['ios', 'android']) {
      const appId = target === 'ios' ? iosAppId : androidAppId;
      const bannerId =
        target === 'ios'
          ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID
          : process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID;
      if (
        appId.includes('3940256099942544') ||
        !/^ca-app-pub-\d{16}\/\d{10}$/.test(bannerId || '') ||
        bannerId.includes('3940256099942544')
      )
        throw new Error(
          `Configure real AdMob App and Banner IDs for ${target} before enabling live ads.`,
        );
    }
  }
  return {
    ...config,
    plugins: [
      ...(config.plugins || []).map((plugin) => {
        if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
          const options = plugin[1] || {};
          return [
            plugin[0],
            { ...options, android: { ...options.android, usesCleartextTraffic: localPreview } },
          ];
        }
        return plugin;
      }),
      [
        'react-native-google-mobile-ads',
        {
          iosAppId,
          androidAppId,
          delayAppMeasurementInit: true,
          skAdNetworkItems: ['cstr6suwn9.skadnetwork'],
          userTrackingUsageDescription:
            'Your permission allows our advertising provider to measure ads. Fitness and nutrition records are not shared for advertising.',
        },
      ],
    ],
  };
};
