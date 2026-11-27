import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePhone } from './settings';
import { useSession, type Account, type AuthMode } from './session';
import { workspaceOrigin } from './origin';
import type { PropsWithChildren } from 'react';

function Frame({ children }: PropsWithChildren) {
  const { colors, lang } = usePhone();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={[styles.content, { direction: lang === 'he' ? 'rtl' : 'ltr' }]}>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const appName = Constants.expoConfig?.name ?? 'Fitura+';
const webOrigin = workspaceOrigin(
  process.env.EXPO_PUBLIC_NUTRI_URL,
  __DEV__,
  Constants.expoConfig?.hostUri,
  Platform.OS === 'android',
  process.env.EXPO_PUBLIC_NUTRI_LOCAL_PREVIEW === 'true',
);

export function WelcomeScreen() {
  const { lang, colors, darkMode, update, t } = usePhone();
  const { session, retry } = useSession();
  const he = lang === 'he';
  if (session === 'checking' || session === 'coach' || session === 'user')
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  return (
    <Frame>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={he ? 'Switch to English' : 'מעבר לעברית'}
        style={[styles.link, { alignSelf: 'flex-end' }]}
        onPress={() => update(he ? 'en' : 'he', darkMode ? 'dark' : 'light')}
      >
        <Text style={{ color: colors.accent }}>{he ? 'English' : 'עברית'}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[styles.brand, { color: colors.ink }]}>
        {appName.replace(/\+$/, '')}
        <Text style={{ color: colors.accent }}>+</Text>
      </Text>
      <Image source={require('../assets/welcome.webp')} resizeMode="contain" style={styles.art} />
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        {t('choosePortal').replace('{app}', appName)}
      </Text>
      {(['user', 'coach'] as const).map((account) => (
        <Pressable
          key={account}
          accessibilityRole="button"
          testID={`choose-${account}`}
          style={({ pressed }) => [
            styles.choice,
            {
              backgroundColor: account === 'coach' ? colors.surface : colors.accent,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          onPress={() => router.push(`/auth/${account}/login`)}
        >
          <Ionicons
            name={account === 'coach' ? 'people-outline' : 'barbell-outline'}
            size={26}
            color={account === 'coach' ? colors.accent : colors.buttonText}
          />
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              style={{
                fontSize: 19,
                fontWeight: '700',
                color: account === 'coach' ? colors.ink : colors.buttonText,
              }}
            >
              {t(account + 'Choice')}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: account === 'coach' ? colors.muted : colors.buttonText,
              }}
            >
              {t(account + 'ChoiceHint')}
            </Text>
          </View>
          <Ionicons
            name={he ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={account === 'coach' ? colors.accent : colors.buttonText}
          />
        </Pressable>
      ))}
      {session === 'offline' && (
        <Pressable accessibilityRole="button" style={styles.link} onPress={retry}>
          <Text style={{ color: colors.accent }}>{t('offline')}</Text>
        </Pressable>
      )}
    </Frame>
  );
}

export function AuthScreen({ account, mode }: { account: Account; mode: AuthMode }) {
  const { lang, colors, t } = usePhone();
  const { session, retry, authenticate } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [healthConsent, setHealthConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const he = lang === 'he';
  const isCoach = account === 'coach';
  const registration = mode === 'register';
  const recovery = mode === 'recover';
  const login = mode === 'login';
  const heading = t(recovery ? 'reset' : account + (registration ? 'RegisterTitle' : 'LoginTitle'));
  const fields = {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    textAlign: he ? ('right' as const) : ('left' as const),
  };

  async function submit() {
    if (busy || submitting.current) return;
    submitting.current = true;
    if (
      !email.trim() ||
      (registration &&
        isCoach &&
        !/^\+[1-9]\d{7,14}$/.test(
          phone
            .trim()
            .replace(/[\s().-]/g, '')
            .replace(/^00/, '+'),
        )) ||
      (registration && (!name.trim() || password.length < 10)) ||
      (login && !password)
    ) {
      setError('invalid');
      submitting.current = false;
      return;
    }
    if (registration && (!acceptTerms || (!isCoach && !healthConsent))) {
      setError(acceptTerms ? 'healthConsentRequired' : 'termsRequired');
      submitting.current = false;
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authenticate(account, mode, {
        email: email.trim(),
        language: lang,
        ...(!recovery && { password }),
        ...(registration && { name: name.trim() }),
        ...(registration && isCoach && { phone: phone.trim() }),
        ...(registration && { acceptTerms, healthConsent: !isCoach && healthConsent }),
      });
      setPassword('');
      if (recovery) setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'serverError');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const go = (to: AuthMode) => router.push(`/auth/${account}/${to}`);
  return (
    <Frame>
      <Pressable
        accessibilityRole="button"
        style={styles.link}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      >
        <Text style={{ color: colors.accent }}>{t('backButton')}</Text>
      </Pressable>
      <View style={[styles.authMark, { backgroundColor: colors.surface }]}>
        <Ionicons
          name={isCoach ? 'people-outline' : 'barbell-outline'}
          size={30}
          color={colors.accent}
        />
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        {heading}
      </Text>
      {sent ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.ink }}>
          {t('resetSent')}
        </Text>
      ) : (
        <>
          {registration && (
            <>
              <Text style={{ color: colors.ink }}>{t('fullName')}</Text>
              <TextInput
                testID="name"
                accessibilityLabel={t('fullName')}
                style={[styles.field, fields]}
                value={name}
                onChangeText={setName}
                autoComplete="name"
                maxLength={200}
              />
            </>
          )}
          <Text style={{ color: colors.ink }}>{t('email')}</Text>
          <TextInput
            testID="email"
            accessibilityLabel={t('email')}
            style={[styles.field, fields, { textAlign: 'left', writingDirection: 'ltr' }]}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            maxLength={200}
          />
          {registration && isCoach && (
            <>
              <Text style={{ color: colors.ink }}>{t('phone')}</Text>
              <TextInput
                testID="phone"
                accessibilityLabel={t('phone')}
                style={[styles.field, fields, { textAlign: 'left', writingDirection: 'ltr' }]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={40}
                placeholder="+972501234567"
                placeholderTextColor={colors.muted}
              />
              <Text style={{ color: colors.muted }}>{t('coachContactHint')}</Text>
            </>
          )}
          {!recovery && (
            <>
              <Text style={{ color: colors.ink }}>{t('password')}</Text>
              <TextInput
                testID="password"
                accessibilityLabel={t('password')}
                style={[styles.field, fields]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoComplete={registration ? 'new-password' : 'current-password'}
                maxLength={128}
                onSubmitEditing={() => {
                  if (!busy && session === 'signed-out') void submit();
                }}
              />
              {registration && <Text style={{ color: colors.muted }}>{t('passwordHint')}</Text>}
            </>
          )}
          {registration && (
            <View style={[styles.consent, { flexDirection: he ? 'row-reverse' : 'row' }]}>
              <Pressable
                testID="accept-terms"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptTerms }}
                accessibilityLabel={
                  t('termsConsentBefore') +
                  t('termsOfUse') +
                  t('termsConsentMiddle') +
                  t('privacyPolicy')
                }
                hitSlop={8}
                onPress={() => setAcceptTerms((value) => !value)}
              >
                <Ionicons
                  name={acceptTerms ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={acceptTerms ? colors.accent : colors.muted}
                />
              </Pressable>
              <Text
                style={{
                  flex: 1,
                  color: colors.ink,
                  lineHeight: 21,
                  textAlign: he ? 'right' : 'left',
                }}
                onPress={() => setAcceptTerms((value) => !value)}
              >
                {t('termsConsentBefore')}
                <Text
                  accessibilityRole="link"
                  style={{ color: colors.accent, textDecorationLine: 'underline' }}
                  onPress={() => {
                    if (webOrigin) void Linking.openURL(webOrigin + '/terms').catch(() => {});
                  }}
                >
                  {t('termsOfUse')}
                </Text>
                {t('termsConsentMiddle')}
                <Text
                  accessibilityRole="link"
                  style={{ color: colors.accent, textDecorationLine: 'underline' }}
                  onPress={() => {
                    if (webOrigin) void Linking.openURL(webOrigin + '/privacy').catch(() => {});
                  }}
                >
                  {t('privacyPolicy')}
                </Text>
                {t('termsConsentAfter')}
              </Text>
            </View>
          )}
          {registration && !isCoach && (
            <View style={[styles.consent, { flexDirection: he ? 'row-reverse' : 'row' }]}>
              <Pressable
                testID="health-consent"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: healthConsent }}
                accessibilityLabel={t('healthConsentLabel')}
                hitSlop={8}
                onPress={() => setHealthConsent((value) => !value)}
              >
                <Ionicons
                  name={healthConsent ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={healthConsent ? colors.accent : colors.muted}
                />
              </Pressable>
              <Text
                style={{
                  flex: 1,
                  color: colors.ink,
                  lineHeight: 21,
                  textAlign: he ? 'right' : 'left',
                }}
                onPress={() => setHealthConsent((value) => !value)}
              >
                {t('healthConsentLabel')}
              </Text>
            </View>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: colors.ink }}>
              {t(error) === error ? t('serverError') : t(error)}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            testID="auth-submit"
            disabled={busy || session !== 'signed-out'}
            style={[
              styles.primary,
              {
                backgroundColor: colors.accent,
                opacity: busy || session !== 'signed-out' ? 0.6 : 1,
              },
            ]}
            onPress={() => void submit()}
          >
            {busy ? (
              <ActivityIndicator color={colors.buttonText} />
            ) : (
              <Text style={{ color: colors.buttonText, fontSize: 17, fontWeight: '700' }}>
                {t(recovery ? 'recover' : registration ? 'register' : 'login')}
              </Text>
            )}
          </Pressable>
          {session === 'offline' && (
            <Pressable accessibilityRole="button" style={styles.link} onPress={retry}>
              <Text style={{ color: colors.accent }}>{t('retryConnection')}</Text>
            </Pressable>
          )}
        </>
      )}
      {login ? (
        <>
          <Pressable accessibilityRole="button" style={styles.link} onPress={() => go('register')}>
            <Text style={{ color: colors.accent }}>{t('register')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.link} onPress={() => go('recover')}>
            <Text style={{ color: colors.accent }}>{t('forgot')}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={styles.link}
          onPress={() => router.replace(`/auth/${account}/login`)}
        >
          <Text style={{ color: colors.accent }}>{t('backToSignIn')}</Text>
        </Pressable>
      )}
    </Frame>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 470, gap: 12 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  brand: { fontSize: 35, fontWeight: '800', textAlign: 'center' },
  art: { width: '100%', height: 207, borderRadius: 24 },
  title: { fontSize: 27, fontWeight: '800', marginBottom: 7 },
  choice: {
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
  },
  authMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  consent: { alignItems: 'flex-start', gap: 10, marginTop: 4 },
  field: { borderWidth: 1, borderRadius: 13, minHeight: 52, paddingHorizontal: 14, fontSize: 16 },
  primary: {
    minHeight: 51,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 7,
  },
  link: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 4 },
});
