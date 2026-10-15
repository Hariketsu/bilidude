import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en';
import zhCN from '@/locales/zh-CN';
import zhTW from '@/locales/zh-TW';

export const UI_LANGUAGES = ['en', 'zh-CN', 'zh-TW'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
/** `auto` follows the browser's UI language. */
export type UiLanguageSetting = 'auto' | UiLanguage;

/** Each language named in itself, as language pickers conventionally show them. */
export const UI_LANGUAGE_NAMES: Record<UiLanguage, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
};

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}

/** Traditional script for Taiwan, Hong Kong, Macau and explicit `zh-Hant`; other Chinese is Simplified. */
export function resolveUiLanguage(setting: UiLanguageSetting): UiLanguage {
  if (setting !== 'auto') return setting;
  const tag = browser.i18n.getUILanguage().toLowerCase();
  if (!tag.startsWith('zh')) return 'en';
  return /hant|tw|hk|mo/.test(tag) ? 'zh-TW' : 'zh-CN';
}

void i18next.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-CN': { translation: zhCN }, 'zh-TW': { translation: zhTW } },
  lng: resolveUiLanguage('auto'),
  fallbackLng: 'en',
  // React escapes text already.
  interpolation: { escapeValue: false },
});

/** Switches the interface language; the document language follows for fonts and screen readers. */
export function applyUiLanguage(setting: UiLanguageSetting) {
  const language = resolveUiLanguage(setting);
  document.documentElement.lang = language;
  if (i18next.language !== language) void i18next.changeLanguage(language);
}

export const t = i18next.t.bind(i18next);
