import { Copy, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trimPartialTimestamp } from '@/lib/render/timestamp';
import type { TranscriptCheck } from '@/lib/render/transcriptCheck';
import { formatAnswer } from '@/lib/export/session';
import type { SearchSource } from '@/lib/search/client';
import { foundPages } from '@/lib/llm/steps';
import { withSources } from '@/lib/search/sources';
import { useTypewriter } from './useTypewriter';
import type { AssistantMessage as AssistantMsg, SubtitleStatus, UserMessage as UserMsg } from '@/lib/types';
import { AttachmentCard } from './AttachmentCard';
import { IconButton } from './IconButton';
import { Markdown } from './Markdown';
import { PresetChip } from './PresetChip';
import { AnswerTimeline, stepsOf } from './AnswerTimeline';
import { SignInAgainButton } from './DeepseekAccount';
import { SourcesPill } from './SearchResults';

export function UserMessage({
  message,
  subtitles,
  showProgress,
  subtitleError,
}: {
  message: UserMsg;
  subtitles?: SubtitleStatus;
  /** Only when no answer is showing the transcription already. */
  showProgress: boolean;
  subtitleError?: string;
}) {
  return (
    <div className="flex flex-col items-end gap-4">
      {message.video && (
        <AttachmentCard video={message.video} subtitles={subtitles} showProgress={showProgress} error={subtitleError} />
      )}
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
  transcriptCheck,
  exportLinks,
  onSeek,
  onRegenerate,
  onShowSources,
  attached,
}: {
  message: AssistantMsg;
  /** Answers the message the video was attached to. */
  attached: boolean;
  transcriptCheck?: TranscriptCheck;
  /** Copy timestamps as links to the video. */
  exportLinks: boolean;
  onSeek?: (seconds: number) => void;
  onRegenerate?: () => void;
  /** Opens a list of web pages over the panel. */
  onShowSources: (sources: SearchSource[]) => void;
}) {
  const { t } = useTranslation();
  const shown = useTypewriter(message.text, message.status === 'streaming');
  // Still streaming on screen until the reveal catches up with the received text.
  const streaming = message.status === 'streaming' || shown !== message.text;
  const preparing = message.status === 'streaming' && message.phase !== 'writing';
  const text = streaming ? trimPartialTimestamp(shown) : message.text;
  const pages = foundPages(stepsOf(message));

  return (
    <div data-testid="answer" data-status={streaming ? 'streaming' : message.status}>
      {(preparing || message.thoughtMs !== undefined) && <AnswerTimeline message={message} attached={attached} onShowSources={onShowSources} />}
      {!preparing && (
        <>
          {text && <Markdown text={text} transcriptCheck={transcriptCheck} sources={message.sources} onSeek={onSeek} />}
          {pages.length > 0 && !streaming && <SourcesPill sources={pages} onOpen={() => onShowSources(pages)} />}
          {message.status === 'aborted' && <p className="mt-2 text-sm text-fg-muted">{t('answer.stopped')}</p>}
          {message.error && <AnswerError error={message.error} detail={message.errorDetail} />}
          {message.signInAgain && <SignInAgainButton />}
          {!streaming && (
            <div className="mt-3 flex gap-1">
              {text && (
                <IconButton icon={Copy} label={t('answer.copy')} onClick={() =>
                    navigator.clipboard.writeText(
                      withSources(formatAnswer(message.text, message.video, { links: exportLinks, transcriptCheck }), message.sources, t('answer.sources')),
                    )
                  } />
              )}
              <IconButton icon={RotateCw} label={t('answer.regenerate')} onClick={onRegenerate} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The friendly message; the original error behind it opens on request. */
function AnswerError({ error, detail }: { error: string; detail?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="answer-error" className="mt-2 text-[15px] text-fg-muted">
      <p>
        {error}
        {detail && (
          <button type="button" className="ml-2 text-sm underline underline-offset-2 hover:text-fg" onClick={() => setOpen(!open)}>
            {t('answer.errorDetails')}
          </button>
        )}
      </p>
      {open && detail && <p className="mt-1 text-sm break-words whitespace-pre-wrap">{detail}</p>}
    </div>
  );
}
