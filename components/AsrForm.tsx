import { useState } from 'react';
import { ASR_PROVIDERS, getAsrProvider, type AsrProviderId, type AsrSettings } from '@/lib/asr/providers';
import { Field, inputClass } from './Field';

/** Speech recognition for videos without subtitles. Saved explicitly, like the model form. */
export function AsrForm({ value, onSave }: { value: AsrSettings; onSave: (asr: AsrSettings) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();
  const provider = getAsrProvider(draft.provider);

  const set = (patch: Partial<AsrSettings>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setStatus(undefined);
  };
  const setForProvider = (field: 'apiKeys' | 'models', text: string) =>
    set({ [field]: { ...draft[field], [provider.id]: text } });

  const save = async () => {
    if (draft.enabled && provider.id === 'custom') {
      let origin: string;
      try {
        origin = new URL(draft.customBaseUrl.trim()).origin;
      } catch {
        setStatus({ ok: false, text: 'Enter a valid base URL, e.g. https://api.example.com/v1' });
        return;
      }
      // Must be the first await: Chrome only grants permissions during the click.
      if (!(await browser.permissions.request({ origins: [`${origin}/*`] }))) {
        setStatus({ ok: false, text: `bilidude needs access to ${origin} to call this endpoint.` });
        return;
      }
    }
    if (draft.enabled && !provider.free && !draft.apiKeys[provider.id]?.trim()) {
      setStatus({ ok: false, text: 'Enter an API key.' });
      return;
    }
    await onSave(draft);
    setStatus({ ok: true, text: 'Saved' });
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-accent"
          checked={draft.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
        />
        Transcribe videos without subtitles
      </label>

      {draft.enabled && (
        <>
          <Field label="Service">
            <select
              className={inputClass}
              value={provider.id}
              onChange={(e) => set({ provider: e.target.value as AsrProviderId })}
            >
              {ASR_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          {provider.free && (
            <p className="text-xs leading-relaxed text-fg-muted">
              Uses the speech recognition behind Bilibili's Bcut editor. No key needed; the audio is uploaded to Bilibili.
            </p>
          )}
          {!provider.timestamps && (
            <p className="text-xs leading-relaxed text-fg-muted">
              This service returns text without timestamps, so cited times are estimates.
            </p>
          )}

          {provider.id === 'custom' && (
            <Field label="Base URL">
              <input
                className={inputClass}
                placeholder="https://api.example.com/v1"
                value={draft.customBaseUrl}
                onChange={(e) => set({ customBaseUrl: e.target.value })}
              />
            </Field>
          )}

          {provider.id === 'dashscope' && (
            <>
              <Field label="Region">
                <select
                  className={inputClass}
                  value={draft.dashscopeRegion}
                  onChange={(e) => set({ dashscopeRegion: e.target.value as AsrSettings['dashscopeRegion'] })}
                >
                  <option value="cn-beijing">China (Beijing)</option>
                  <option value="ap-southeast-1">Singapore</option>
                </select>
              </Field>
              <Field label="Workspace ID (optional)">
                <input
                  className={inputClass}
                  placeholder="Uses the shared endpoint when empty"
                  value={draft.dashscopeWorkspace}
                  onChange={(e) => set({ dashscopeWorkspace: e.target.value })}
                />
              </Field>
            </>
          )}

          {!provider.free && (
            <>
              <Field label="API key">
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="off"
                  value={draft.apiKeys[provider.id] ?? ''}
                  onChange={(e) => setForProvider('apiKeys', e.target.value)}
                />
              </Field>
              <Field label="Model">
                <input
                  className={inputClass}
                  placeholder={provider.defaultModel || 'Model ID'}
                  value={draft.models[provider.id] ?? ''}
                  onChange={(e) => setForProvider('models', e.target.value)}
                />
              </Field>
            </>
          )}

          <Field label="Start transcribing">
            <select
              className={inputClass}
              value={draft.trigger}
              onChange={(e) => set({ trigger: e.target.value as AsrSettings['trigger'] })}
            >
              <option value="ask">When I ask about the video</option>
              <option value="open">As soon as the panel shows the video</option>
            </select>
          </Field>
        </>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white"
        >
          Save
        </button>
        {status && <span className={`text-sm ${status.ok ? 'text-fg-muted' : 'text-red-500'}`}>{status.text}</span>}
      </div>
    </div>
  );
}
