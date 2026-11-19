import type { AgentTool } from '@earendil-works/pi-agent-core';
import { ServiceError, serviceFetch } from '../errors';

const SEARCH_URL = 'https://api.deepseek.com/v1/tools/search';
const RESULT_COUNT = 5;

export interface SearchSource {
  title: string;
  url: string;
  siteName?: string;
  /** The site's icon, served by DeepSeek. */
  siteIcon?: string;
  /** A short excerpt for display. */
  snippet?: string;
  /** RFC 3339, when known. */
  publishedAt?: string;
}

interface SearchResult {
  title: string;
  url: string;
  summary?: string;
  snippet?: string;
  site_name?: string | null;
  site_icon?: string | null;
  date?: string | null;
}

/** DeepSeek's Search API: billed per successful request, so one call per query. */
async function searchWeb(query: string, apiKey: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const response = await serviceFetch('DeepSeek', SEARCH_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, count: RESULT_COUNT }),
    signal,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ServiceError('DeepSeek', response.status, body.slice(0, 300));
  }
  const data: { results?: SearchResult[] } = await response.json();
  return data.results ?? [];
}

const parameters = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'Search query, 1–128 characters. Supports site:, "exact phrase", lang:zh,en, after:2025.' },
  },
  required: ['query'],
} as const;

/**
 * The `web_search` tool for models without a search of their own; `details` carries the pages for the UI.
 * Results are numbered across all searches of one answer, a page found again keeping its number,
 * so the model can cite them as `[n]`.
 */
export function webSearchTool(apiKey: string): AgentTool<any, SearchSource[]> {
  const numbers = new Map<string, number>();
  return {
    name: 'web_search',
    label: 'Web search',
    description:
      'Search the web. Use it to check names, terms or facts the transcript may have wrong, or for context the video does not give.',
    parameters,
    async execute(_id, { query }: { query: string }, signal) {
      const results = await searchWeb(query, apiKey, signal);
      for (const r of results) if (!numbers.has(r.url)) numbers.set(r.url, numbers.size + 1);
      const text = results.length
        ? results
            .map((r) => `[${numbers.get(r.url)}] ${r.title}\n${r.url}${r.date ? `\nDate: ${r.date}` : ''}\n${r.summary || r.snippet || ''}`)
            .join('\n\n')
        : 'No results.';
      return {
        content: [{ type: 'text', text }],
        details: results.map((r) => ({
          title: r.title,
          url: r.url,
          ...(r.site_name && { siteName: r.site_name }),
          ...(r.site_icon && { siteIcon: r.site_icon }),
          ...(r.snippet && { snippet: r.snippet }),
          ...(r.date && { publishedAt: r.date }),
        })),
      };
    },
  };
}
