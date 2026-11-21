import { describe, expect, it } from 'vitest';
import { applyEvent, foundPages, stepStatus, type AnswerStep, type TimelineEvent } from '@/lib/llm/steps';
import { numberSources } from '@/lib/search/sources';

const page = (n: number) => ({ title: `Page ${n}`, url: `https://example.com/${n}` });
const reduce = (events: TimelineEvent[]) => events.reduce<AnswerStep[]>(applyEvent, []);

describe('applyEvent', () => {
  it('keeps thinking and tool calls in the order they happened', () => {
    const steps = reduce([
      { type: 'thinking', delta: 'I should ' },
      { type: 'thinking', delta: 'search.' },
      { type: 'search_start', id: 's1', queries: ['q1'] },
      { type: 'search_end', id: 's1', sources: [page(1)] },
      { type: 'thinking', delta: 'Now open it.' },
      { type: 'open_start', id: 'o1', url: page(1).url },
      { type: 'open_end', id: 'o1', title: 'Opened' },
      { type: 'thinking', delta: 'Done.' },
    ]);
    expect(steps.map((s) => s.type)).toEqual(['thinking', 'search', 'thinking', 'open', 'thinking']);
    expect(steps[0]).toEqual({ type: 'thinking', text: 'I should search.' });
    expect(steps[3]).toEqual({ type: 'open', pages: [{ id: 'o1', url: page(1).url, title: 'Opened', status: 'done' }] });
  });

  it('merges back-to-back calls of one kind into one row', () => {
    const steps = reduce([
      { type: 'search_start', id: 's1', queries: ['q1'] },
      { type: 'search_start', id: 's2', queries: ['q2'] },
      { type: 'search_end', id: 's2', sources: [page(2), page(1)] },
      { type: 'search_end', id: 's1', sources: [page(1)] },
      { type: 'open_start', id: 'o1', url: page(1).url },
      { type: 'open_start', id: 'o2', url: page(2).url },
      { type: 'open_end', id: 'o2', failed: true },
    ]);
    expect(steps).toHaveLength(2);
    const [search, open] = steps;
    expect(search).toMatchObject({ type: 'search', queries: ['q1', 'q2'], sources: [page(2), page(1)] });
    expect(stepStatus(search!)).toBe('done');
    expect(open).toMatchObject({ type: 'open', pages: [{ id: 'o1', status: 'running' }, { id: 'o2', status: 'failed' }] });
  });

  it('reports a row as running until every call in it ends, and failed only if all failed', () => {
    let steps = reduce([
      { type: 'search_start', id: 's1', queries: ['q1'] },
      { type: 'search_start', id: 's2', queries: ['q2'] },
      { type: 'search_end', id: 's1', failed: true, sources: [] },
    ]);
    expect(stepStatus(steps[0]!)).toBe('running');
    steps = applyEvent(steps, { type: 'search_end', id: 's2', failed: true, sources: [] });
    expect(stepStatus(steps[0]!)).toBe('failed');
  });

  it('finds in pages as a row of patterns', () => {
    const steps = reduce([
      { type: 'find_start', id: 'f1', pattern: '330' },
      { type: 'find_start', id: 'f2', pattern: 'meter' },
      { type: 'find_end', id: 'f1' },
    ]);
    expect(steps).toEqual([
      {
        type: 'find',
        patterns: [
          { id: 'f1', pattern: '330', status: 'done' },
          { id: 'f2', pattern: 'meter', status: 'running' },
        ],
      },
    ]);
  });
});

describe('numberSources', () => {
  it('numbers pages once each: search results, then opened pages, then other cited pages', () => {
    const steps = reduce([
      { type: 'search_start', id: 's1', queries: ['q'] },
      { type: 'search_end', id: 's1', sources: [page(1), page(2)] },
      { type: 'search_start', id: 's2', queries: ['q'] },
      { type: 'search_end', id: 's2', sources: [page(2), page(3)] },
      { type: 'thinking', delta: '…' },
      { type: 'open_start', id: 'o1', url: page(4).url },
      { type: 'open_end', id: 'o1', title: 'Page 4' },
    ]);
    expect(numberSources(steps, [page(3), page(9)])).toEqual([page(1), page(2), page(3), page(4), page(9)]);
    expect(foundPages(steps)).toEqual([page(1), page(2), page(3)]);
  });
});
