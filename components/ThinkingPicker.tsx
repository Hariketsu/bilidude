import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import { Brain, ChevronDown } from 'lucide-react';

export const THINKING_LABELS: Record<ModelThinkingLevel, string> = {
  off: 'Off',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

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
  const on = value !== 'off';
  return (
    <label
      title="Thinking"
      className={`relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-sm transition-colors ${
        on ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg'
      }`}
    >
      <Brain className="size-4" strokeWidth={1.75} />
      <span>{THINKING_LABELS[value]}</span>
      <ChevronDown className="size-3.5 opacity-60" />
      <select
        aria-label="Thinking"
        value={value}
        onChange={(e) => onChange(e.target.value as ModelThinkingLevel)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {levels.map((level) => (
          <option key={level} value={level}>
            {THINKING_LABELS[level]}
          </option>
        ))}
      </select>
    </label>
  );
}
