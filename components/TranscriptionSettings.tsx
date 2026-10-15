import { ASR_PROVIDERS, getAsrProvider, resolveAsr, type AsrSettings } from '@/lib/asr/providers';
import { HostAccess } from './HostAccess';
import { Group, Hint, Select, Switch, TextInput } from './SettingsUi';

const REGIONS = [
  ['cn-beijing', 'China (Beijing)'],
  ['ap-southeast-1', 'Singapore'],
] as const;

const TRIGGERS = [
  ['ask', 'When I ask'],
  ['open', 'When the video opens'],
] as const;

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
  const provider = getAsrProvider(value.provider);
  const set = (patch: Partial<AsrSettings>) => onChange({ ...value, ...patch });
  const setForProvider = (field: 'apiKeys' | 'models', text: string) => set({ [field]: { ...value[field], [provider.id]: text } });

  return (
    <Group title={title}>
      <Switch label="Transcribe videos without subtitles" checked={value.enabled} onChange={(enabled) => set({ enabled })} />
      {value.enabled && (
        <>
          <Select
            label="Service"
            value={provider.id}
            options={ASR_PROVIDERS.map((p) => [p.id, p.name] as const)}
            onChange={(id) => set({ provider: id })}
          />
          {provider.free && (
            <Hint>Uses the speech recognition behind Bilibili's Bcut editor. No key needed; the audio is uploaded to Bilibili.</Hint>
          )}
          {!provider.timestamps && <Hint>This service returns text without timestamps, so cited times are estimates.</Hint>}

          {provider.id === 'custom' && (
            <>
              <TextInput
                label="Base URL"
                placeholder="https://api.example.com/v1"
                value={value.customBaseUrl}
                onChange={(customBaseUrl) => set({ customBaseUrl })}
              />
              <HostAccess baseUrl={value.customBaseUrl} />
            </>
          )}
          {provider.id === 'dashscope' && (
            <>
              <Select label="Region" value={value.dashscopeRegion} options={REGIONS} onChange={(dashscopeRegion) => set({ dashscopeRegion })} />
              <TextInput
                label="Workspace ID"
                placeholder="Optional"
                value={value.dashscopeWorkspace}
                onChange={(dashscopeWorkspace) => set({ dashscopeWorkspace })}
              />
            </>
          )}
          {!provider.free && (
            <>
              <TextInput
                label="API key"
                secret
                placeholder="Required"
                value={value.apiKeys[provider.id] ?? ''}
                onChange={(key) => setForProvider('apiKeys', key)}
              />
              <TextInput
                label="Model"
                placeholder={provider.defaultModel || 'Model ID'}
                value={value.models[provider.id] ?? ''}
                onChange={(id) => setForProvider('models', id)}
              />
            </>
          )}
          {!resolveAsr(value) && <Hint>Fill in the fields above to use this service.</Hint>}

          <Select label="Start transcribing" value={value.trigger} options={TRIGGERS} onChange={(trigger) => set({ trigger })} />
        </>
      )}
    </Group>
  );
}
