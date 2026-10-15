import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { saveSettings, type Settings } from '@/lib/settings';
import type { ThemePreference } from '@/lib/theme';
import { IconButton } from './IconButton';
import { ModelSettings } from './ModelSettings';
import { Group, Row, Select } from './SettingsUi';
import { TranscriptionSettings } from './TranscriptionSettings';

const LANGUAGES = [
  ['auto', 'Same as browser'],
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

const SESSION_POLICIES = [
  ['new', 'New conversation'],
  ['resume', 'Continue the last one'],
] as const;

const THEMES: [ThemePreference, string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

/** Every change is saved at once; there are no Save buttons. */
export function SettingsPanel({ settings, onClose }: { settings: Settings; onClose: () => void }) {
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
        <IconButton icon={ArrowLeft} label="Back" onClick={onClose} />
        <h1 className="text-[15px] font-semibold">Settings</h1>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto px-4 pt-2 pb-8">
        <ModelSettings title="Model" value={current.llm} onChange={(llm) => update({ llm })} />

        <TranscriptionSettings title="Audio transcription" value={current.asr} onChange={(asr) => update({ asr })} />

        <Group title="General">
          <Select
            label="Answer language"
            value={current.outputLanguage}
            options={LANGUAGES}
            onChange={(outputLanguage) => update({ outputLanguage })}
          />
          <Select
            label="Opening a video"
            value={current.sessionPolicy}
            options={SESSION_POLICIES}
            onChange={(sessionPolicy) => update({ sessionPolicy })}
          />
          <Row label="Theme" group>
            <span className="inline-flex rounded-full bg-bg p-0.5">
              {THEMES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => update({ theme: value })}
                  className={`rounded-full px-3 py-1 text-[13px] transition-colors ${
                    current.theme === value ? 'bg-surface-raised font-medium text-fg' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {label}
                </button>
              ))}
            </span>
          </Row>
        </Group>
      </div>
    </div>
  );
}
