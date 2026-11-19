import type { Citation } from '../sources';
import type { SearchStep } from './search';

/**
 * DeepSeek's server-side web search (`deepseek_web_search`) in Chat Completions. pi-ai parses the
 * answer and ignores these extension fields, so a copy of the response stream is read here:
 * `server_tool_event` on each choice reports calls starting and finishing, and the last delta
 * carries `annotations` (the cited pages).
 */
export const DEEPSEEK_SEARCH_TOOL = { type: 'deepseek_web_search' } as const;

export interface ServerToolUpdate {
  searches: SearchStep[];
  /** Pages the answer cites, in order. */
  citations: Citation[];
}

interface ServerCall {
  id: string;
  type?: string;
  action?: { type: string; queries?: string[]; url?: string };
  status?: 'completed' | 'failed';
  sources?: { url: string; title?: string; site_name?: string | null; site_icon?: string | null }[];
  page?: { url: string; title?: string };
}

interface Choice {
  server_tool_event?: { type: string; call?: ServerCall };
  delta?: { annotations?: { type: string; url_citation?: { url: string; title?: string; end_index?: number } }[] };
}

/** Reads `body` to the end, calling `onUpdate` whenever the searches or citations change. */
export async function watchServerTools(
  body: ReadableStream<Uint8Array>,
  onUpdate: (update: ServerToolUpdate) => void,
): Promise<void> {
  const state: ServerToolUpdate = { searches: [], citations: [] };
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';

  const handle = (choice: Choice) => {
    const event = choice.server_tool_event;
    const call = event?.call;
    let changed = false;
    if (event?.type === 'call_started' && call?.action?.type === 'search') {
      state.searches = [...state.searches, { id: call.id, queries: call.action.queries ?? [], status: 'running', sources: [] }];
      changed = true;
    } else if (event?.type === 'call_completed' && call) {
      const sources = (call.sources ?? []).map((s) => ({
        title: s.title ?? s.url,
        url: s.url,
        siteName: s.site_name ?? undefined,
        siteIcon: s.site_icon ?? undefined,
      }));
      const status = call.status === 'failed' ? 'failed' : 'done';
      const known = state.searches.some((step) => step.id === call.id);
      state.searches = state.searches.map((step) => (step.id === call.id ? { ...step, status, sources } : step));
      changed = known;
    }
    const annotations = choice.delta?.annotations ?? [];
    for (const { url_citation: citation } of annotations) {
      if (!citation || citation.end_index === undefined) continue;
      state.citations = [...state.citations, { title: citation.title ?? citation.url, url: citation.url, end: citation.end_index }];
      changed = true;
    }
    if (changed) onUpdate({ searches: state.searches, citations: state.citations });
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
