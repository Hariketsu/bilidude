import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CACHE_DAYS, CACHE_MEGABYTES, cacheUsage, clearCache, pruneCache, type CachePolicy } from '@/lib/cache';
import { Group, Row, Select } from './SettingsUi';

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Cache expiry for transcripts, the current cache size, and a button to clear it. */
export function StorageSettings({ value, onChange }: { value: CachePolicy; onChange: (cache: CachePolicy) => void }) {
  const { t } = useTranslation();
  const [bytes, setBytes] = useState<number>();
  const refresh = () => void cacheUsage().then((usage) => setBytes(usage.bytes));
  useEffect(refresh, []);

  // A new policy takes effect at once rather than at the next daily cleanup.
  const set = (patch: Partial<CachePolicy>) => {
    const next = { ...value, ...patch };
    onChange(next);
    void pruneCache(next).then(refresh);
  };

  return (
    <Group title={t('settings.storage.title')} footer={t('settings.storage.note')}>
      <Select
        label={t('settings.storage.policy')}
        value={value.mode}
        options={(['age', 'size', 'never'] as const).map((mode) => [mode, t(`settings.storage.modes.${mode}`)] as const)}
        onChange={(mode) => set({ mode })}
      />
      {value.mode === 'age' && (
        <Select
          label={t('settings.storage.unusedFor')}
          value={String(value.days)}
          options={CACHE_DAYS.map((days) => [String(days), t('settings.storage.days', { count: days })] as const)}
          onChange={(days) => set({ days: Number(days) })}
        />
      )}
      {value.mode === 'size' && (
        <Select
          label={t('settings.storage.sizeLimit')}
          value={String(value.megabytes)}
          options={CACHE_MEGABYTES.map((mb) => [String(mb), `${mb} MB`] as const)}
          onChange={(megabytes) => set({ megabytes: Number(megabytes) })}
        />
      )}
      <Row label={t('settings.storage.usage')} group>
        <span className="flex items-center gap-3">
          <span data-testid="cache-size" className="text-fg-muted tabular-nums">
            {bytes === undefined ? '…' : formatBytes(bytes)}
          </span>
          <button
            type="button"
            onClick={() => void clearCache().then(refresh)}
            className="rounded-full bg-surface-raised px-3 py-1 text-[13px] text-fg transition-colors hover:bg-fill-hover"
          >
            {t('settings.storage.clear')}
          </button>
        </span>
      </Row>
    </Group>
  );
}
