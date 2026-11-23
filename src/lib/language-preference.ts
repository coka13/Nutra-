import type { Language } from './i18n';

export const languagePreferenceKey = 'nutri-language';

export function parseLanguage(value: string | undefined | null): Language | undefined {
  return value === 'en' || value === 'he' ? value : undefined;
}

export function persistLanguage(language: Language) {
  document.cookie = `${languagePreferenceKey}=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(languagePreferenceKey, language);
  } catch {
    // The cookie still preserves the preference when browser storage is unavailable.
  }
}
