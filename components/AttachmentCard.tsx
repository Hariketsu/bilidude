import { Captions, CaptionsOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubtitleStatus, VideoRef } from '@/lib/types';
import { BiliIcon } from './BiliIcon';
import { CardProgress } from './TranscriptionProgress';

/**
 * The video as an attachment. Its second line tells whether the video has subtitles and,
 * with `showProgress`, how far a running transcription has got.
 */
export function AttachmentCard({
  video,
  subtitles,
  showProgress,
  error,
  onCancel,
}: {
  video: VideoRef;
  subtitles?: SubtitleStatus;
  showProgress?: boolean;
  /** A failed transcription started from the download menu. */
  error?: string;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const progress = typeof subtitles === 'object' ? subtitles.progress : undefined;
  // A running transcription shown elsewhere still means "no subtitles yet".
  const availability = typeof subtitles === 'object' ? 'transcribe' : subtitles;

  let detail;
  if (progress && showProgress) {
    detail = <CardProgress progress={progress} onCancel={onCancel} />;
  } else if (error) {
    detail = (
      <span className="text-red-500" title={error}>
        {t('attachment.failed')}
      </span>
    );
  } else {
    const hint = availability && t(`attachment.${availability}`);
    const Icon = availability === 'ready' ? Captions : CaptionsOff;
    detail = (
      <>
        bilibili.com
        {availability && (
          <>
            <span className="opacity-60">·</span>
            <span data-testid="subtitle-icon" data-state={availability} title={hint} aria-label={hint}>
              <Icon className={`size-3.5 ${availability === 'off' ? 'text-warn' : ''}`} strokeWidth={1.75} />
            </span>
          </>
        )}
      </>
    );
  }

  return (
    <div className="flex w-fit max-w-64 items-center gap-3 rounded-2xl bg-surface-raised p-2 pr-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-icon-tile">
        <BiliIcon className="size-6 text-bili" />
      </div>
      <div className="min-w-0 text-sm leading-tight">
        <div className="truncate text-fg">{video.title}</div>
        <div className="flex h-[18px] items-center gap-1.5 whitespace-nowrap text-fg-muted">{detail}</div>
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
