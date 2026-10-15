import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UI_LANGUAGE_NAMES, UI_LANGUAGES } from '@/lib/i18n';
import { saveSettings, type Settings } from '@/lib/settings';
import type { ThemePreference } from '@/lib/theme';
import { IconButton } from './IconButton';
import { ModelSettings } from './ModelSettings';
import { Group, Hint, Row, Select, Switch } from './SettingsUi';
import { TranscriptionSettings } from './TranscriptionSettings';

/** Answer languages, each named in itself. */
const ANSWER_LANGUAGES = [
  ['en', 'English'],
  ['zh-CN', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['es', 'Español'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['pt', 'Português'],
  ['ru', 'Русский'],
] as const;

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];

/** Every change is saved at once; there are no Save buttons. */
export function SettingsPanel({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const { t } = useTranslation();
  // Edits apply to this copy first, so typing never waits for storage to echo back.
  const [current, setCurrent] = useState(settings);
  const update = (patch: Partial<Settings>) => {
    const next = { ...current, ...patch };
    setCurrent(next);
    void saveSettings(next);
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <IconButton icon={ArrowLeft} label={t('common.back')} onClick={onClose} />
        <h1 className="text-[15px] font-semibold">{t('settings.title')}</h1>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pt-2 pb-8">
        <ModelSettings title={t('settings.model.title')} value={current.llm} onChange={(llm) => update({ llm })} />

        <TranscriptionSettings title={t('settings.transcription.title')} value={current.asr} onChange={(asr) => update({ asr })} />

        <Group title={t('settings.general.title')}>
          <Select
            label={t('settings.general.interfaceLanguage')}
            value={current.uiLanguage}
            options={[
              ['auto', t('settings.general.followBrowser')],
              ...UI_LANGUAGES.map((language) => [language, UI_LANGUAGE_NAMES[language]] as const),
            ]}
            onChange={(uiLanguage) => update({ uiLanguage })}
          />
          <Select
            label={t('settings.general.answerLanguage')}
            value={current.outputLanguage}
            options={[['auto', t('settings.general.followInterface')], ...ANSWER_LANGUAGES]}
            onChange={(outputLanguage) => update({ outputLanguage })}
          />
          <Select
            label={t('settings.general.openingVideo')}
            value={current.sessionPolicy}
            options={(['new', 'resume'] as const).map((policy) => [policy, t(`settings.general.policies.${policy}`)] as const)}
            onChange={(sessionPolicy) => update({ sessionPolicy })}
          />
          <Row label={t('settings.general.theme')} group>
            <span className="inline-flex rounded-full bg-bg p-0.5">
              {THEMES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update({ theme: value })}
                  className={`rounded-full px-3 py-1 text-[13px] transition-colors ${
                    current.theme === value ? 'bg-surface-raised font-medium text-fg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {t(`settings.general.themes.${value}`)}
                </button>
              ))}
            </span>
          </Row>
          <Switch
            label={t('settings.general.exportLinks')}
            checked={current.exportLinks}
            onChange={(exportLinks) => update({ exportLinks })}
          />
          <Hint>{t('settings.general.exportLinksNote')}</Hint>
        </Group>
      </div>
    </div>
  );
}
