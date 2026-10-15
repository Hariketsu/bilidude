import { useState } from 'react';
import { AtSign, ChevronRight } from 'lucide-react';
import type { AsrProgress } from '@/lib/asr/transcribe';
import type { AnswerPhase, VideoRef } from '@/lib/types';
import { AttachmentPill } from './AttachmentCard';

function describe(progress: AsrProgress | undefined): string {
  if (!progress || progress.stage === 'downloading') {
    const percent = progress ? Math.round(progress.fraction * 100) : 0;
    return percent > 0 ? `Downloading audio · ${percent}%` : 'Downloading audio';
  }
  return `Transcribing audio · ${progress.done}/${progress.total}`;
}

/** Only the end of a long reasoning stream is visible; rendering all of it every frame is wasted work. */
const THINKING_TAIL_CHARS = 600;

export function ThinkingSteps({
  phase,
  video,
  asrProgress,
  thinking,
}: {
  phase: AnswerPhase;
  video: VideoRef;
  asrProgress?: AsrProgress;
  /** The model's reasoning so far, shown live while it thinks. */
  thinking?: string;
}) {
  return (
    <div className="space-y-4 text-[15px]">
      <div className="shimmer-text font-medium">{phase === 'transcribing' ? 'Transcribing…' : 'Thinking…'}</div>
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-medium text-fg-muted">
          <AtSign className="size-[18px]" strokeWidth={1.75} />
          Reading 1 attachment
        </div>
        <div className="pl-7">
          <AttachmentPill video={video} />
        </div>
      </div>
      {phase === 'transcribing' && (
        <div className="space-y-1 pl-7 text-sm text-fg-muted">
          <div>No subtitles, so the audio is being transcribed.</div>
          <div data-testid="asr-progress" className="tabular-nums">
            {describe(asrProgress)}
          </div>
        </div>
      )}
      {phase === 'thinking' && thinking && (
        <div
          data-testid="thinking-preview"
          className="flex max-h-[4.5rem] flex-col justify-end overflow-hidden pl-7 text-sm leading-6 whitespace-pre-wrap text-fg-muted [mask-image:linear-gradient(to_bottom,transparent,black_70%)]"
        >
          <div>{thinking.slice(-THINKING_TAIL_CHARS)}</div>
        </div>
      )}
    </div>
  );
}

export function ThoughtSummary({ thoughtMs, thinking }: { thoughtMs: number; thinking?: string }) {
  const [open, setOpen] = useState(false);
  const seconds = Math.max(1, Math.round(thoughtMs / 1000));
  return (
    <div>
      <button
        type="button"
        disabled={!thinking}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[15px] font-medium text-fg-muted enabled:hover:text-fg"
      >
        Thought for {seconds} {seconds === 1 ? 'second' : 'seconds'}
        {thinking && <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />}
      </button>
      {open && thinking && (
        <div className="mt-2 border-l-2 border-border pl-4 text-sm leading-6 whitespace-pre-wrap text-fg-muted">
          {thinking}
        </div>
      )}
    </div>
  );
}
