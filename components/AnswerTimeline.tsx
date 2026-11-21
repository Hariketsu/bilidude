import { ArrowUpRight, AtSign, Atom, Check, ChevronDown, ChevronRight, FileText, Search, SearchX, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchSource } from '@/lib/search/client';
import { foundPages, stepStatus, type AnswerStep, type FindStep, type OpenStep, type SearchStep } from '@/lib/llm/steps';
import type { AssistantMessage } from '@/lib/types';
import { AttachmentPill } from './AttachmentCard';
import { BiliIcon } from './BiliIcon';
import { SiteIcons } from './SiteIcon';
import { AnswerProgress } from './TranscriptionProgress';

/** Pages shown inline in a "Read N pages" row; the rest are counted. */
const PAGES_SHOWN = 5;

/** An answer's steps; sessions before 0.4.0 only stored the thinking text. */
export function stepsOf(message: AssistantMessage): AnswerStep[] {
  return message.steps ?? (message.thinking ? [{ type: 'thinking', text: message.thinking }] : []);
}

/**
 * Everything before the answer as one timeline: reading the video (and transcribing it),
 * then thinking, searches and pages read, in order. Open while it runs; it folds into one line
 * once the answer starts, with the video and the sites it read shown as icons.
 */
export function AnswerTimeline({
  message,
  attached,
  onShowSources,
}: {
  message: AssistantMessage;
  /** The answer to the message the video came with; follow-ups reuse the transcript without reading it again. */
  attached: boolean;
  onShowSources: (sources: SearchSource[]) => void;
}) {
  const { t } = useTranslation();
  const preparing = message.status === 'streaming' && message.phase !== 'writing';
  const [open, setOpen] = useState(preparing);
  useEffect(() => {
    if (!preparing) setOpen(false);
  }, [preparing]);

  const steps = stepsOf(message);
  const last = steps.at(-1);
  const lastRunning = last && last.type !== 'thinking' && stepStatus(last) === 'running';
  let title: string;
  if (preparing) {
    title =
      message.phase === 'transcribing'
        ? t('answer.timeline.transcribing')
        : message.phase === 'reading' && attached
          ? t('answer.timeline.reading')
          : lastRunning
            ? t(last.type === 'search' ? 'answer.timeline.searching' : 'answer.timeline.browsing')
            : t('answer.timeline.thinking');
  } else if (message.thoughtMs !== undefined) {
    title = t('answer.thoughtFor', { count: Math.max(1, Math.round(message.thoughtMs / 1000)) });
  } else {
    title = t('answer.timeline.stopped');
  }
  const pages = foundPages(steps);
  // A follow-up only shows the video while it is being transcribed (after an earlier answer was stopped).
  const showVideo = attached || (preparing && message.phase === 'transcribing');

  const items: ReactNode[] = [
    showVideo && <Row key="attachment" testId="attachment-step" icon={<AtSign className="size-4" strokeWidth={1.75} />}>
      <span className={preparing && message.phase !== 'thinking' ? 'shimmer-text' : ''}>
        {t(preparing && message.phase !== 'thinking' ? 'answer.readingAttachment' : 'answer.readAttachment')}
      </span>
      <div className="mt-1 mb-1">
        <AttachmentPill video={message.video} />
      </div>
      {message.phase === 'transcribing' && preparing && (
        <div className="mt-2 mb-1">
          <AnswerProgress progress={message.asrProgress} />
        </div>
      )}
    </Row>,
    ...steps.map((step, i) => (
      <StepItem key={i} step={step} live={preparing && i === steps.length - 1} onShowSources={onShowSources} />
    )),
  ].filter(Boolean);

  return (
    <div data-testid="timeline" data-open={open} className="mb-4">
      <button
        type="button"
        aria-expanded={open}
        disabled={!items.length}
        onClick={() => setOpen(!open)}
        className="flex max-w-full items-center gap-1.5 text-[15px] font-medium text-fg-muted enabled:hover:text-fg"
      >
        <Atom className={`size-[18px] shrink-0 ${preparing ? 'text-accent' : ''}`} strokeWidth={1.75} />
        <span data-testid="timeline-title" className={`truncate ${preparing ? 'shimmer-text' : ''}`}>
          {title}
        </span>
        {!open && !preparing && (showVideo || pages.length > 0) && (
          <span className="ml-0.5 flex">
            <SiteIcons pages={pages} lead={showVideo && <BiliIcon className="m-auto size-3 text-bili" />} />
          </span>
        )}
        {items.length > 0 && (open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />)}
      </button>
      {open && items.length > 0 && (
        <div className="mt-2">
          {items.map((item, i) => (
            <div key={i} className="relative">
              {item}
              {/* The line joining this step to the next. */}
              {i < items.length - 1 && <span className="absolute top-[26px] bottom-0.5 left-2 w-px bg-fg-muted/25" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A step with an icon in the timeline's gutter. */
function Row({ icon, testId, children }: { icon: ReactNode; testId?: string; children: ReactNode }) {
  return (
    <div data-testid={testId} className="relative pb-2 pl-[26px] text-sm leading-7 text-fg-muted">
      <span className="absolute top-1.5 left-0 flex text-fg-muted">{icon}</span>
      {children}
    </div>
  );
}

function StepItem({ step, live, onShowSources }: { step: AnswerStep; live: boolean; onShowSources: (sources: SearchSource[]) => void }) {
  switch (step.type) {
    case 'thinking':
      return (
        <div data-testid="thinking-step" className="relative pb-2 pl-[26px]">
          <span className="absolute top-[9.5px] left-[5.5px] flex size-[5px]">
            <span className={`size-full rounded-full ${live ? 'animate-pulse bg-accent' : 'bg-fg-muted/60'}`} />
          </span>
          <div className="text-[13px] leading-6 whitespace-pre-wrap text-fg-muted">{step.text.trim()}</div>
        </div>
      );
    case 'search':
      return <SearchRow step={step} onShowSources={onShowSources} />;
    case 'open':
      return <OpenRow step={step} />;
    case 'find':
      return <FindRow step={step} />;
  }
}

/** Cycles through a running search's queries, one every two seconds. */
function useRotating(items: string[], active: boolean): string | undefined {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || items.length < 2) return;
    const timer = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(timer);
  }, [active, items.length]);
  return items.length ? items[tick % items.length] : undefined;
}

function SearchRow({ step, onShowSources }: { step: SearchStep; onShowSources: (sources: SearchSource[]) => void }) {
  const { t } = useTranslation();
  const status = stepStatus(step);
  const query = useRotating(step.queries, status === 'running');
  const count = step.sources.length;
  const clickable = status !== 'running' && count > 0;

  let body: ReactNode;
  if (status === 'running') {
    body = (
      <>
        <span className="shrink-0 shimmer-text">{t('answer.search.searching')}</span>
        {query && (
          <span key={query} className="ml-1.5 min-w-0 animate-[fade-in_0.3s] truncate">
            {query}
          </span>
        )}
      </>
    );
  } else if (status === 'failed') {
    body = t('answer.search.failed');
  } else if (count === 0) {
    body = t('answer.search.none');
  } else {
    body = (
      <>
        <span className="shrink-0 tabular-nums">{t(step.deep ? 'answer.search.found' : 'answer.search.read', { count })}</span>
        <span className="ml-1.5 flex">
          <SiteIcons pages={step.sources} />
        </span>
      </>
    );
  }
  const Icon = status === 'failed' ? SearchX : Search;
  return (
    <div data-testid="search-step" className="relative pb-2 pl-[26px] text-sm text-fg-muted">
      <span className="absolute top-1.5 left-0 flex">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <button
        type="button"
        disabled={!clickable}
        onClick={() => onShowSources(step.sources)}
        title={step.queries.join(' · ')}
        className="-mx-2 flex h-7 max-w-[calc(100%+1rem)] min-w-0 items-center rounded-full px-2 text-left transition-colors enabled:hover:bg-fill-hover enabled:hover:text-fg"
      >
        {body}
      </button>
    </div>
  );
}

function OpenRow({ step }: { step: OpenStep }) {
  const { t } = useTranslation();
  const ok = step.pages.filter((p) => p.status !== 'failed');
  if (!ok.length) return <Row icon={<FileText className="size-4" strokeWidth={1.75} />}>{t('answer.open.failed')}</Row>;
  return (
    <Row icon={<FileText className="size-4" strokeWidth={1.75} />}>
      <div data-testid="open-step" className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`shrink-0 ${stepStatus(step) === 'running' ? 'shimmer-text' : ''}`}>{t('answer.open.read', { count: ok.length })}</span>
        {ok.slice(0, PAGES_SHOWN).map((page) => (
          <a
            key={page.id}
            href={page.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full min-w-0 items-center gap-0.5 text-[13px] leading-6 hover:text-fg"
          >
            <span className="truncate underline decoration-fg-muted/50 decoration-dotted underline-offset-4">{page.title}</span>
            <ArrowUpRight className="size-3.5 shrink-0" />
          </a>
        ))}
        {ok.length > PAGES_SHOWN && <span className="text-[13px]">+{ok.length - PAGES_SHOWN}</span>}
      </div>
    </Row>
  );
}

function FindRow({ step }: { step: FindStep }) {
  const { t } = useTranslation();
  return (
    <Row icon={<FileText className="size-4" strokeWidth={1.75} />}>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 shrink-0">{t('answer.find')}</span>
        {step.patterns.map((item) => (
          <span
            key={item.id}
            className={`inline-flex h-5 max-w-56 items-center gap-0.5 rounded-md bg-surface-raised px-1.5 text-[13px] leading-5 ${item.status === 'failed' ? 'opacity-60' : ''}`}
          >
            {item.status === 'done' && <Check className="size-3 shrink-0" />}
            {item.status === 'failed' && <X className="size-3 shrink-0" />}
            <span className="truncate">{item.pattern}</span>
          </span>
        ))}
      </div>
    </Row>
  );
}
