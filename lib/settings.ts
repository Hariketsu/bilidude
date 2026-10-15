import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import { useEffect, useState } from 'react';
import { DEFAULT_ASR_SETTINGS, type AsrSettings } from './asr/providers';
import { resolveUiLanguage, type UiLanguageSetting } from './i18n';
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
    /** Preferred reasoning effort; each request clamps it to what the model supports. */
    thinking: ModelThinkingLevel;
  };
  /** Interface language; `auto` follows the browser. */
  uiLanguage: UiLanguageSetting;
  /** `auto` follows the interface language; otherwise a BCP 47 tag. */
  outputLanguage: string;
  theme: ThemePreference;
  /** What opening a video shows: a fresh conversation, or the last one about it. */
  sessionPolicy: 'new' | 'resume';
  /** Speech recognition for videos without subtitles. */
  asr: AsrSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  // Thinking off: recaps come back in seconds instead of after a long reasoning pass.
  llm: { provider: 'openai', models: {}, apiKeys: {}, customBaseUrl: '', thinking: 'off' },
  uiLanguage: 'auto',
  outputLanguage: 'auto',
  theme: 'system',
  sessionPolicy: 'new',
  asr: DEFAULT_ASR_SETTINGS,
};

const STORAGE_KEY = 'settings';

export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Partial<Settings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    llm: { ...DEFAULT_SETTINGS.llm, ...stored?.llm },
    asr: { ...DEFAULT_SETTINGS.asr, ...stored?.asr },
  };
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
export function resolveOutputLanguage(settings: Pick<Settings, 'outputLanguage' | 'uiLanguage'>): string {
  const tag = settings.outputLanguage === 'auto' ? resolveUiLanguage(settings.uiLanguage) : settings.outputLanguage;
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
