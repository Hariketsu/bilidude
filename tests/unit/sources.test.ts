import { describe, expect, it } from 'vitest';
import { citedSources, insertCitations, withSources } from '@/lib/search/sources';

const page = (n: number) => ({ title: `Page ${n}`, url: `https://example.com/${n}` });

describe('insertCitations', () => {
  const sources = [page(1), page(2), page(3)];

  it('puts each citation number where the cited text ends', () => {
    const text = 'First claim. Second claim.';
    const marked = insertCitations(text, [
      { url: page(2).url, title: '', end: 11 },
      { url: page(3).url, title: '', end: 25 },
    ], sources);
    expect(marked).toBe('First claim[2]. Second claim[3].');
  });

  it('counts positions in code points and joins citations at one spot in order', () => {
    const text = '😀 天气晴。';
    const marked = insertCitations(text, [
      { url: page(3).url, title: '', end: 5 },
      { url: page(1).url, title: '', end: 5 },
      { url: page(1).url, title: '', end: 5 },
    ], sources);
    expect(marked).toBe('😀 天气晴[1][3]。');
  });

  it('skips pages without a number', () => {
    expect(insertCitations('Text.', [{ url: 'https://elsewhere.com', title: '', end: 4 }], sources)).toBe('Text.');
  });
});

describe('citedSources', () => {
  it('lists the numbered pages the text refers to, once each, ignoring timestamps and unknown numbers', () => {
    const sources = [page(1), page(2), page(3)];
    expect(citedSources('A [3]. B [1][3] at [00:20]. C [7].', sources)).toEqual([
      { n: 1, source: page(1) },
      { n: 3, source: page(3) },
    ]);
  });
});

describe('withSources', () => {
  const sources = [page(1), page(2), { ...page(3), title: 'A [bracketed] title' }];

  it('lists the cited pages under the answer, keeping their numbers', () => {
    expect(withSources('A [3]. B [1].', sources, 'Sources')).toBe(
      'A [3]. B [1].\n\n**Sources**\n\n- [1] [Page 1](https://example.com/1)\n- [3] [A \\[bracketed\\] title](https://example.com/3)',
    );
  });

  it('leaves an answer that cites nothing alone', () => {
    expect(withSources('No citations.', sources, 'Sources')).toBe('No citations.');
    expect(withSources('No sources [1].', undefined, 'Sources')).toBe('No sources [1].');
  });
});
