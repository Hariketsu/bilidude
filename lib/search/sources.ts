import type { SearchSource } from './client';
import { foundPages, type AnswerStep } from '../llm/steps';

/** A page DeepSeek's server-side search cites; `end` is where the cited text ends, in code points of that turn's text. */
export interface Citation extends SearchSource {
  end: number;
}

/** `[3]` in an answer: the third numbered source. Timestamps like `[03:05]` don't match. */
export const CITATION_PATTERN = /\[(\d{1,3})\]/g;

/**
 * The numbered sources of an answer, each page once: what its searches found, in order (the
 * numbers the client `web_search` tool gives the model), then pages it opened, then cited pages
 * neither returned.
 */
export function numberSources(steps: AnswerStep[], cited: SearchSource[]): SearchSource[] {
  const sources = foundPages(steps);
  const add = (page: SearchSource) => {
    if (!sources.some((s) => s.url === page.url)) sources.push(page);
  };
  for (const step of steps) if (step.type === 'open') step.pages.filter((p) => p.status === 'done').forEach(({ url, title }) => add({ url, title }));
  cited.forEach(add);
  return sources;
}

/** Writes `[n]` where each cited passage ends, so server-side citations read like the ones models write. */
export function insertCitations(text: string, citations: Citation[], sources: SearchSource[]): string {
  const marks = new Map<number, Set<number>>();
  for (const { url, end } of citations) {
    const n = sources.findIndex((s) => s.url === url) + 1;
    if (n > 0) marks.set(end, (marks.get(end) ?? new Set()).add(n));
  }
  const chars = Array.from(text);
  for (const end of [...marks.keys()].sort((a, b) => b - a)) {
    const numbers = [...marks.get(end)!].sort((a, b) => a - b);
    chars.splice(end, 0, numbers.map((n) => `[${n}]`).join(''));
  }
  return chars.join('');
}

interface CitedSource {
  n: number;
  source: SearchSource;
}

/** The numbered sources `text` cites, in number order. */
export function citedSources(text: string, sources: SearchSource[]): CitedSource[] {
  const numbers = new Set([...text.matchAll(CITATION_PATTERN)].map((m) => Number(m[1])));
  return [...numbers]
    .filter((n) => n >= 1 && n <= sources.length)
    .sort((a, b) => a - b)
    .map((n) => ({ n, source: sources[n - 1]! }));
}

/** `markdown` followed by the pages it cites, numbered as in the answer, for copying and exporting. */
export function withSources(markdown: string, sources: SearchSource[] | undefined, heading: string): string {
  const cited = citedSources(markdown, sources ?? []);
  if (!cited.length) return markdown;
  const list = cited.map(({ n, source }) => `- [${n}] [${source.title.replace(/[[\]]/g, '\\$&')}](${source.url})`);
  return `${markdown}\n\n**${heading}**\n\n${list.join('\n')}`;
}
