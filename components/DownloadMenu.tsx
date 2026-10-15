import { Captions, Download, FileText, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SubtitleFormat } from '@/lib/subtitles';
import type { SubtitleStatus } from '@/lib/types';
import { IconButton } from './IconButton';

function Item({ icon: Icon, label, disabled, onClick }: { icon: LucideIcon; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-fg transition-colors enabled:hover:bg-fill-hover disabled:opacity-40"
    >
      <Icon className="size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
      {label}
    </button>
  );
}

/** The top bar's download menu: the conversation as Markdown, and the video's subtitles. */
export function DownloadMenu({
  canExport,
  onExport,
  subtitles: status,
  pending,
  onDownloadSubtitles,
  onOpenSettings,
}: {
  canExport: boolean;
  onExport: () => void;
  subtitles: SubtitleStatus;
  /** Subtitles will download when their transcription finishes. */
  pending: boolean;
  onDownloadSubtitles: (format: SubtitleFormat) => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const subtitles = typeof status === 'object' ? 'transcribe' : status;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const subtitleNote =
    subtitles === undefined ? t('download.checking') : subtitles === 'transcribe' ? t('download.willTranscribe') : undefined;

  return (
    <div ref={ref} className="relative">
      <IconButton icon={Download} label={t('download.menu')} onClick={() => setOpen(!open)} />
      {pending && <span className="pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-accent" />}
      {open && (
        <div
          role="menu"
          className="absolute top-9 right-0 z-20 w-64 space-y-0.5 rounded-2xl border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.12)]"
        >
          <Item icon={FileText} label={t('download.conversation')} disabled={!canExport} onClick={run(onExport)} />
          <Item
            icon={Captions}
            label={t('download.srt')}
            disabled={subtitles === undefined || subtitles === 'off'}
            onClick={run(() => onDownloadSubtitles('srt'))}
          />
          <Item
            icon={Captions}
            label={t('download.txt')}
            disabled={subtitles === undefined || subtitles === 'off'}
            onClick={run(() => onDownloadSubtitles('txt'))}
          />
          {subtitleNote && <p className="px-3 pt-1 pb-2 text-xs leading-relaxed text-fg-muted">{subtitleNote}</p>}
          {subtitles === 'off' && (
            <p className="px-3 pt-1 pb-2 text-xs leading-relaxed text-fg-muted">
              {t('download.transcriptionOff')}{' '}
              <button type="button" onClick={run(onOpenSettings)} className="text-accent hover:underline">
                {t('download.openSettings')}
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
