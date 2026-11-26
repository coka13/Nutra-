# Fitura+ on Android and iPhone

## Advertising

Google AdMob native adaptive banners are integrated for ad-supported accounts on Home, Workouts and Exercise Library. Test ads are the default until the owner's platform-specific banner IDs and live mode are configured. UMP consent runs before SDK initialization. Expo Go skips ads; install a new native build to test them. See [AdMob setup and verification](ADMOB.md).

## Steps and aerobic activity

Open **Activity** in the personal tab bar or **More → Steps & aerobics** in the coach portal. Select a date, consent to saving fitness data to your account, then tap **Sync fitness data**. iPhone reads Apple Health step totals and completed aerobic workouts; Android reads the equivalent Health Connect data. The OS permission sheet requests read access to Steps and Workouts/Exercise Sessions only. There is no write access, GPS collection or background sync. Tap Sync again to refresh a total. A sync replaces the selected day's step total, and workout provider IDs prevent duplicates. The last 29 days can be selected for sync. Manual aerobic logging works without a health connection.

These native integrations require a newly installed build, **not Expo Go**. Use the existing EAS preview profile (`npx eas-cli build --profile preview --platform android` or `--platform ios`) after configuring the deployed backend origin. The HealthKit entitlement and usage description, Android read permissions and Health Connect permission delegate are configured through Expo plugins. iPhone signing must support HealthKit. Android needs an available Health Connect provider with step/workout data and a screen lock. Native permission prompts and real-device readings still require device validation; a JavaScript bundle check is not a native build.

Syncing is read-only from the health platform into Fitura+. The platform aggregate is used rather than summing raw phone/watch records. Partial permissions are supported. Apple Health intentionally does not distinguish denied read access from no readable samples; the app reports no data in that case. **Remove imported fitness data** deletes synced steps and workouts from Fitura+; OS access can be revoked separately in the health app. Imported data is included in the account JSON export and removed with account deletion.

This Expo SDK 58 hybrid app opens the Fitura+ workspace inside its own native window. The workspace uses the existing backend, with the same sign-in, onboarding, workout logging, diary, coaching and language settings. The native welcome screen offers separate User and Coach sign-in and registration. Each account opens its own native tab bar and dashboard. The rest timer is available only inside a workout; there are no timer shortcuts on the welcome screen, in the user profile, or under More for coaches. When a set is logged in a workout, the workspace saves the workout rest deadline to the database. The phone schedules a local rest-end alert with sound and Android channel vibration when notification permission is granted. Authentication stays in the first-party WebView’s persistent cookie store. The server checks the stored account role before opening a portal. Password reset email uses the backend’s Resend configuration. Navigation to an external HTTPS site opens the device browser.

## Try it on a phone

1. Run the backend using the repository README. The default development port is 3000.
2. In this `mobile` directory, run `npm ci`. For a physical iPhone, run `npx expo login` on the computer and finish signing in through the browser. Open Expo Go on the iPhone, tap the account icon, and sign in with the same Expo account. Start the preview with `npm start -- --go --lan` and keep both servers running.
3. Connect the phone to the same network as the computer. Use an SDK 58 compatible Expo Go client. Scan the terminal QR code using the camera on iPhone or the scanner in Expo Go on Android.
4. Sign in, register or choose **Explore the demo** on a development backend with sample accounts enabled. The rest timer is available only inside a workout.

If iPhone Camera shows “No usable data found,” open `http://<computer-LAN-IP>:3000/phone-preview` in Safari. This development page links to Expo Go in the App Store and opens the project using the same host on port 8081. For Camera, encode this HTTP page address in the QR code.

In LAN development the phone derives the backend address from the Expo host. For a separately hosted backend, set `EXPO_PUBLIC_NUTRI_URL` to its origin in `mobile/.env.local` and restart Expo. This value is public. Store service credentials on the backend. A phone must be able to reach both the Metro server and the backend. `localhost` on a physical phone refers to the phone itself.

## Standalone apps

For this computer's Wi-Fi test build, use the `preview-lan` EAS profile. It builds an installable APK with test ads and connects to `http://192.168.10.17:3000`. Start the backend with `npm run dev` from the repository root and keep the phone on the same Wi-Fi. If the computer's IPv4 address changes, update the URL in `eas.json` and rebuild. This profile explicitly permits HTTP to a private IPv4 address; normal preview and production builds still require HTTPS. Do not use real sensitive information over an untrusted network.

The app config defines the Android package and iOS bundle identifier as `com.nutriplus.workspace`. Confirm this identifier is available in the developer accounts before first distribution. Native projects are generated from Expo configuration. Use `npm run android` with a current Android SDK, compatible JDK and a device or emulator. Use `npm run ios` on macOS with Xcode. `npx expo prebuild --no-install` regenerates native project files on supported hosts.

For an installable preview, configure the actual deployed HTTPS Fitura+ origin as `EXPO_PUBLIC_NUTRI_URL` in the EAS **preview** environment. From this directory, use a linked EAS project and run `npx eas-cli build --profile preview --platform android` for an APK or `npx eas-cli build --profile preview --platform ios` for an ad hoc iPhone build. The latter needs an Apple signing team and a registered device. The **simulator** profile targets the iOS simulator. The **production** profile uses the production environment for store builds. The app requires the server for account features.

## Checks

The app uses a first-party WebView for the training and coaching workflows. Edited set values stay on the device if connectivity drops. Reconnect to submit them to the workout. The Clients dashboard checks assigned workout schedules and adds missed-workout notices to the coach’s in-app inbox. Expo Go requires the CLI and iPhone to use the same Expo account. App-store builds require a reachable HTTPS backend. Verify rest alerts with normal notification permissions on both platforms before distribution.

Run `npm run typecheck`, `npm run lint` and `npx expo export --platform android --platform ios`. The export produces Hermes code bundles. Device installation, background/foreground behavior and cookie retention across an OS restart need testing on physical phones. Check digital subscription flows against the intended storefront before distribution.
