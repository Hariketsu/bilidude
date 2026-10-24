import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CUSTOM_PROVIDER,
  defaultBaseUrl,
  effectiveThinking,
  fetchModelIds,
  listModels,
  ModelListError,
  PROVIDERS,
  thinkingLevels,
} from '@/lib/llm/providers';
import type { Settings } from '@/lib/settings';
import { HostAccess, requestHostAccess } from './HostAccess';
import { Group, Row, Select, TextInput } from './SettingsUi';

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
  // Models read from a custom endpoint; empty until the user asks for them.
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string>();
  const fetchController = useRef<AbortController | undefined>(undefined);
  const modelOptions = isCustom
    ? remoteModels.map((id) => [id, id] as const)
    : models.map((m) => [m.id, m.name] as const);
  const canChooseFromList = !isCustom || modelOptions.length > 0;
  const otherModel = canChooseFromList ? typingId || (!!modelId && !modelOptions.some(([id]) => id === modelId)) : true;
  const set = (patch: Partial<LlmSettings>) => onChange({ ...value, ...patch });
  const setForProvider = (field: 'apiKeys' | 'models' | 'baseUrls', text: string) => set({ [field]: { ...value[field], [provider]: text } });

  // A different endpoint or protocol invalidates both the list and any request for it.
  useEffect(() => {
    setRemoteModels([]);
    setFetchError(undefined);
    setFetchingModels(false);
    return () => fetchController.current?.abort();
  }, [provider, baseUrl]);

  const loadModels = async () => {
    fetchController.current?.abort();
    const controller = new AbortController();
    fetchController.current = controller;
    setFetchingModels(true);
    setFetchError(undefined);
    try {
      const accessError = await requestHostAccess(baseUrl);
      if (accessError) {
        setFetchError(accessError);
        return;
      }
      const ids = await fetchModelIds(baseUrl.trim(), value.apiKeys[provider]?.trim() ?? '', controller.signal);
      if (controller.signal.aborted) return;
      if (ids.length === 0) {
        setFetchError(t('settings.model.fetchEmpty'));
        return;
      }
      setRemoteModels(ids);
      if (ids.includes(modelId)) setTypingId(false);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFetchError(
        error instanceof ModelListError
          ? t('settings.model.fetchFailed', { status: error.status })
          : t('settings.model.fetchError'),
      );
    } finally {
      if (!controller.signal.aborted) setFetchingModels(false);
    }
  };

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
      {isCustom && (
        <Row group label={t('settings.model.modelList')}>
          <span className="flex min-w-0 items-center justify-end gap-3">
            {(fetchError || remoteModels.length > 0) && (
              <span
                className={`min-w-0 truncate text-xs ${fetchError ? 'text-red-500' : 'text-fg-muted'}`}
                title={fetchError}
              >
                {fetchError ?? t('settings.model.fetched', { count: remoteModels.length })}
              </span>
            )}
            <button
              type="button"
              onClick={() => void loadModels()}
              disabled={fetchingModels || !baseUrl.trim()}
              className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-white transition-opacity disabled:opacity-40"
            >
              {fetchingModels
                ? t('settings.model.fetching')
                : remoteModels.length > 0
                  ? t('settings.model.refreshModels')
                  : t('settings.model.fetchModels')}
            </button>
          </span>
        </Row>
      )}
      {canChooseFromList && (
        <Select
          label={t('settings.model.model')}
          value={otherModel ? OTHER_MODEL : modelId}
          placeholder={t('settings.model.chooseModel')}
          options={[...modelOptions, [OTHER_MODEL, t('settings.model.otherModel')] as const]}
          onChange={(id) => {
            setTypingId(id === OTHER_MODEL);
            setForProvider('models', id === OTHER_MODEL ? '' : id);
          }}
        />
      )}
      {otherModel && (
        <TextInput
          label={t(canChooseFromList ? 'settings.model.modelId' : 'settings.model.model')}
          placeholder={t(canChooseFromList ? 'settings.model.required' : 'settings.model.modelId')}
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
    const accessError = baseUrl ? await requestHostAccess(baseUrl) : undefined;
    if (accessError) {
      setError(accessError);
      return;
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
