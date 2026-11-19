import { afterEach, expect, it, vi } from 'vitest';
import { webSearchTool } from '@/lib/llm/search';

afterEach(() => vi.unstubAllGlobals());

const result = (n: number) => ({ title: `Page ${n}`, url: `https://example.com/${n}`, summary: `About ${n}.`, snippet: `Short ${n}.`, date: '2026-01-02T00:00:00+00:00' });

it('numbers results across searches, giving a page found again its first number', async () => {
  const responses = [[result(1), result(2)], [result(2), result(3)]];
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: responses.shift() })));
  const tool = webSearchTool({ kind: 'key', key: 'sk' });

  const first = await tool.execute('a', { query: 'one' });
  const second = await tool.execute('b', { query: 'two' });
  const text = (r: typeof first) => (r.content[0] as { text: string }).text;
  expect(text(first)).toMatch(/^\[1\] Page 1[\s\S]*\[2\] Page 2/);
  expect(text(second)).toMatch(/^\[2\] Page 2[\s\S]*\[3\] Page 3/);
  expect(second.details[1]).toEqual({ title: 'Page 3', url: 'https://example.com/3', snippet: 'Short 3.', publishedAt: '2026-01-02T00:00:00+00:00' });
});
