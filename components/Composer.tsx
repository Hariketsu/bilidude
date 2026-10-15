import type { ModelThinkingLevel } from '@earendil-works/pi-ai';
import { ArrowUp, Square, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getPreset } from '@/lib/presets';
import type { PresetId, VideoRef } from '@/lib/types';
import { ThinkingPicker } from './ThinkingPicker';

export function Composer({
  video,
  attachment,
  preset,
  onClearPreset,
  generating,
  onSend,
  onStop,
  thinking,
}: {
  video?: VideoRef;
  /** The attachment card rides along only with the first message of a session. */
  attachment?: ReactNode;
  preset?: PresetId;
  onClearPreset: () => void;
  generating: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Shown only for models that can reason. */
  thinking?: { levels: ModelThinkingLevel[]; value: ModelThinkingLevel; onChange: (level: ModelThinkingLevel) => void };
}) {
  const { t } = useTranslation();
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
      {attachment && <div className="mb-3">{attachment}</div>}
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
              title={t('composer.removePreset')}
            >
              <PresetIcon className="size-4 group-hover:hidden" />
              <X className="hidden size-4 group-hover:block" />
              {t(`presets.${preset}`)}
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
            placeholder={preset ? '' : attachment ? t('composer.askAboutVideo') : t('composer.askAnother')}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[15px] text-fg outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
          />
        </div>
        {thinking && <ThinkingPicker {...thinking} />}
        {generating ? (
          <button
            type="button"
            aria-label={t('composer.stop')}
            onClick={onStop}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white"
          >
            <Square className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('composer.send')}
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
