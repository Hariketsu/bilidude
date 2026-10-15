import { useTranslation } from 'react-i18next';
import { ASR_PROVIDERS, getAsrProvider, resolveAsr, type AsrProviderId, type AsrSettings } from '@/lib/asr/providers';
import { HostAccess } from './HostAccess';
import { Group, Hint, Select, Switch, TextInput } from './SettingsUi';

/** Speech recognition for videos without subtitles; every change is reported at once. */
export function TranscriptionSettings({
  title,
  value,
  onChange,
}: {
  title: string;
  value: AsrSettings;
  onChange: (asr: AsrSettings) => void;
}) {
  const { t } = useTranslation();
  const provider = getAsrProvider(value.provider);
  const providerName = (id: AsrProviderId, name: string) =>
    id === 'bcut' || id === 'dashscope'
      ? t(`settings.transcription.${id}`)
      : id === 'custom'
        ? t('settings.model.customProvider')
        : name;
  const set = (patch: Partial<AsrSettings>) => onChange({ ...value, ...patch });
  const setForProvider = (field: 'apiKeys' | 'models', text: string) => set({ [field]: { ...value[field], [provider.id]: text } });

  return (
    <Group title={title}>
      <Switch label={t('settings.transcription.enable')} checked={value.enabled} onChange={(enabled) => set({ enabled })} />
      {value.enabled && (
        <>
          <Select
            label={t('settings.transcription.service')}
            value={provider.id}
            options={ASR_PROVIDERS.map((p) => [p.id, providerName(p.id, p.name)] as const)}
            onChange={(id) => set({ provider: id })}
          />
          {provider.free && (
            <Hint>{t('settings.transcription.bcutNote')}</Hint>
          )}
          {!provider.timestamps && <Hint>{t('settings.transcription.noTimestamps')}</Hint>}

          {provider.id === 'custom' && (
            <>
              <TextInput
                label={t('settings.model.baseUrl')}
                placeholder="https://api.example.com/v1"
                value={value.customBaseUrl}
                onChange={(customBaseUrl) => set({ customBaseUrl })}
              />
              <HostAccess baseUrl={value.customBaseUrl} />
            </>
          )}
          {provider.id === 'dashscope' && (
            <>
              <Select
                label={t('settings.transcription.region')}
                value={value.dashscopeRegion}
                options={(['cn-beijing', 'ap-southeast-1'] as const).map((r) => [r, t(`settings.transcription.regions.${r}`)] as const)}
                onChange={(dashscopeRegion) => set({ dashscopeRegion })}
              />
              <TextInput
                label={t('settings.transcription.workspace')}
                placeholder={t('settings.transcription.optional')}
                value={value.dashscopeWorkspace}
                onChange={(dashscopeWorkspace) => set({ dashscopeWorkspace })}
              />
            </>
          )}
          {!provider.free && (
            <>
              <TextInput
                label={t('settings.model.apiKey')}
                secret
                placeholder={t('settings.model.required')}
                value={value.apiKeys[provider.id] ?? ''}
                onChange={(key) => setForProvider('apiKeys', key)}
              />
              <TextInput
                label={t('settings.model.model')}
                placeholder={provider.defaultModel || t('settings.model.modelId')}
                value={value.models[provider.id] ?? ''}
                onChange={(id) => setForProvider('models', id)}
              />
            </>
          )}
          {!resolveAsr(value) && <Hint>{t('settings.transcription.incomplete')}</Hint>}

          <Select
            label={t('settings.transcription.start')}
            value={value.trigger}
            options={(['ask', 'open'] as const).map((k) => [k, t(`settings.transcription.triggers.${k}`)] as const)}
            onChange={(trigger) => set({ trigger })}
          />
        </>
      )}
    </Group>
  );
}
