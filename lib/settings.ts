import { useEffect, useState } from 'react';
import type { ThemePreference } from './theme';

export interface Settings {
  llm: {
    /** A built-in provider id, or `custom` for an OpenAI-compatible endpoint. */
    provider: string;
    /** Model id per provider, so switching providers keeps each choice. */
    models: Record<string, string>;
    /** API key per provider. */
    apiKeys: Record<string, string>;
    customBaseUrl: string;
  };
  /** `auto` follows the browser UI language; otherwise a BCP 47 tag. */
  outputLanguage: string;
  theme: ThemePreference;
}

export const DEFAULT_SETTINGS: Settings = {
  llm: { provider: 'openai', models: {}, apiKeys: {}, customBaseUrl: '' },
  outputLanguage: 'auto',
  theme: 'system',
};

const STORAGE_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored, llm: { ...DEFAULT_SETTINGS.llm, ...stored?.llm } };
}

export async function saveSettings(settings: Settings) {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
}

/** Current settings (undefined until loaded), kept in sync across extension pages. */
export function useSettings(): Settings | undefined {
  const [settings, setSettings] = useState<Settings>();
  useEffect(() => {
    void loadSettings().then(setSettings);
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && STORAGE_KEY in changes) void loadSettings().then(setSettings);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);
  return settings;
}

/** English name of the language answers should be written in, e.g. `Chinese (China)`. */
export function resolveOutputLanguage(setting: string): string {
  const tag = setting === 'auto' ? browser.i18n.getUILanguage() : setting;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
