import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import { Brain, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Compact thinking-level switch next to the send button; a native menu keeps it keyboard-friendly. */
export function ThinkingPicker({
  levels,
  value,
  onChange,
}: {
  levels: ModelThinkingLevel[];
  value: ModelThinkingLevel;
  onChange: (level: ModelThinkingLevel) => void;
}) {
  const { t } = useTranslation();
  const on = value !== 'off';
  return (
    <label
      title={t('thinking.label')}
      className={`relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-sm transition-colors ${
        on ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg'
      }`}
    >
      <Brain className="size-4" strokeWidth={1.75} />
      <span>{t(`thinking.levels.${value}`)}</span>
      <ChevronDown className="size-3.5 opacity-60" />
      <select
        aria-label={t('thinking.label')}
        value={value}
        onChange={(e) => onChange(e.target.value as ModelThinkingLevel)}
        className="bd-select absolute inset-0 cursor-pointer text-transparent"
      >
        {levels.map((level) => (
          <option key={level} value={level}>
            {t(`thinking.levels.${level}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
