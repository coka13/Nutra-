import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { navigationPolicy, workspaceOrigin } from './origin';
import { updateWorkoutRest } from './rest-notification';
import { usePhone } from './settings';
import { SessionContext, type Session } from './session';
import { sessionScript } from './session-script';
import { PortalNavigation } from './portal-navigation';
import { readFitnessData } from './health-sync';
import { AdMobBanner } from './admob-banner';
import { mobileAdPlacement } from './admob-policy';

const origin = workspaceOrigin(
  process.env.EXPO_PUBLIC_NUTRI_URL,
  __DEV__,
  Constants.expoConfig?.hostUri,
  Platform.OS === 'android',
  process.env.EXPO_PUBLIC_NUTRI_LOCAL_PREVIEW === 'true',
);
const source = { uri: origin + '/phone-session' };
const allowedPages = new Set([
  'dashboard',
  'clients',
  'packages',
  'trainingLog',
  'clientPayments',
  'businessReports',
  'branding',
  'billing',
  'workouts',
  'nutrition',
  'mealPlans',
  'progress',
  'settings',
  'calendar',
  'messages',
  'templates',
  'activity',
  'library',
]);

export function WorkspaceHost({ children }: PropsWithChildren) {
  const ref = useRef<WebView<object>>(null);
  const nextRequest = useRef(0);
  const pending = useRef<{ id: number; settle: (error?: string) => void } | null>(null);
  const previous = useRef(false);
  const currentPath = useRef('/phone-session');
  const healthBusy = useRef(false);
  const [session, setSession] = useState<Session>(origin ? 'checking' : 'offline');
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [keyboard, setKeyboard] = useState(false);
  const [adsEligible, setAdsEligible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const path = usePathname();
  const navigation = useRootNavigationState();
  const { lang, colors, update } = usePhone();
  const inside = path === '/portal';
  const signedIn = session === 'coach' || session === 'user';
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && signedIn && ready) {
        ref.current?.injectJavaScript("window.dispatchEvent(new Event('nutri-resume'));true;");
      }
    });
    return () => subscription.remove();
  }, [signedIn, ready]);

  useEffect(() => {
    if (!navigation?.key) return;
    if (signedIn && !inside) router.replace('/portal');
    else if (session === 'signed-out' && inside) router.replace('/');
  }, [navigation?.key, signedIn, session, inside, path]);
  useEffect(() => {
    if (!inside) return;
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!previous.current || !ready) return false;
      ref.current?.goBack();
      return true;
    });
    return () => {
      show.remove();
      hide.remove();
      back.remove();
    };
  }, [inside, ready]);

  function fail() {
    pending.current?.settle('offline');
    setReady(false);
    setAdsEligible(false);
    setSession('offline');
  }

  function retry() {
    if (!origin) return;
    setReady(false);
    setAdsEligible(false);
    setSession('checking');
    setAttempt((value) => value + 1);
  }

  const context = useMemo(
    () => ({
      session,
      retry,
      authenticate: (
        account: 'user' | 'coach',
        mode: 'login' | 'register' | 'recover',
        values: {
          email: string;
          phone?: string;
          password?: string;
          name?: string;
          language: string;
          acceptTerms?: boolean;
        },
      ) =>
        new Promise<void>((resolve, reject) => {
          if (
            session !== 'signed-out' ||
            currentPath.current !== '/phone-session' ||
            !ref.current ||
            pending.current
          ) {
            reject(new Error('offline'));
            return;
          }
          const id = ++nextRequest.current;
          const settle = (error?: string) => {
            clearTimeout(timer);
            pending.current = null;
            if (error) reject(new Error(error));
            else resolve();
          };
          const timer = setTimeout(() => settle('offline'), 18000);
          pending.current = { id, settle };
          const request = JSON.stringify([
            id,
            mode === 'recover' ? mode : account + '/' + mode,
            values,
          ]).replace(/[\u2028\u2029]/g, (char) => (char === '\u2028' ? '\\u2028' : '\\u2029'));
          ref.current.injectJavaScript(
            `if(location.pathname==='/phone-session'&&typeof window.nutriAuth==='function') window.nutriAuth(...${request});true;`,
          );
        }),
    }),
    [session],
  );

  function visit(target: string) {
    if (!allowedPages.has(target)) return;
    const href = target === 'dashboard' ? '/app' : '/app/' + target;
    ref.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('nutri-portal-visit',{detail:${JSON.stringify(href)}}));true;`,
    );
  }

  return (
    <SessionContext.Provider value={context}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {children}
        {origin && (
          <View
            pointerEvents={inside ? 'auto' : 'none'}
            accessibilityElementsHidden={!inside}
            importantForAccessibility={inside ? 'auto' : 'no-hide-descendants'}
            style={
              inside
                ? [StyleSheet.absoluteFill, { backgroundColor: colors.background }]
                : styles.hidden
            }
          >
            <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
              <WebView<object>
                ref={ref}
                key={attempt}
                source={source}
                style={{ backgroundColor: colors.background }}
                originWhitelist={['*']}
                allowFileAccess={false}
                mixedContentMode="never"
                allowsInlineMediaPlayback
                allowsFullscreenVideo={false}
                allowsBackForwardNavigationGestures
                thirdPartyCookiesEnabled={false}
                javaScriptCanOpenWindowsAutomatically={false}
                onShouldStartLoadWithRequest={(request) => {
                  const policy = navigationPolicy(request.url, origin);
                  if (policy === 'external' && request.isTopFrame !== false)
                    void Linking.openURL(request.url).catch(() => {});
                  return policy === 'internal';
                }}
                onOpenWindow={(event) => {
                  const url = event.nativeEvent.targetUrl;
                  if (navigationPolicy(url, origin) === 'external')
                    void Linking.openURL(url).catch(() => {});
                }}
                onNavigationStateChange={(event) => {
                  if (navigationPolicy(event.url, origin) !== 'internal') return;
                  previous.current = event.canGoBack;
                  currentPath.current = new URL(event.url).pathname;
                }}
                injectedJavaScript={sessionScript}
                onMessage={(event) => {
                  if (navigationPolicy(event.nativeEvent.url, origin) !== 'internal') return;
                  try {
                    const message = JSON.parse(event.nativeEvent.data);
                    const sender = new URL(event.nativeEvent.url).pathname;
                    if (
                      message.type === 'page' &&
                      (sender === '/app' || sender.startsWith('/app/'))
                    ) {
                      currentPath.current = sender;
                      setReady(true);
                      setAdsEligible(message.adsEligible === true);
                      if (typeof message.page === 'string') setPage(message.page);
                      if (
                        (message.lang === 'en' || message.lang === 'he') &&
                        ['light', 'dark'].includes(message.theme)
                      )
                        update(message.lang, message.theme);
                    } else if (
                      message.type === 'health-sync' &&
                      sender === '/app/activity' &&
                      signedIn &&
                      !healthBusy.current
                    ) {
                      if (
                        typeof message.requestId !== 'string' ||
                        typeof message.userId !== 'string' ||
                        typeof message.date !== 'string'
                      )
                        return;
                      healthBusy.current = true;
                      const { requestId, userId, date } = message;
                      const deliver = (result: object) => {
                        if (currentPath.current !== '/app/activity') return;
                        const payload = JSON.stringify({ requestId, userId, ...result }).replace(
                          /[\u2028\u2029]/g,
                          (char) => (char === '\u2028' ? '\\u2028' : '\\u2029'),
                        );
                        ref.current?.injectJavaScript(
                          `if(location.pathname==='/app/activity') window.dispatchEvent(new CustomEvent('nutra-health-result',{detail:${payload}}));true;`,
                        );
                      };
                      void readFitnessData(date)
                        .then((snapshot) => deliver({ snapshot }))
                        .catch((error) => {
                          const known = [
                            'healthUnavailable',
                            'healthPermissionDenied',
                            'healthDevelopmentBuild',
                            'healthNoData',
                            'healthDateRange',
                          ];
                          deliver({
                            error:
                              error instanceof Error && known.includes(error.message)
                                ? error.message
                                : 'healthUnavailable',
                          });
                        })
                        .finally(() => {
                          healthBusy.current = false;
                        });
                    } else if (message.type === 'workout-rest' && sender.startsWith('/app')) {
                      updateWorkoutRest(message.deadline, message.lang);
                    } else if (sender === '/phone-session') {
                      if (
                        message.type === 'auth-result' &&
                        pending.current?.id === message.requestId
                      )
                        pending.current?.settle(message.error);
                      if (message.type === 'connection-error') fail();
                      if (message.type === 'session') {
                        currentPath.current = sender;
                        if (message.user) {
                          const { role, language, theme } = message.user;
                          if (language === 'he' || language === 'en')
                            update(language, theme === 'dark' ? 'dark' : 'light');
                          setSession(role === 'COACH' ? 'coach' : 'user');
                        } else {
                          setReady(false);
                          setAdsEligible(false);
                          setSession('signed-out');
                          updateWorkoutRest(null, lang);
                        }
                      }
                    }
                  } catch {}
                }}
                onError={fail}
                onHttpError={(event) => {
                  if (event.nativeEvent.statusCode >= 500) fail();
                }}
                onContentProcessDidTerminate={() => {
                  setReady(false);
                  ref.current?.reload();
                }}
                onRenderProcessGone={retry}
              />
              {inside && signedIn && ready && !keyboard && mobileAdPlacement(adsEligible, page) && (
                <AdMobBanner />
              )}
              {inside && (!ready || session === 'offline') && (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.status,
                    { backgroundColor: colors.background },
                  ]}
                >
                  {session === 'offline' ? (
                    <Pressable accessibilityRole="button" onPress={retry}>
                      <Text style={{ color: colors.accent }}>
                        {lang === 'he' ? 'ניסיון התחברות נוסף' : 'Retry connection'}
                      </Text>
                    </Pressable>
                  ) : (
                    <ActivityIndicator color={colors.accent} size="large" />
                  )}
                </View>
              )}
            </SafeAreaView>
            {inside && signedIn && !keyboard && (
              <PortalNavigation
                coach={session === 'coach'}
                page={page}
                ready={ready}
                open={visit}
              />
            )}
          </View>
        )}
      </View>
    </SessionContext.Provider>
  );
}
const styles = StyleSheet.create({
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' },
  status: { alignItems: 'center', justifyContent: 'center' },
});
