import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { watchServerTools, type ServerToolUpdate } from '@/lib/llm/deepseekServerTools';

const fixture = readFileSync(new URL('./fixtures/deepseek-server-search.sse', import.meta.url));

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

describe('watchServerTools', () => {
  it('reports a server-side search with its queries and sources, then the cited sources', async () => {
    const updates: ServerToolUpdate[] = [];
    await watchServerTools(streamOf(fixture), (update) => updates.push(update));

    // The search shows up as soon as it starts.
    expect(updates[0]!.searches).toEqual([
      {
        id: 'srvtoolu_s_00_0a836de267b7402c8312f00322ead416',
        queries: [
          'Rick Astley 的 "Never Gonna Give You Up" 是哪一年发行的',
          'When was "Never Gonna Give You Up" by Rick Astley released?',
        ],
        status: 'running',
        sources: [],
      },
    ]);
    const last = updates.at(-1)!;
    expect(last.searches[0]!.status).toBe('done');
    expect(last.searches[0]!.sources.map((s) => s.siteName)).toEqual(['BBC', 'Wikipedia', 'Canada.ca']);
    expect(last.searches[0]!.sources[0]).toMatchObject({
      title: 'BBC Sounds - Song Exploder, Rick Astley - Never Gonna Give You Up',
      url: 'https://www.bbc.co.uk/programmes/p0jjbzzb',
      siteIcon: 'https://cdn.deepseek.com/site-icons/bbc.co.uk',
    });
    // Each citation ends where the cited text does, before the full stop.
    expect(last.citations.map((c) => c.end)).toEqual([57, 57]);
    expect(last.citations.map((c) => c.url)).toEqual([
      'https://zh.wikipedia.org/wiki/%E6%B0%B8%E4%B8%8D%E6%94%BE%E5%BC%83%E4%BD%A0#1',
      'https://baike.baidu.com/item/NEVER%20GONNA%20GIVE%20YOU%20UP/1719254?bst=1794751483.ac0bdeb973ad241a#1',
    ]);
  });
});
