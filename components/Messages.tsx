import { Copy, RotateCw } from 'lucide-react';
import { trimPartialTimestamp } from '@/lib/timestamp';
import type { Citations } from '@/lib/citations';
import { useTypewriter } from '@/lib/typewriter';
import type { AssistantMessage as AssistantMsg, UserMessage as UserMsg } from '@/lib/types';
import { AttachmentCard } from './AttachmentCard';
import { IconButton } from './IconButton';
import { Markdown } from './Markdown';
import { PresetChip } from './PresetChip';
import { ThinkingSteps, ThoughtSummary } from './ThinkingSteps';

export function UserMessage({ message }: { message: UserMsg }) {
  return (
    <div className="flex flex-col items-end gap-4">
      {message.video && <AttachmentCard video={message.video} />}
      {(message.preset || message.text) && (
        <div className="flex max-w-[85%] flex-col items-end gap-2">
          {message.preset && <PresetChip id={message.preset} />}
          {message.text && (
            <div className="rounded-3xl bg-surface-raised px-4 py-2.5 text-[15px] whitespace-pre-wrap text-fg">
              {message.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AssistantMessage({
  message,
  citations,
  onSeek,
  onRegenerate,
}: {
  message: AssistantMsg;
  citations?: Citations;
  onSeek?: (seconds: number) => void;
  onRegenerate?: () => void;
}) {
  const shown = useTypewriter(message.text, message.status === 'streaming');
  // Still streaming on screen until the reveal catches up with the received text.
  const streaming = message.status === 'streaming' || shown !== message.text;
  const preparing = message.status === 'streaming' && message.phase !== 'writing';
  const text = streaming ? trimPartialTimestamp(shown) : message.text;

  return (
    <div data-testid="answer" data-status={streaming ? 'streaming' : message.status}>
      {preparing ? (
        <ThinkingSteps
          phase={message.phase ?? 'reading'}
          video={message.video}
          asrProgress={message.asrProgress}
          thinking={message.thinking}
        />
      ) : (
        <>
          {message.thoughtMs !== undefined && (
            <ThoughtSummary thoughtMs={message.thoughtMs} thinking={message.thinking} />
          )}
          {text && <Markdown text={text} citations={citations} onSeek={onSeek} />}
          {message.status === 'aborted' && <p className="mt-2 text-sm text-fg-muted">Stopped.</p>}
          {message.error && (
            <p data-testid="answer-error" className="mt-2 text-[15px] text-fg-muted">
              {message.error}
            </p>
          )}
          {!streaming && (
            <div className="mt-3 flex gap-1">
              {text && (
                <IconButton icon={Copy} label="Copy" onClick={() => navigator.clipboard.writeText(message.text)} />
              )}
              <IconButton icon={RotateCw} label="Regenerate" onClick={onRegenerate} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
