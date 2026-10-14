import { getPreset } from '@/lib/presets';
import type { PresetId } from '@/lib/types';

export function PresetChip({
  id,
  size = 'md',
  onClick,
}: {
  id: PresetId;
  size?: 'sm' | 'md';
  onClick?: () => void;
}) {
  const { label, icon: Icon } = getPreset(id);
  const sizing = size === 'sm' ? 'gap-1.5 px-3 py-1.5 text-[13px]' : 'gap-2 px-4 py-2 text-sm font-medium';
  const className = `inline-flex shrink-0 items-center rounded-full ${sizing}`;

  if (!onClick) {
    return (
      <span className={`${className} bg-surface-raised text-fg`}>
        <Icon className="size-4" />
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} bg-surface text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
