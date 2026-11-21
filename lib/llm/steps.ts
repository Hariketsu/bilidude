import type { SearchSource } from '../search/client';

/**
 * What happened while an answer was prepared, in order: thinking, web searches, pages opened
 * and looked through. Shown as the answer's timeline.
 */
export type AnswerStep = ThinkingStep | SearchStep | OpenStep | FindStep;

export type StepStatus = 'running' | 'done' | 'failed';

export interface ThinkingStep {
  type: 'thinking';
  text: string;
}

/** One or more back-to-back searches, shown as one row. */
export interface SearchStep {
  type: 'search';
  calls: { id: string; status: StepStatus }[];
  queries: string[];
  /** Pages found, without duplicates. */
  sources: SearchSource[];
  /** A step of DeepSeek's search while thinking: it found pages, it didn't read them all. */
  deep?: boolean;
}

export interface OpenStep {
  type: 'open';
  pages: { id: string; url: string; title: string; status: StepStatus }[];
}

export interface FindStep {
  type: 'find';
  patterns: { id: string; pattern: string; status: StepStatus }[];
}

export type TimelineEvent =
  | { type: 'thinking'; delta: string }
  | { type: 'search_start'; id: string; queries: string[]; deep?: boolean }
  | { type: 'search_end'; id: string; failed?: boolean; sources: SearchSource[] }
  | { type: 'open_start'; id: string; url: string }
  | { type: 'open_end'; id: string; failed?: boolean; url?: string; title?: string }
  | { type: 'find_start'; id: string; pattern: string }
  | { type: 'find_end'; id: string; failed?: boolean };

const ended = (failed?: boolean): StepStatus => (failed ? 'failed' : 'done');

/** `steps` after `event`; calls of one kind in a row join the same step. Never mutates `steps`. */
export function applyEvent(steps: AnswerStep[], event: TimelineEvent): AnswerStep[] {
  const last = steps.at(-1);
  const replaceLast = (step: AnswerStep) => [...steps.slice(0, -1), step];
  const replace = (index: number, step: AnswerStep) => steps.map((s, i) => (i === index ? step : s));

  switch (event.type) {
    case 'thinking':
      if (!event.delta) return steps;
      return last?.type === 'thinking'
        ? replaceLast({ ...last, text: last.text + event.delta })
        : [...steps, { type: 'thinking', text: event.delta }];

    case 'search_start': {
      const call = { id: event.id, status: 'running' as const };
      return last?.type === 'search' && !!last.deep === !!event.deep
        ? replaceLast({ ...last, calls: [...last.calls, call], queries: [...last.queries, ...event.queries] })
        : [...steps, { type: 'search', calls: [call], queries: event.queries, sources: [], ...(event.deep && { deep: true }) }];
    }
    case 'search_end': {
      const index = steps.findIndex((s) => s.type === 'search' && s.calls.some((c) => c.id === event.id));
      if (index < 0) return steps;
      const step = steps[index] as SearchStep;
      const fresh = event.sources.filter((p, i, all) => all.findIndex((q) => q.url === p.url) === i);
      return replace(index, {
        ...step,
        calls: step.calls.map((c) => (c.id === event.id ? { ...c, status: ended(event.failed) } : c)),
        sources: [...step.sources, ...fresh.filter((p) => !step.sources.some((s) => s.url === p.url))],
      });
    }

    case 'open_start': {
      const page = { id: event.id, url: event.url, title: event.url, status: 'running' as const };
      return last?.type === 'open' ? replaceLast({ ...last, pages: [...last.pages, page] }) : [...steps, { type: 'open', pages: [page] }];
    }
    case 'open_end': {
      const index = steps.findIndex((s) => s.type === 'open' && s.pages.some((p) => p.id === event.id));
      if (index < 0) return steps;
      const step = steps[index] as OpenStep;
      return replace(index, {
        ...step,
        pages: step.pages.map((p) =>
          p.id === event.id
            ? { ...p, url: event.url || p.url, title: event.title || p.title, status: ended(event.failed) }
            : p,
        ),
      });
    }

    case 'find_start': {
      const item = { id: event.id, pattern: event.pattern, status: 'running' as const };
      return last?.type === 'find'
        ? replaceLast({ ...last, patterns: [...last.patterns, item] })
        : [...steps, { type: 'find', patterns: [item] }];
    }
    case 'find_end': {
      const index = steps.findIndex((s) => s.type === 'find' && s.patterns.some((p) => p.id === event.id));
      if (index < 0) return steps;
      const step = steps[index] as FindStep;
      return replace(index, {
        ...step,
        patterns: step.patterns.map((p) => (p.id === event.id ? { ...p, status: ended(event.failed) } : p)),
      });
    }
  }
}

/** Running until every call in the step ends; failed only if all of them failed. */
export function stepStatus(step: AnswerStep): StepStatus {
  const statuses =
    step.type === 'search'
      ? step.calls.map((c) => c.status)
      : step.type === 'open'
        ? step.pages.map((p) => p.status)
        : step.type === 'find'
          ? step.patterns.map((p) => p.status)
          : ['done' as const];
  if (statuses.includes('running')) return 'running';
  return statuses.every((s) => s === 'failed') ? 'failed' : 'done';
}

/** Every page the searches found, once each, in order. */
export function foundPages(steps: AnswerStep[]): SearchSource[] {
  const pages: SearchSource[] = [];
  for (const step of steps) {
    if (step.type !== 'search') continue;
    for (const page of step.sources) if (!pages.some((p) => p.url === page.url)) pages.push(page);
  }
  return pages;
}
