import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { asrPercent, type AsrProgress } from '@/lib/asr/transcribe';

/** How much of the next chunk's share the number may creep through before that chunk lands. */
const CREEP_LIMIT = 0.9;

/**
 * The overall percentage, eased forward while chunks are in flight so it doesn't sit still
 * for a whole chunk and then jump. It never passes the next chunk's mark early.
 */
export function useAsrPercent(progress: AsrProgress | undefined): number {
  const base = progress ? asrPercent(progress) : 0;
  const ceiling =
    progress?.stage === 'transcribing' && progress.done < progress.total
      ? base + (90 / progress.total) * CREEP_LIMIT
      : base;
  const [shown, setShown] = useState(base);

  useEffect(() => {
    setShown((value) => (progress ? Math.max(value, base) : 0));
    if (ceiling <= base) return;
    const timer = setInterval(() => setShown((value) => value + (ceiling - value) * 0.04), 250);
    return () => clearInterval(timer);
  }, [base, ceiling, !!progress]);

  return Math.floor(Math.max(shown, base));
}

/** Minutes left from the pace so far; unknown until a chunk has finished. */
function minutesLeft(progress: AsrProgress | undefined): number | undefined {
  if (progress?.stage !== 'transcribing' || progress.done === 0 || progress.done >= progress.total) return;
  const perChunk = (Date.now() - progress.startedAt) / progress.done;
  return Math.ceil((perChunk * (progress.total - progress.done)) / 60_000);
}

/** A small ring; with `onCancel`, it turns into a stop button on hover. */
export function ProgressRing({ percent, onCancel }: { percent: number; onCancel?: () => void }) {
  const { t } = useTranslation();
  const circumference = 2 * Math.PI * 5;
  const ring = (
    <svg viewBox="0 0 14 14" className={`size-3.5 -rotate-90 text-accent ${onCancel ? 'group-hover:hidden' : ''}`}>
      <circle cx="7" cy="7" r="5" fill="none" strokeWidth="2" className="stroke-fill-hover" />
      <circle
        cx="7"
        cy="7"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
        className="transition-[stroke-dasharray] duration-300"
      />
    </svg>
  );
  if (!onCancel) return ring;
  return (
    <button type="button" onClick={onCancel} aria-label={t('attachment.cancel')} title={t('attachment.cancel')} className="group">
      {ring}
      <X className="hidden size-3.5 text-fg group-hover:block" strokeWidth={2.25} />
    </button>
  );
}

/** The attachment card's second line while its audio is transcribed. */
export function CardProgress({ progress, onCancel }: { progress: AsrProgress; onCancel?: () => void }) {
  const { t } = useTranslation();
  const percent = useAsrPercent(progress);
  return (
    <>
      <ProgressRing percent={percent} onCancel={onCancel} />
      <span data-testid="card-progress" className="tabular-nums">
        {t('attachment.transcribing', { percent })}
      </span>
    </>
  );
}

/** The answer's transcription step: what's happening, the percentage, and a thin bar. */
export function AnswerProgress({ progress }: { progress: AsrProgress | undefined }) {
  const { t } = useTranslation();
  const percent = useAsrPercent(progress);
  const minutes = minutesLeft(progress);
  return (
    <div data-testid="asr-progress" className="space-y-2 pl-7 text-sm text-fg-muted">
      <div className="flex justify-between gap-3">
        <span>
          {t('answer.noSubtitles')}
          {minutes !== undefined && (
            <span className="opacity-75">
              {' · '}
              {minutes <= 1 ? t('answer.underAMinute') : t('answer.minutesLeft', { count: minutes })}
            </span>
          )}
        </span>
        <span className="text-fg tabular-nums">{percent}%</span>
      </div>
      <div className="h-0.5 overflow-hidden rounded-full bg-fill-hover">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
