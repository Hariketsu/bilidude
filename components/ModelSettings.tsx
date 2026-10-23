import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUSTOM_PROVIDER, defaultBaseUrl, effectiveThinking, listModels, PROVIDERS, thinkingLevels } from '@/lib/llm/providers';
import type { Settings } from '@/lib/settings';
import { HostAccess, originOf } from './HostAccess';
import { Group, Select, TextInput } from './SettingsUi';

type LlmSettings = Settings['llm'];

/** Select value that reveals a field for a model id missing from the catalog. */
const OTHER_MODEL = '\0other';

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
  const modelId = value.models[provider] ?? '';
  const model = models.find((m) => m.id === modelId);
  const levels = model ? thinkingLevels(model) : [];
  const baseUrl = value.baseUrls[provider] ?? '';
  // Picking "Other" empties the id, so remember the choice until a listed model is picked.
  const [typingId, setTypingId] = useState(false);
  const otherModel = isCustom || typingId || (!!modelId && !model);
  const set = (patch: Partial<LlmSettings>) => onChange({ ...value, ...patch });
  const setForProvider = (field: 'apiKeys' | 'models' | 'baseUrls', text: string) => set({ [field]: { ...value[field], [provider]: text } });

  return (
    <Group title={title} footer={t('settings.model.keyNote')}>
      <Select
        label={t('settings.model.provider')}
        value={provider}
        options={PROVIDERS.map((p) => [p.id, p.id === CUSTOM_PROVIDER ? t('settings.model.customProvider') : p.name] as const)}
        onChange={(id) => {
          setTypingId(false);
          set({ provider: id });
        }}
      />
      <TextInput
        label={t('settings.model.baseUrl')}
        placeholder={isCustom ? 'https://api.example.com/v1' : defaultBaseUrl(provider)}
        value={baseUrl}
        onChange={(url) => setForProvider('baseUrls', url)}
      />
      {hostAccess && <HostAccess baseUrl={baseUrl} />}
      {provider === 'openai' && baseUrl.trim() && (
        <Select
          label={t('settings.model.api')}
          value={value.openaiApi}
          options={[
            ['responses', 'Responses'],
            ['completions', 'Chat Completions'],
          ]}
          onChange={(openaiApi) => set({ openaiApi })}
        />
      )}
      <TextInput
        label={t('settings.model.apiKey')}
        secret
        placeholder={t('settings.model.required')}
        value={value.apiKeys[provider] ?? ''}
        onChange={(key) => setForProvider('apiKeys', key)}
      />
      {!isCustom && (
        <Select
          label={t('settings.model.model')}
          value={otherModel ? OTHER_MODEL : modelId}
          placeholder={t('settings.model.chooseModel')}
          options={[...models.map((m) => [m.id, m.name] as const), [OTHER_MODEL, t('settings.model.otherModel')] as const]}
          onChange={(id) => {
            setTypingId(id === OTHER_MODEL);
            setForProvider('models', id === OTHER_MODEL ? '' : id);
          }}
        />
      )}
      {otherModel && (
        <TextInput
          label={t(isCustom ? 'settings.model.model' : 'settings.model.modelId')}
          placeholder={t(isCustom ? 'settings.model.modelId' : 'settings.model.required')}
          value={modelId}
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
