import type { VideoRef } from '@/lib/types';
import { BiliIcon } from './BiliIcon';

export function AttachmentCard({ video }: { video: VideoRef }) {
  return (
    <div className="flex w-fit max-w-64 items-center gap-3 rounded-2xl bg-surface-raised p-2 pr-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-icon-tile">
        <BiliIcon className="size-6 text-bili" />
      </div>
      <div className="min-w-0 text-sm leading-tight">
        <div className="truncate text-fg">{video.title}</div>
        <div className="text-fg-muted">bilibili.com</div>
      </div>
    </div>
  );
}

/** Compact inline form used inside the "Reading 1 attachment" step. */
export function AttachmentPill({ video }: { video: VideoRef }) {
  return (
    <span className="inline-flex max-w-56 items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm text-fg-muted">
      <BiliIcon className="size-4 shrink-0 text-bili" />
      <span className="truncate">{video.title}</span>
    </span>
  );
}
