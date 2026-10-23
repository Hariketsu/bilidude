import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_PROVIDER, defaultBaseUrl, effectiveThinking, listModels, PROVIDERS, thinkingLevels } from '@/lib/llm/providers';
import type { Settings } from '@/lib/settings';
import { HostAccess, originOf } from './HostAccess';
import { Group, Select, TextInput } from './SettingsUi';

type LlmSettings = Settings['llm'];

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
  /** Offer a custom base URL's permission inline (the setup form asks on its own button instead). */
  hostAccess?: boolean;
}) {
  const { t } = useTranslation();
  const provider = value.provider;
  const isCustom = provider === CUSTOM_PROVIDER;
  const models = listModels(provider);
  const model = models.find((m) => m.id === value.models[provider]);
  const levels = model ? thinkingLevels(model) : [];
  const set = (patch: Partial<LlmSettings>) => onChange({ ...value, ...patch });
  const setForProvider = (field: 'apiKeys' | 'models' | 'baseUrls', text: string) => set({ [field]: { ...value[field], [provider]: text } });

  return (
    <Group title={title} footer={t('settings.model.keyNote')}>
      <Select
        label={t('settings.model.provider')}
        value={provider}
        options={PROVIDERS.map((p) => [p.id, p.id === CUSTOM_PROVIDER ? t('settings.model.customProvider') : p.name] as const)}
        onChange={(id) => set({ provider: id })}
      />
      <TextInput
        label={t('settings.model.baseUrl')}
        placeholder={isCustom ? 'https://api.example.com/v1' : defaultBaseUrl(provider)}
        value={value.baseUrls[provider] ?? ''}
        onChange={(url) => setForProvider('baseUrls', url)}
      />
      {hostAccess && <HostAccess baseUrl={value.baseUrls[provider] ?? ''} />}
      <TextInput
        label={t('settings.model.apiKey')}
        secret
        placeholder={t('settings.model.required')}
        value={value.apiKeys[provider] ?? ''}
        onChange={(key) => setForProvider('apiKeys', key)}
      />
      {isCustom ? (
        <TextInput
          label={t('settings.model.model')}
          placeholder={t('settings.model.modelId')}
          value={value.models[provider] ?? ''}
          onChange={(id) => setForProvider('models', id)}
        />
      ) : (
        <Select
          label={t('settings.model.model')}
          value={value.models[provider] ?? ''}
          placeholder={t('settings.model.chooseModel')}
          options={models.map((m) => [m.id, m.name] as const)}
          onChange={(id) => setForProvider('models', id)}
        />
      )}
      {model && levels.length > 0 && (
        <Select
          label={t('thinking.label')}
          value={effectiveThinking(model, value.thinking)}
          options={levels.map((level) => [level, t(`thinking.levels.${level}`)] as const)}
          onChange={(thinking) => set({ thinking })}
        />
      )}
    </Group>
  );
}

/** First-run setup: the model card plus a button that saves it (and asks for a custom base URL's host). */
export function ModelSetup({ value, onSave }: { value: LlmSettings; onSave: (llm: LlmSettings) => Promise<void> }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string>();
  const baseUrl = draft.baseUrls[draft.provider]?.trim() ?? '';
  const complete =
    !!draft.apiKeys[draft.provider]?.trim() &&
    !!draft.models[draft.provider]?.trim() &&
    (draft.provider !== CUSTOM_PROVIDER || !!baseUrl);

  const connect = async () => {
    if (baseUrl) {
      const origin = originOf(baseUrl);
      if (!origin) {
        setError(t('settings.host.invalidUrl'));
        return;
      }
      // Must be the first await: Chrome only grants permissions during the click.
      if (!(await browser.permissions.request({ origins: [`${origin}/*`] }))) {
        setError(t('settings.host.needsAccess', { origin }));
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
          {t('setup.connect')}
        </button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
