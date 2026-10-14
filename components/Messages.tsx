import { Copy, RotateCw } from 'lucide-react';
import { trimPartialTimestamp } from '@/lib/timestamp';
import type { Message } from '@/lib/types';
import { AttachmentCard } from './AttachmentCard';
import { IconButton } from './IconButton';
import { Markdown } from './Markdown';
import { PresetChip } from './PresetChip';
import { ThinkingSteps, ThoughtSummary } from './ThinkingSteps';

export function UserMessage({ message }: { message: Extract<Message, { role: 'user' }> }) {
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
  onSeek,
  onRegenerate,
}: {
  message: Extract<Message, { role: 'assistant' }>;
  onSeek?: (seconds: number) => void;
  onRegenerate?: () => void;
}) {
  const streaming = message.status === 'streaming';
  const preparing = streaming && message.phase !== 'writing';
  const text = streaming ? trimPartialTimestamp(message.text) : message.text;

  return (
    <div>
      {preparing ? (
        <ThinkingSteps phase={message.phase ?? 'reading'} video={message.video} />
      ) : (
        <>
          {message.thoughtMs !== undefined && <ThoughtSummary thoughtMs={message.thoughtMs} />}
          {message.status === 'error' ? (
            <p className="text-[15px] text-fg-muted">{message.text}</p>
          ) : (
            <Markdown text={text} onSeek={onSeek} />
          )}
          {message.status === 'aborted' && <p className="mt-2 text-sm text-fg-muted">Stopped.</p>}
          {!streaming && (
            <div className="mt-3 flex gap-1">
              <IconButton icon={Copy} label="Copy" onClick={() => navigator.clipboard.writeText(message.text)} />
              <IconButton icon={RotateCw} label="Regenerate" onClick={onRegenerate} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
