import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadTranscripts, uniqueVideos, type ExportBundle, type ExportFormat } from '@/lib/batchExport';
import type { Session } from '@/lib/db';
import type { VideoRef } from '@/lib/types';

const FORMATS = [
  { id: 'md', label: 'download.conversation' },
  { id: 'srt', label: 'download.srt' },
  { id: 'txt', label: 'download.txt' },
] as const satisfies { id: ExportFormat; label: string }[];

export interface ExportChoice {
  formats: ExportFormat[];
  bundle: ExportBundle;
  transcribe: boolean;
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm text-fg">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-accent" />
      {children}
    </label>
  );
}

/** What to download from the history: formats, what to do about videos without subtitles, and how to deliver. */
export function ExportSheet({
  sessions,
  bundle: initialBundle,
  canTranscribe,
  onStart,
  onCancel,
  onOpenSettings,
}: {
  sessions: Session[];
  bundle: ExportBundle;
  canTranscribe: boolean;
  onStart: (choice: ExportChoice) => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  const [formats, setFormats] = useState<ExportFormat[]>(['md']);
  const [bundle, setBundle] = useState(initialBundle);
  const [transcribe, setTranscribe] = useState(false);
  /** Videos only a transcription would get subtitles for; `undefined` while checking. */
  const [missing, setMissing] = useState<VideoRef[]>();
  const wantsSubtitles = formats.some((f) => f !== 'md');

  useEffect(() => {
    if (!wantsSubtitles) return;
    let current = true;
    const videos = uniqueVideos(sessions);
    void loadTranscripts(videos).then(
      (transcripts) => current && setMissing(videos.filter((v) => transcripts.get(`${v.bvid}:${v.cid}`) === null)),
    );
    return () => {
      current = false;
    };
  }, [wantsSubtitles]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggle = (id: ExportFormat) => (on: boolean) =>
    setFormats((prev) => FORMATS.map((f) => f.id).filter((f) => (f === id ? on : prev.includes(f))));
  const minutes = Math.max(1, Math.round((missing ?? []).reduce((sum, v) => sum + v.durationSec, 0) / 60));
  const severalFiles = sessions.length > 1 || formats.length > 1;

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/30" onClick={onCancel}>
      <div
        role="dialog"
        data-testid="export-sheet"
        onClick={(e) => e.stopPropagation()}
        className="space-y-3 rounded-t-3xl border-t border-border bg-surface p-4 pb-5 shadow-[0_-8px_24px_rgb(0_0_0/0.12)]"
      >
        <h2 className="text-[15px] font-semibold">{t('history.downloadTitle', { count: sessions.length })}</h2>
        <div>
          {FORMATS.map(({ id, label }) => (
            <Check key={id} checked={formats.includes(id)} onChange={toggle(id)}>
              {t(label)}
            </Check>
          ))}
        </div>

        {wantsSubtitles && (missing === undefined || missing.length > 0) && (
          <div className="space-y-1 border-t border-border pt-3 text-sm text-fg-muted">
            {missing === undefined ? (
              <p>{t('download.checking')}</p>
            ) : canTranscribe ? (
              <>
                <p>{t('history.missing', { count: missing.length, minutes })}</p>
                <Check checked={transcribe} onChange={setTranscribe}>
                  {t('history.transcribeFirst')}
                </Check>
              </>
            ) : (
              <p>
                {t('history.missingOff', { count: missing.length })}{' '}
                <button type="button" onClick={onOpenSettings} className="text-accent hover:underline">
                  {t('download.openSettings')}
                </button>
              </p>
            )}
          </div>
        )}

        {severalFiles && (
          <div className="flex gap-1 rounded-xl bg-fill-hover p-1 text-sm">
            {(['zip', 'files'] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={bundle === id}
                onClick={() => setBundle(id)}
                className={`flex-1 rounded-lg py-1.5 transition-colors ${bundle === id ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
              >
                {t(`history.${id}`)}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm text-fg-muted hover:bg-fill-hover hover:text-fg">
            {t('history.cancel')}
          </button>
          <button
            type="button"
            disabled={formats.length === 0 || (wantsSubtitles && missing === undefined)}
            onClick={() => onStart({ formats, bundle, transcribe: canTranscribe && transcribe })}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-40"
          >
            {t('history.download')}
          </button>
        </div>
      </div>
    </div>
  );
}
