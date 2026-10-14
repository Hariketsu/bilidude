import { ArrowUp, Square, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { getPreset } from '@/lib/presets';
import type { PresetId, VideoRef } from '@/lib/types';
import { AttachmentCard } from './AttachmentCard';

export function Composer({
  video,
  showAttachment,
  preset,
  onClearPreset,
  generating,
  onSend,
  onStop,
}: {
  video?: VideoRef;
  /** The attachment card rides along only with the first message of a session. */
  showAttachment: boolean;
  preset?: PresetId;
  onClearPreset: () => void;
  generating: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !generating && !!video && (text.trim() !== '' || !!preset);

  const send = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  const PresetIcon = preset && getPreset(preset).icon;

  return (
    <div className="rounded-3xl border border-border bg-surface p-3 shadow-[0_2px_16px_rgb(0_0_0/0.06)]">
      {video && showAttachment && (
        <div className="mb-3">
          <AttachmentCard video={video} />
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {preset && PresetIcon && (
            <button
              type="button"
              onClick={() => {
                onClearPreset();
                textareaRef.current?.focus();
              }}
              className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-surface-raised px-4 py-2 text-sm font-medium text-fg"
              title="Remove preset"
            >
              <PresetIcon className="size-4 group-hover:hidden" />
              <X className="hidden size-4 group-hover:block" />
              {getPreset(preset).label}
            </button>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            disabled={!video}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
              if (event.key === 'Backspace' && text === '' && preset) onClearPreset();
            }}
            placeholder={preset ? '' : showAttachment ? 'Ask a question about this video…' : 'Ask another question…'}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
          />
        </div>
        {generating ? (
          <button
            type="button"
            aria-label="Stop"
            onClick={onStop}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send"
            onClick={send}
            disabled={!canSend}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="size-5" strokeWidth={2.25} />
          </button>
        )}
      </div>
    </div>
  );
}
