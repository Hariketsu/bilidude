import { AtSign, ChevronRight } from 'lucide-react';
import type { AnswerPhase, VideoRef } from '@/lib/types';
import { AttachmentPill } from './AttachmentCard';

export function ThinkingSteps({ phase, video }: { phase: AnswerPhase; video: VideoRef }) {
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
    </div>
  );
}

export function ThoughtSummary({ thoughtMs }: { thoughtMs: number }) {
  const seconds = Math.max(1, Math.round(thoughtMs / 1000));
  return (
    <button type="button" className="flex items-center gap-1 text-[15px] font-medium text-fg-muted hover:text-fg">
      Thought for {seconds} {seconds === 1 ? 'second' : 'seconds'}
      <ChevronRight className="size-4" />
    </button>
  );
}
