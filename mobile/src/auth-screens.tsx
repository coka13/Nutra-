import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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

const appName = Constants.expoConfig?.name ?? 'Nutri+';
const copy = {
  user: [
    'I’m a User',
    'אני מתאמן',
    'Train independently or with a coach.',
    'לאימון עצמאי או בליווי מאמן.',
  ],
  coach: [
    'I’m a Coach',
    'אני מאמן',
    'Manage clients and build training and nutrition plans.',
    'לניהול מתאמנים ובניית תוכניות אימון ותזונה.',
  ],
} as const;

export function WelcomeScreen() {
  const { lang, colors, darkMode, update } = usePhone();
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
        {he ? `איך משתמשים ב‑${appName}?` : `How will you use ${appName}?`}
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
              {copy[account][he ? 1 : 0]}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: account === 'coach' ? colors.muted : colors.buttonText,
              }}
            >
              {copy[account][he ? 3 : 2]}
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
          <Text style={{ color: colors.accent }}>
            {he ? 'לא ניתן להתחבר. נסו שוב.' : 'Connection unavailable. Try again.'}
          </Text>
        </Pressable>
      )}
    </Frame>
  );
}

const errors: Record<string, [string, string]> = {
  invalid: ['Check your details and try again.', 'בדקו את הפרטים ונסו שוב.'],
  credentials: [
    'These credentials do not match an account for this portal.',
    'פרטי הכניסה אינם תואמים לחשבון בסוג זה.',
  ],
  emailTaken: [
    'An account already uses this email. Sign in with your existing account.',
    'כבר קיים חשבון עם כתובת זו. היכנסו לחשבון הקיים.',
  ],
  offline: [
    'Could not connect. Try again when you’re online.',
    'לא ניתן להתחבר. נסו שוב כשיש חיבור לרשת.',
  ],
  rateLimited: [
    'Too many attempts. Try again in a minute.',
    'בוצעו יותר מדי ניסיונות. נסו שוב בעוד דקה.',
  ],
  emailUnavailable: [
    'Password recovery is temporarily unavailable.',
    'שחזור סיסמה אינו זמין כרגע.',
  ],
  serverError: ['Something went wrong. Try again.', 'אירעה שגיאה. נסו שוב.'],
};

export function AuthScreen({ account, mode }: { account: Account; mode: AuthMode }) {
  const { lang, colors } = usePhone();
  const { session, retry, authenticate } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const he = lang === 'he';
  const isCoach = account === 'coach';
  const registration = mode === 'register';
  const recovery = mode === 'recover';
  const login = mode === 'login';
  const heading = recovery
    ? he
      ? 'איפוס סיסמה'
      : 'Reset your password'
    : registration
      ? isCoach
        ? he
          ? 'יצירת חשבון מאמן'
          : 'Create a coach account'
        : he
          ? 'יצירת חשבון מתאמן'
          : 'Create a user account'
      : isCoach
        ? he
          ? 'כניסת מאמנים'
          : 'Coach sign-in'
        : he
          ? 'כניסת מתאמנים'
          : 'User sign-in';
  const fields = {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.ink,
    textAlign: he ? ('right' as const) : ('left' as const),
  };

  async function submit() {
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
      });
      setPassword('');
      if (recovery) setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'serverError');
    } finally {
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
        <Text style={{ color: colors.accent }}>{he ? 'חזרה' : 'Back'}</Text>
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
          {he
            ? 'אם קיימת התאמה לכתובת, יישלח קישור לאיפוס הסיסמה.'
            : 'If an account matches that email, you’ll receive a reset link.'}
        </Text>
      ) : (
        <>
          {registration && (
            <>
              <Text style={{ color: colors.ink }}>{he ? 'שם מלא' : 'Full name'}</Text>
              <TextInput
                testID="name"
                accessibilityLabel={he ? 'שם מלא' : 'Full name'}
                style={[styles.field, fields]}
                value={name}
                onChangeText={setName}
                autoComplete="name"
                maxLength={200}
              />
            </>
          )}
          <Text style={{ color: colors.ink }}>{he ? 'דוא״ל' : 'Email'}</Text>
          <TextInput
            testID="email"
            accessibilityLabel={he ? 'דוא״ל' : 'Email'}
            style={[styles.field, fields]}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            maxLength={200}
          />
          {registration && isCoach && (
            <>
              <Text style={{ color: colors.ink }}>{he ? 'מספר טלפון' : 'Phone number'}</Text>
              <TextInput
                testID="phone"
                accessibilityLabel={he ? 'מספר טלפון' : 'Phone number'}
                style={[styles.field, fields, { textAlign: 'left' }]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                maxLength={40}
                placeholder="+972501234567"
                placeholderTextColor={colors.muted}
              />
              <Text style={{ color: colors.muted }}>
                {he
                  ? 'כללו קידומת מדינה. המתאמנים יוכלו ליצור קשר בדוא״ל, בוואטסאפ או בטלפון.'
                  : 'Include the country code. Clients can contact you by email, WhatsApp or phone.'}
              </Text>
            </>
          )}
          {!recovery && (
            <>
              <Text style={{ color: colors.ink }}>{he ? 'סיסמה' : 'Password'}</Text>
              <TextInput
                testID="password"
                accessibilityLabel={he ? 'סיסמה' : 'Password'}
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
              {registration && (
                <Text style={{ color: colors.muted }}>
                  {he ? 'לפחות 10 תווים.' : 'At least 10 characters.'}
                </Text>
              )}
            </>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: colors.ink }}>
              {(errors[error] || errors.serverError)[he ? 1 : 0]}
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
                {recovery
                  ? he
                    ? 'שליחת קישור לאיפוס'
                    : 'Send reset link'
                  : registration
                    ? he
                      ? 'יצירת חשבון'
                      : 'Create account'
                    : he
                      ? 'כניסה'
                      : 'Sign in'}
              </Text>
            )}
          </Pressable>
          {session === 'offline' && (
            <Pressable accessibilityRole="button" style={styles.link} onPress={retry}>
              <Text style={{ color: colors.accent }}>
                {he ? 'ניסיון התחברות נוסף' : 'Retry connection'}
              </Text>
            </Pressable>
          )}
        </>
      )}
      {login ? (
        <>
          <Pressable accessibilityRole="button" style={styles.link} onPress={() => go('register')}>
            <Text style={{ color: colors.accent }}>{he ? 'יצירת חשבון' : 'Create an account'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.link} onPress={() => go('recover')}>
            <Text style={{ color: colors.accent }}>{he ? 'שכחתי סיסמה' : 'Forgot password?'}</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          style={styles.link}
          onPress={() => router.replace(`/auth/${account}/login`)}
        >
          <Text style={{ color: colors.accent }}>{he ? 'חזרה לכניסה' : 'Back to sign-in'}</Text>
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
