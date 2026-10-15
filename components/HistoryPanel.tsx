import { ArrowLeft, Download, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteSession, listSessions, type Session } from '@/lib/db';
import { t } from '@/lib/i18n';
import { BiliIcon } from './BiliIcon';
import { IconButton } from './IconButton';

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

export function HistoryPanel({
  currentSessionId,
  onOpen,
  onExport,
  onClose,
}: {
  currentSessionId: string;
  onOpen: (session: Session) => void;
  onExport: (session: Session) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [sessions, setSessions] = useState<Session[]>();

  useEffect(() => {
    void listSessions().then(setSessions);
  }, []);

  const remove = async (id: string) => {
    await deleteSession(id);
    setSessions((prev) => prev?.filter((s) => s.id !== id));
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <IconButton icon={ArrowLeft} label={t('common.back')} onClick={onClose} />
        <h1 className="text-[15px] font-semibold">{t('history.title')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {sessions?.length === 0 && (
          <p className="pt-16 text-center text-sm text-fg-muted">{t('history.empty')}</p>
        )}
        <ul className="space-y-1">
          {sessions?.map((session) => (
            <li key={session.id} className="group relative">
              <button
                type="button"
                data-testid="history-item"
                onClick={() => onOpen(session)}
                className={`flex w-full items-center gap-3 rounded-xl p-2 pr-[4.5rem] text-left transition-colors hover:bg-fill-hover ${
                  session.id === currentSessionId ? 'bg-surface' : ''
                }`}
              >
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
                  <div className="truncate text-xs text-fg-muted">{firstQuestion(session)}</div>
                  <div className="text-xs text-fg-muted">{formatAgo(session.updatedAt, i18n.language)}</div>
                </div>
              </button>
              <div className="absolute top-1/2 right-1 flex -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <IconButton icon={Download} label={t('history.export')} onClick={() => onExport(session)} />
                <IconButton icon={Trash2} label={t('history.delete')} onClick={() => void remove(session.id)} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
