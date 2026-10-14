import { useState } from 'react';
import { CUSTOM_PROVIDER, listModels, PROVIDERS } from '@/lib/llm/providers';
import type { Settings } from '@/lib/settings';
import { Field, inputClass } from './Field';

type LlmSettings = Settings['llm'];

/** Provider, API key and model. Saved explicitly so a custom endpoint's host permission can be requested on click. */
export function ModelForm({ value, onSave }: { value: LlmSettings; onSave: (llm: LlmSettings) => Promise<void> }) {
  const [draft, setDraft] = useState(value);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  const provider = draft.provider;
  const isCustom = provider === CUSTOM_PROVIDER;
  const models = listModels(provider);
  const set = (patch: Partial<LlmSettings>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setStatus(undefined);
  };
  const setForProvider = (field: 'apiKeys' | 'models', text: string) =>
    set({ [field]: { ...draft[field], [provider]: text } });

  const save = async () => {
    if (isCustom) {
      let origin: string;
      try {
        origin = new URL(draft.customBaseUrl.trim()).origin;
      } catch {
        setStatus({ ok: false, text: 'Enter a valid base URL, e.g. https://api.example.com/v1' });
        return;
      }
      // Must be the first await: Chrome only grants permissions during the click.
      const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
      if (!granted) {
        setStatus({ ok: false, text: `bilidude needs access to ${origin} to call this endpoint.` });
        return;
      }
    }
    await onSave(draft);
    setStatus({ ok: true, text: 'Saved' });
  };

  const complete =
    !!draft.apiKeys[provider]?.trim() && !!draft.models[provider]?.trim() && (!isCustom || !!draft.customBaseUrl.trim());

  return (
    <div className="space-y-4">
      <Field label="Provider">
        <select className={inputClass} value={provider} onChange={(e) => set({ provider: e.target.value })}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {isCustom && (
        <Field label="Base URL">
          <input
            className={inputClass}
            placeholder="https://api.example.com/v1"
            value={draft.customBaseUrl}
            onChange={(e) => set({ customBaseUrl: e.target.value })}
          />
        </Field>
      )}

      <Field label="API key">
        <input
          className={inputClass}
          type="password"
          autoComplete="off"
          value={draft.apiKeys[provider] ?? ''}
          onChange={(e) => setForProvider('apiKeys', e.target.value)}
        />
      </Field>

      <Field label="Model">
        {isCustom ? (
          <input
            className={inputClass}
            placeholder="Model ID"
            value={draft.models[provider] ?? ''}
            onChange={(e) => setForProvider('models', e.target.value)}
          />
        ) : (
          <select
            className={inputClass}
            value={draft.models[provider] ?? ''}
            onChange={(e) => setForProvider('models', e.target.value)}
          >
            <option value="" disabled>
              Choose a model
            </option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!complete}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
        >
          Save
        </button>
        {status && <span className={`text-sm ${status.ok ? 'text-fg-muted' : 'text-red-500'}`}>{status.text}</span>}
      </div>
      <p className="text-xs leading-relaxed text-fg-muted">
        Your key is stored only in this browser and sent only to the provider you choose.
      </p>
    </div>
  );
}
