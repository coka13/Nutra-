import React, { createContext, useContext, useState } from 'react';
import { getLocales } from 'expo-localization';
import { useColorScheme } from 'react-native';
import { translate } from '../../src/lib/i18n';

type Language = 'he' | 'en';
type Theme = 'light' | 'dark';
const light = {
  background: '#f6f8f3',
  surface: '#ffffff',
  ink: '#183427',
  muted: '#536a5c',
  border: '#ccd8ce',
  accent: '#166249',
  buttonText: '#ffffff',
};
const dark = {
  background: '#122019',
  surface: '#1f3027',
  ink: '#eef7ef',
  muted: '#bdcdbf',
  border: '#405547',
  accent: '#bde895',
  buttonText: '#14271b',
};
type Preferences = {
  lang: Language;
  colors: typeof light;
  darkMode: boolean;
  t: (key: string) => string;
  update: (lang: Language, theme: Theme) => void;
};
const Context = createContext<Preferences | null>(null);
export function PhoneSettings({ children }: { children: React.ReactNode }) {
  const deviceTheme = useColorScheme();
  const [lang, setLang] = useState<Language>(getLocales()[0]?.languageCode === 'he' ? 'he' : 'en');
  const [theme, setTheme] = useState<Theme | null>(null);
  const darkMode = (theme ?? deviceTheme) === 'dark';
  return (
    <Context.Provider
      value={{
        lang,
        colors: darkMode ? dark : light,
        darkMode,
        t: (key) => translate(lang, key),
        update: (l, th) => {
          setLang(l);
          setTheme(th);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePhone() {
  const context = useContext(Context);
  if (!context) throw new Error('Missing phone settings');
  return context;
}
