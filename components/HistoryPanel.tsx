import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveAsr } from '@/lib/asr/providers';
import { watchTranscription, type AsrProgress } from '@/lib/asr/transcribe';
import { runExport } from '@/lib/batchExport';
import { deleteSession, listSessions, type Session } from '@/lib/db';
import { t } from '@/lib/i18n';
import { saveSettings, type Settings } from '@/lib/settings';
import { BiliIcon } from './BiliIcon';
import { ExportSheet, type ExportChoice } from './ExportSheet';
import { IconButton } from './IconButton';
import { CardProgress } from './TranscriptionProgress';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 86_400_000],
  ['month', 30 * 86_400_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

function formatAgo(timestamp: number, language: string): string {
  const elapsed = Date.now() - timestamp;
  const relativeTime = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return relativeTime.format(-Math.floor(elapsed / ms), unit);
  }
  return t('history.justNow');
}

/** What the conversation started with: the preset name and/or the question. */
function firstQuestion(session: Session): string {
  const first = session.messages[0];
  if (first?.role !== 'user') return '';
  return [first.preset && t(`presets.${first.preset}`), first.text].filter(Boolean).join(' · ');
}

function HistoryItem({
  session,
  current,
  selecting,
  selected,
  onClick,
  onExport,
  onDelete,
}: {
  session: Session;
  current: boolean;
  selecting: boolean;
  selected: boolean;
  onClick: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [progress, setProgress] = useState<AsrProgress>();
  useEffect(() => watchTranscription(session.video, setProgress), [session.video.bvid, session.video.cid]);

  return (
    <li className="group relative">
      <button
        type="button"
        data-testid="history-item"
        aria-pressed={selecting ? selected : undefined}
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-fill-hover ${
          selecting ? '' : 'pr-[4.5rem]'
        } ${current && !selecting ? 'bg-surface' : ''} ${selecting && selected ? 'bg-surface' : ''}`}
      >
        {selecting && (
          <input
            type="checkbox"
            readOnly
            tabIndex={-1}
            checked={selected}
            className="pointer-events-none size-4 shrink-0 accent-accent"
          />
        )}
        {session.video.coverUrl ? (
          <img
            src={`${session.video.coverUrl}@320w_180h_1c.webp`}
            alt=""
            referrerPolicy="no-referrer"
            className="aspect-video w-24 shrink-0 rounded-lg bg-surface object-cover"
          />
        ) : (
          <div className="flex aspect-video w-24 shrink-0 items-center justify-center rounded-lg bg-surface">
            <BiliIcon className="size-6 text-bili" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="line-clamp-2 text-sm leading-snug text-fg">{session.video.title}</div>
          {progress ? (
            <div className="flex items-center gap-1.5 text-xs text-fg-muted">
              <CardProgress progress={progress} />
            </div>
          ) : (
            <div className="truncate text-xs text-fg-muted">{firstQuestion(session)}</div>
          )}
          <div className="text-xs text-fg-muted">{formatAgo(session.updatedAt, i18n.language)}</div>
        </div>
      </button>
      {!selecting && (
        <div className="absolute top-1/2 right-1 flex -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconButton icon={Download} label={t('history.export')} onClick={onExport} />
          <IconButton icon={Trash2} label={t('history.delete')} onClick={onDelete} />
        </div>
      )}
    </li>
  );
}

export function HistoryPanel({
  currentSessionId,
  settings,
  onOpen,
  onOpenSettings,
  onClose,
}: {
  currentSessionId: string;
  settings: Settings;
  onOpen: (session: Session) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** The sessions the download sheet is for. */
  const [exporting, setExporting] = useState<Session[]>();
  /** While a download runs: how far its transcriptions have got. */
  const [job, setJob] = useState<{ done: number; total: number } | 'running'>();
  const [notice, setNotice] = useState<string>();
  /** Sessions waiting for the user to confirm their deletion. */
  const [deleting, setDeleting] = useState<string[]>();
  const controller = useRef<AbortController>(undefined);
  const asr = resolveAsr(settings.asr);

  useEffect(() => {
    void listSessions().then(setSessions);
  }, []);

  const remove = async (ids: string[]) => {
    await Promise.all(ids.map(deleteSession));
    setSessions((prev) => prev?.filter((s) => !ids.includes(s.id)));
    setSelected(new Set());
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const start = async (targets: Session[], { formats, bundle, transcribe }: ExportChoice) => {
    setExporting(undefined);
    setSelecting(false);
    setSelected(new Set());
    setNotice(undefined);
    if (bundle !== settings.exportBundle) void saveSettings({ ...settings, exportBundle: bundle });
    controller.current = new AbortController();
    setJob('running');
    try {
      const { skipped, failed } = await runExport({
        sessions: targets,
        formats,
        bundle,
        asr: transcribe ? asr : undefined,
        links: settings.exportLinks,
        signal: controller.current.signal,
        onTranscribing: (done, total) => setJob({ done, total }),
      });
      const notes = [
        skipped > 0 && t('history.skipped', { count: skipped }),
        failed > 0 && t('history.failed', { count: failed }),
      ].filter(Boolean);
      setNotice(notes.join(' · ') || undefined);
    } finally {
      setJob(undefined);
    }
  };

  const chosen = sessions?.filter((s) => selected.has(s.id)) ?? [];
  const allSelected = !!sessions && sessions.length > 0 && chosen.length === sessions.length;

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <IconButton icon={ArrowLeft} label={t('common.back')} onClick={onClose} />
        <h1 className="flex-1 text-[15px] font-semibold">{t('history.title')}</h1>
        {!!sessions?.length && (
          <button
            type="button"
            onClick={() => {
              setSelecting(!selecting);
              setSelected(new Set());
            }}
            className="rounded-lg px-2.5 py-1 text-sm text-fg-muted transition-colors hover:bg-fill-hover hover:text-fg"
          >
            {selecting ? t('history.done') : t('history.select')}
          </button>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {sessions?.length === 0 && (
          <p className="pt-16 text-center text-sm text-fg-muted">{t('history.empty')}</p>
        )}
        <ul className="space-y-1">
          {sessions?.map((session) => (
            <HistoryItem
              key={session.id}
              session={session}
              current={session.id === currentSessionId}
              selecting={selecting}
              selected={selected.has(session.id)}
              onClick={() => (selecting ? toggle(session.id) : onOpen(session))}
              onExport={() => setExporting([session])}
              onDelete={() => setDeleting([session.id])}
            />
          ))}
        </ul>
      </div>

      {(selecting || job || notice) && (
        <footer
          data-testid="history-bar"
          className="flex min-h-14 shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-sm"
        >
          {job ? (
            <>
              <div className="min-w-0 flex-1">
                {typeof job === 'object' && (
                  <div className="text-fg tabular-nums">{t('history.transcribing', { done: job.done + 1, total: job.total })}</div>
                )}
                <div className="text-xs text-fg-muted">{t('history.keepOpen')}</div>
              </div>
              <button
                type="button"
                onClick={() => controller.current?.abort()}
                className="rounded-full px-3 py-1.5 text-fg-muted hover:bg-fill-hover hover:text-fg"
              >
                {t('history.stop')}
              </button>
            </>
          ) : selecting ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-fg-muted">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(new Set(allSelected ? [] : sessions?.map((s) => s.id)))}
                  className="size-4 accent-accent"
                />
                {t('history.selectAll')}
              </label>
              <span className="flex-1 text-center text-xs text-fg-muted tabular-nums">
                {chosen.length > 0 && t('history.selected', { count: chosen.length })}
              </span>
              <button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => setDeleting(chosen.map((s) => s.id))}
                className="rounded-full px-3 py-1.5 text-fg-muted enabled:hover:bg-fill-hover enabled:hover:text-fg disabled:opacity-40"
              >
                {t('history.delete')}
              </button>
              <button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => setExporting(chosen)}
                className="rounded-full bg-accent px-4 py-1.5 font-medium text-white disabled:opacity-40"
              >
                {t('history.download')}
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-fg-muted">{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(undefined)}
                className="rounded-full px-3 py-1.5 text-fg-muted hover:bg-fill-hover hover:text-fg"
              >
                {t('history.done')}
              </button>
            </>
          )}
        </footer>
      )}

      {deleting && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-6" onClick={() => setDeleting(undefined)}>
          <div
            role="alertdialog"
            aria-labelledby="delete-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-72 space-y-2 rounded-3xl border border-border bg-surface p-5 shadow-[0_8px_24px_rgb(0_0_0/0.18)]"
          >
            <h2 id="delete-title" className="text-[15px] font-semibold">
              {t('history.deleteTitle', { count: deleting.length })}
            </h2>
            <p className="text-sm text-fg-muted">{t('history.deleteBody')}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                autoFocus
                onClick={() => setDeleting(undefined)}
                className="rounded-full px-4 py-2 text-sm text-fg-muted hover:bg-fill-hover hover:text-fg"
              >
                {t('history.cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void remove(deleting);
                  setDeleting(undefined);
                }}
                className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                {t('history.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {exporting && (
        <ExportSheet
          sessions={exporting}
          bundle={settings.exportBundle}
          canTranscribe={!!asr}
          onStart={(choice) => void start(exporting, choice)}
          onCancel={() => setExporting(undefined)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}
