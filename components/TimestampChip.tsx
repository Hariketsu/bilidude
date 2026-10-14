import { Play } from 'lucide-react';
import { formatTimestamp } from '@/lib/timestamp';

export function TimestampChip({ seconds, onSeek }: { seconds: number; onSeek?: (seconds: number) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSeek?.(seconds)}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1.5 rounded-full bg-surface-raised py-0.5 pr-2.5 pl-1.5 align-middle text-xs leading-none text-fg/75 tabular-nums transition-colors hover:bg-fill-hover"
    >
      <span className="flex h-3 w-4 items-center justify-center rounded-[3px] bg-bili">
        <Play className="size-2 fill-white text-white" />
      </span>
      {formatTimestamp(seconds)}
    </button>
  );
}
