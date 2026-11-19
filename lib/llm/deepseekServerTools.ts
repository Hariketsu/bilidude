import type { Citation } from '../sources';
import type { SearchSource } from './search';
import type { TimelineEvent } from './steps';

/**
 * DeepSeek's server-side web search (`deepseek_web_search`) in Chat Completions. pi-ai parses the
 * answer and ignores these extension fields, so a copy of the response stream is read here. The
 * thinking is read from this copy too, so it stays in order with the searches between its steps.
 * `server_tool_event` on each choice reports calls starting and finishing; the last delta carries
 * `annotations` (the cited pages).
 */
export const DEEPSEEK_SEARCH_TOOL = { type: 'deepseek_web_search' } as const;

export type ServerEvent = TimelineEvent | { type: 'citation'; citation: Citation };

interface ServerSource {
  url: string;
  title?: string | null;
  snippet?: string | null;
  site_name?: string | null;
  site_icon?: string | null;
  published_at?: string | null;
}

interface ServerCall {
  id: string;
  kind?: string;
  action?: { type: string; queries?: string[]; url?: string; pattern?: string };
  status?: 'completed' | 'failed';
  sources?: ServerSource[];
  page?: { url: string; title?: string | null };
}

interface Choice {
  server_tool_event?: { type: string; call?: ServerCall };
  delta?: {
    reasoning_content?: string | null;
    annotations?: { type: string; url_citation?: { url: string; title?: string; end_index?: number } }[];
  };
}

const toSource = (s: ServerSource): SearchSource => ({
  title: s.title || s.url,
  url: s.url,
  siteName: s.site_name ?? undefined,
  siteIcon: s.site_icon ?? undefined,
  snippet: s.snippet ?? undefined,
  publishedAt: s.published_at ?? undefined,
});

/** Reads `body` to the end, reporting thinking, tool calls and citations in stream order. */
export async function watchServerTools(body: ReadableStream<Uint8Array>, onEvent: (event: ServerEvent) => void): Promise<void> {
  // `call_completed` doesn't repeat the action, so remember what each call was.
  const actions = new Map<string, string>();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';

  const handle = (choice: Choice) => {
    if (choice.delta?.reasoning_content) onEvent({ type: 'thinking', delta: choice.delta.reasoning_content });

    const event = choice.server_tool_event;
    const call = event?.call;
    if (event?.type === 'call_started' && call?.action) {
      const { action } = call;
      actions.set(call.id, action.type);
      if (action.type === 'search') {
        onEvent({ type: 'search_start', id: call.id, queries: action.queries ?? [], ...(call.kind === 'deep_search' && { deep: true }) });
      } else if (action.type === 'open_page') {
        onEvent({ type: 'open_start', id: call.id, url: action.url ?? '' });
      } else if (action.type === 'find_in_page') {
        onEvent({ type: 'find_start', id: call.id, pattern: action.pattern ?? '' });
      }
    } else if (event?.type === 'call_completed' && call) {
      const failed = call.status === 'failed';
      const action = actions.get(call.id);
      if (action === 'search') onEvent({ type: 'search_end', id: call.id, failed, sources: (call.sources ?? []).map(toSource) });
      else if (action === 'open_page') {
        onEvent({ type: 'open_end', id: call.id, failed, url: call.page?.url, title: call.page?.title ?? undefined });
      } else if (action === 'find_in_page') onEvent({ type: 'find_end', id: call.id, failed });
    }

    for (const { url_citation: citation } of choice.delta?.annotations ?? []) {
      if (!citation || citation.end_index === undefined) continue;
      onEvent({ type: 'citation', citation: { title: citation.title ?? citation.url, url: citation.url, end: citation.end_index } });
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const chunk: { choices?: Choice[] } = JSON.parse(data);
        chunk.choices?.forEach(handle);
      } catch {
        // Not JSON; pi-ai reports malformed streams itself.
      }
    }
    if (done) return;
  }
}
