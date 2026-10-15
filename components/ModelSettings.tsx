import { useState } from 'react';
import { CUSTOM_PROVIDER, effectiveThinking, listModels, PROVIDERS, thinkingLevels } from '@/lib/llm/providers';
import type { Settings } from '@/lib/settings';
import { HostAccess, originOf } from './HostAccess';
import { Group, Select, TextInput } from './SettingsUi';
import { THINKING_LABELS } from './ThinkingPicker';

type LlmSettings = Settings['llm'];

const KEY_NOTE = 'Your key is stored only in this browser and sent only to the provider you choose.';

/** Provider, endpoint, key, model and thinking level; every change is reported at once. */
export function ModelSettings({
  title,
  value,
  onChange,
  hostAccess = true,
}: {
  title?: string;
  value: LlmSettings;
  onChange: (llm: LlmSettings) => void;
  /** Offer the custom endpoint's permission inline (the setup form asks on its own button instead). */
  hostAccess?: boolean;
}) {
  const provider = value.provider;
  const isCustom = provider === CUSTOM_PROVIDER;
  const models = listModels(provider);
  const model = models.find((m) => m.id === value.models[provider]);
  const levels = model ? thinkingLevels(model) : [];
  const set = (patch: Partial<LlmSettings>) => onChange({ ...value, ...patch });
  const setForProvider = (field: 'apiKeys' | 'models', text: string) => set({ [field]: { ...value[field], [provider]: text } });

  return (
    <Group title={title} footer={KEY_NOTE}>
      <Select
        label="Provider"
        value={provider}
        options={PROVIDERS.map((p) => [p.id, p.name] as const)}
        onChange={(id) => set({ provider: id })}
      />
      {isCustom && (
        <TextInput
          label="Base URL"
          placeholder="https://api.example.com/v1"
          value={value.customBaseUrl}
          onChange={(customBaseUrl) => set({ customBaseUrl })}
        />
      )}
      {isCustom && hostAccess && <HostAccess baseUrl={value.customBaseUrl} />}
      <TextInput
        label="API key"
        secret
        placeholder="Required"
        value={value.apiKeys[provider] ?? ''}
        onChange={(key) => setForProvider('apiKeys', key)}
      />
      {isCustom ? (
        <TextInput
          label="Model"
          placeholder="Model ID"
          value={value.models[provider] ?? ''}
          onChange={(id) => setForProvider('models', id)}
        />
      ) : (
        <Select
          label="Model"
          value={value.models[provider] ?? ''}
          placeholder="Choose a model"
          options={models.map((m) => [m.id, m.name] as const)}
          onChange={(id) => setForProvider('models', id)}
        />
      )}
      {model && levels.length > 0 && (
        <Select
          label="Thinking"
          value={effectiveThinking(model, value.thinking)}
          options={levels.map((level) => [level, THINKING_LABELS[level]] as const)}
          onChange={(thinking) => set({ thinking })}
        />
      )}
    </Group>
  );
}

/** First-run setup: the model card plus a button that saves it (and asks for a custom endpoint's host). */
export function ModelSetup({ value, onSave }: { value: LlmSettings; onSave: (llm: LlmSettings) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();
  const isCustom = draft.provider === CUSTOM_PROVIDER;
  const complete =
    !!draft.apiKeys[draft.provider]?.trim() && !!draft.models[draft.provider]?.trim() && (!isCustom || !!draft.customBaseUrl.trim());

  const connect = async () => {
    if (isCustom) {
      const origin = originOf(draft.customBaseUrl);
      if (!origin) {
        setError('Enter a valid base URL, e.g. https://api.example.com/v1');
        return;
      }
      // Must be the first await: Chrome only grants permissions during the click.
      if (!(await browser.permissions.request({ origins: [`${origin}/*`] }))) {
        setError(`bilidude needs access to ${origin} to call this endpoint.`);
        return;
      }
    }
    await onSave(draft);
  };

  return (
    <div className="space-y-4">
      <ModelSettings
        value={draft}
        hostAccess={false}
        onChange={(llm) => {
          setDraft(llm);
          setError(undefined);
        }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={connect}
          disabled={!complete}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          Connect
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
