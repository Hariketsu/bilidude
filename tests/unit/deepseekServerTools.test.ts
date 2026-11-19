import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { watchServerTools, type ServerEvent } from '@/lib/llm/deepseekServerTools';
import { applyEvent, type AnswerStep, type TimelineEvent } from '@/lib/llm/steps';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

/** The recorded stream in small pieces, so lines and characters are split across reads. */
function streamOf(bytes: Uint8Array, size = 37): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(offset, offset + size));
      offset += size;
    },
  });
}

async function eventsOf(name: string) {
  const events: ServerEvent[] = [];
  await watchServerTools(streamOf(fixture(name)), (event) => events.push(event));
  const timeline = events.filter((e): e is TimelineEvent => e.type !== 'citation');
  return { events, steps: timeline.reduce<AnswerStep[]>(applyEvent, []), citations: events.filter((e) => e.type === 'citation') };
}

/** Event types in order, with runs of thinking deltas collapsed into one. */
const sequence = (events: ServerEvent[]) =>
  events.map((e) => e.type).filter((type, i, all) => type !== 'thinking' || all[i - 1] !== 'thinking');

describe('watchServerTools', () => {
  it('reports a plain search (thinking off) with its queries and sources, then the citations', async () => {
    const { events, steps, citations } = await eventsOf('deepseek-server-search.sse');
    expect(sequence(events)).toEqual(['search_start', 'search_end', 'citation', 'citation']);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      type: 'search',
      queries: [
        'Rick Astley 的 "Never Gonna Give You Up" 是哪一年发行的',
        'When was "Never Gonna Give You Up" by Rick Astley released?',
      ],
    });
    const search = steps[0] as Extract<AnswerStep, { type: 'search' }>;
    expect(search.sources.map((s) => s.siteName)).toEqual(['BBC', 'Wikipedia', 'Canada.ca']);
    expect(search.sources[0]).toMatchObject({
      title: 'BBC Sounds - Song Exploder, Rick Astley - Never Gonna Give You Up',
      url: 'https://www.bbc.co.uk/programmes/p0jjbzzb',
      siteIcon: 'https://cdn.deepseek.com/site-icons/bbc.co.uk',
    });
    // Each citation ends where the cited text does, before the full stop.
    expect(citations.map((c) => c.citation.end)).toEqual([57, 57]);
    expect(citations.map((c) => c.citation.url)).toEqual([
      'https://zh.wikipedia.org/wiki/%E6%B0%B8%E4%B8%8D%E6%94%BE%E5%BC%83%E4%BD%A0#1',
      'https://baike.baidu.com/item/NEVER%20GONNA%20GIVE%20YOU%20UP/1719254?bst=1794751483.ac0bdeb973ad241a#1',
    ]);
  });

  it('interleaves thinking with the searches and page visits of a deep search (thinking on)', async () => {
    const { events, steps } = await eventsOf('deepseek-deep-search.sse');
    expect(sequence(events)).toEqual([
      'thinking',
      'search_start',
      'search_end',
      'thinking',
      'open_start',
      'open_start',
      'open_end',
      'open_end',
      'thinking',
      'citation',
      'citation',
    ]);
    expect(steps.map((s) => s.type)).toEqual(['thinking', 'search', 'thinking', 'open', 'thinking']);
    const search = steps[1] as Extract<AnswerStep, { type: 'search' }>;
    expect(search.deep).toBe(true);
    expect(search.queries).toHaveLength(4);
    expect(search.sources).toHaveLength(27);
    expect(search.sources[0]).toMatchObject({
      siteName: 'La tour Eiffel',
      snippet: expect.stringContaining('Current height'),
      publishedAt: '2017-10-29T16:00:00+00:00',
    });
    expect(steps[3]).toMatchObject({
      type: 'open',
      pages: [
        { status: 'done', title: 'Eiffel Tower key stats : the Tower in numbers' },
        { status: 'done', title: 'Tokyo Tower is a Tokyo landmark, standing 333 meters tall.' },
      ],
    });
  });
});
