import type { AgentTool } from '@earendil-works/pi-agent-core';
import { ServiceError, serviceFetch } from '../errors';

const SEARCH_URL = 'https://api.deepseek.com/v1/tools/search';
const RESULT_COUNT = 5;

export interface SearchSource {
  title: string;
  url: string;
  siteName?: string;
}

/** One web search the model ran, as shown among the answer's steps. */
export interface SearchStep {
  id: string;
  queries: string[];
  status: 'running' | 'done' | 'failed';
  sources: SearchSource[];
}

interface SearchResult {
  title: string;
  url: string;
  summary?: string;
  snippet?: string;
  site_name?: string | null;
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

/** The `web_search` tool for models without a search of their own; `details` carries the step for the UI. */
export function webSearchTool(apiKey: string): AgentTool<any, SearchSource[]> {
  return {
    name: 'web_search',
    label: 'Web search',
    description:
      'Search the web. Use it to check names, terms or facts the transcript may have wrong, or for context the video does not give.',
    parameters,
    async execute(_id, { query }: { query: string }, signal) {
      const results = await searchWeb(query, apiKey, signal);
      const text = results.length
        ? results
            .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}${r.date ? `\nDate: ${r.date}` : ''}\n${r.summary || r.snippet || ''}`)
            .join('\n\n')
        : 'No results.';
      return {
        content: [{ type: 'text', text }],
        details: results.map((r) => ({ title: r.title, url: r.url, siteName: r.site_name ?? undefined })),
      };
    },
  };
}
