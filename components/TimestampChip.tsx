import { formatTimestamp } from '@/lib/timestamp';
import { BiliIcon } from './BiliIcon';

export function TimestampChip({ seconds, onSeek }: { seconds: number; onSeek?: (seconds: number) => void }) {
  return (
    <button
      type="button"
      data-seconds={seconds}
      onClick={() => onSeek?.(seconds)}
      className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1.5 rounded-full bg-surface-raised py-0.5 pr-2.5 pl-2 align-middle text-xs leading-none text-fg/75 tabular-nums transition-colors group hover:bg-fill-hover"
    >
      {/* Neutral until hovered, so a page of timestamps doesn't turn into a wall of logos. */}
      <BiliIcon className="size-3.5 text-fg-muted transition-colors group-hover:text-bili" />
      {formatTimestamp(seconds)}
    </button>
  );
}
