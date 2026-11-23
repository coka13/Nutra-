import { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { BannerAd, AdsConsentInfo } from 'react-native-google-mobile-ads';
import { prepareAdMob, initializeAds } from './admob';
import { bannerUnitId } from './admob-policy';
import { usePhone } from './settings';

const requestOptions = { requestNonPersonalizedAdsOnly: true };
type SDK = typeof import('react-native-google-mobile-ads');

export function AdMobBanner() {
  const { lang, colors } = usePhone();
  const { width } = useWindowDimensions();
  const banner = useRef<BannerAd>(null);
  const [sdk, setSdk] = useState<SDK | null>(null);
  const [consent, setConsent] = useState<AdsConsentInfo | null>(null);
  const [changing, setChanging] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false;
    void prepareAdMob()
      .then(async (loaded) => {
        if (!loaded || disposed) return;
        const info = await loaded.AdsConsent.getConsentInfo();
        if (!disposed) {
          setSdk(loaded);
          setConsent(info);
        }
      })
      .catch(() => {});
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Platform.OS === 'ios') banner.current?.load();
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, []);

  if (!sdk || !consent) return null;
  const unitId = bannerUnitId(
    process.env.EXPO_PUBLIC_ADMOB_MODE,
    __DEV__,
    Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID
      : process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
    sdk.TestIds.ADAPTIVE_BANNER,
  );
  const privacyRequired =
    consent.privacyOptionsRequirementStatus ===
    sdk.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED;
  const showBanner = !!unitId && consent.canRequestAds && !changing && !failed;
  if (!showBanner && !privacyRequired) return null;
  const Banner = sdk.BannerAd;
  async function changePrivacy() {
    if (!sdk) return;
    setChanging(true);
    setError(false);
    try {
      await sdk.AdsConsent.showPrivacyOptionsForm();
      setConsent(await initializeAds(sdk));
      setFailed(false);
    } catch {
      setError(true);
      // Never reuse a stale permission after a failed change.
      setConsent(await sdk.AdsConsent.getConsentInfo().catch(() => null));
    } finally {
      setChanging(false);
    }
  }
  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      {showBanner && (
        <>
          <Text style={[styles.label, { color: colors.muted }]}>
            {lang === 'he' ? 'פרסומת' : 'Advertisement'}
          </Text>
          <Banner
            ref={banner}
            key={width}
            unitId={unitId!}
            width={width}
            size={sdk.BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
            requestOptions={requestOptions}
            onAdFailedToLoad={() => setFailed(true)}
          />
        </>
      )}
      {privacyRequired && (
        <Pressable
          accessibilityRole="button"
          disabled={changing}
          onPress={() => void changePrivacy()}
          style={styles.privacy}
        >
          <Text style={{ color: colors.accent }}>
            {lang === 'he' ? 'העדפות פרטיות לפרסומות' : 'Ad privacy choices'}
          </Text>
        </Pressable>
      )}
      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.ink }}>
          {lang === 'he' ? 'לא ניתן לעדכן כעת. נסו שוב.' : 'Unable to update. Please try again.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingTop: 12, paddingBottom: 16 },
  label: { fontSize: 10, marginBottom: 4 },
  privacy: { padding: 12, minHeight: 44, justifyContent: 'center' },
});
