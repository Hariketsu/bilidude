import { ArrowLeft } from 'lucide-react';
import { saveSettings, type Settings } from '@/lib/settings';
import type { ThemePreference } from '@/lib/theme';
import { Field, inputClass } from './Field';
import { IconButton } from './IconButton';
import { ModelForm } from './ModelForm';

const LANGUAGES = [
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

const THEMES: [ThemePreference, string][] = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export function SettingsPanel({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const update = (patch: Partial<Settings>) => saveSettings({ ...settings, ...patch });

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <IconButton icon={ArrowLeft} label="Back" onClick={onClose} />
        <h1 className="text-[15px] font-semibold">Settings</h1>
      </header>
      <div className="flex-1 space-y-8 overflow-y-auto px-5 pt-2 pb-8">
        <section className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Model</h2>
          <ModelForm value={settings.llm} onSave={(llm) => update({ llm })} />
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Answers</h2>
          <Field label="Language">
            <select
              className={inputClass}
              value={settings.outputLanguage}
              onChange={(e) => update({ outputLanguage: e.target.value })}
            >
              <option value="auto">Same as browser</option>
              {LANGUAGES.map(([tag, name]) => (
                <option key={tag} value={tag}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Conversations</h2>
          <Field label="When opening a video">
            <select
              className={inputClass}
              value={settings.sessionPolicy}
              onChange={(e) => update({ sessionPolicy: e.target.value as Settings['sessionPolicy'] })}
            >
              <option value="new">Start a new conversation</option>
              <option value="resume">Continue the last conversation</option>
            </select>
          </Field>
        </section>

        <section className="space-y-4">
          <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Appearance</h2>
          <div className="inline-flex rounded-full bg-surface p-1">
            {THEMES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => update({ theme: value })}
                className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                  settings.theme === value ? 'bg-surface-raised font-medium text-fg' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
