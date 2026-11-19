import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Web search on or off, next to the thinking picker. */
export function SearchToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-label={t('composer.webSearch')}
      aria-pressed={on}
      title={t('composer.webSearch')}
      onClick={() => onChange(!on)}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
        on ? 'bg-accent/10 text-accent' : 'text-fg-muted hover:bg-surface-raised hover:text-fg'
      }`}
    >
      <Globe className="size-4" strokeWidth={1.75} />
    </button>
  );
}
