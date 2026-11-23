# AdMob in the phone app

The iOS App ID is `ca-app-pub-3933096627211440~5867449397`, supplied by the owner.
Android currently uses Google's sample App ID until a separate Android app is created.
An **App ID contains `~`**; a **banner ad unit ID contains `/`**. These IDs are public.

## Test before publishing

No App Store listing is needed to prepare and test AdMob. In [AdMob](https://admob.google.com/),
choose **Apps → Add app → iOS/Android → not listed in a supported app store**.
Use separate apps for iOS and Android.

The default `EXPO_PUBLIC_ADMOB_MODE=test` uses Google's official adaptive banner
test units, including in preview binaries. Development bundles always use test
units even if the mode is `live`. `off` disables loading the advertising module.
Tests do not produce advertising revenue.

This library requires a new native app build; **Expo Go cannot display these ads**.
Expo Go skips the SDK safely. Use the existing EAS preview profile for an installed
Android APK or signed iPhone preview, or the simulator profile on a Mac. This
change has not built or signed an iPhone binary. Physical iPhone distribution
through EAS still requires Apple signing; this integration does not bypass it.

## Connect real banner units

1. In your AdMob app, **App settings → App ID** shows the application identifier.
2. Open **Ad units → Add ad unit → Banner**, create it, and copy its unit ID.
3. Add these public build settings to your EAS environment (or `.env.local` for
   local native builds), replacing placeholders with the actual values:

   ```dotenv
   ADMOB_IOS_APP_ID=ca-app-pub-3933096627211440~5867449397
   EXPO_PUBLIC_ADMOB_IOS_BANNER_ID=ca-app-pub-YOUR_PUBLISHER/YOUR_UNIT
   # Configure separate Android values when building Android with live ads:
   # ADMOB_ANDROID_APP_ID=ca-app-pub-YOUR_PUBLISHER~YOUR_ANDROID_APP
   # EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID=ca-app-pub-YOUR_PUBLISHER/YOUR_ANDROID_UNIT
   EXPO_PUBLIC_ADMOB_MODE=test
   ```

4. Configure your app's **Privacy & messaging** in AdMob, including applicable
   European consent and iOS ATT messaging. The app calls Google's UMP consent flow
   before initializing ads, and shows a privacy-choices button when UMP requires
   it. Consent or native module failures leave the app usable without ads.
5. Before production, publish the app's privacy policy, complete store privacy/data
   disclosures for Google Mobile Ads, and configure app-ads.txt on the developer
   website associated with the store listing. Keep the SKAdNetwork list current
   for your ad partners; the config includes Google's identifier only.
6. Set `EXPO_PUBLIC_ADMOB_MODE=live` when ready and create a new native build.
   Live configuration rejects missing/malformed unit IDs and sample App IDs for
   the EAS target platform. For local config evaluation with no target platform,
   configure both platforms or set `EAS_BUILD_PLATFORM` to the intended target.
   Full ad serving requires Google's app verification/readiness approval and a
   supported store listing. Setting IDs does not guarantee approval or ad fill.

## Placement and data

Native adaptive banners appear below the WebView on Home, Workouts and Exercise
Library, only when the backend's existing entitlement says the user has ads.
Plus, paid coaches and admins remain excluded. Banners hide on other pages, during
active workouts, when the keyboard is open, while offline/loading and after logout.
They occupy layout space rather than covering workout controls or the tab bar.

The bridge sends only the ad entitlement boolean alongside its existing navigation,
language and theme information. Workout records, HealthKit/Health Connect data,
food logs, body measurements, email and account identifiers are not passed to the
advertising SDK. Requests explicitly ask for non-personalized ads; this does not
remove consent requirements or the SDK's own technical data collection.

## Verification

Run mobile typecheck/lint and export both platforms. On a new device build, verify
the **Test Ad** label, consent/denial and privacy changes, paid-plan suppression,
logout, page switching, offline behavior and banner layout on small screens.
Native installation, consent presentation and real ad delivery still need device
testing; a JavaScript export alone cannot validate them.

References: [IDs](https://support.google.com/admob/answer/7356431),
[unpublished apps](https://support.google.com/admob/answer/9989980),
[Expo installation](https://docs.page/invertase/react-native-google-mobile-ads/installation/expo),
[consent](https://docs.page/invertase/react-native-google-mobile-ads/european-user-consent).
