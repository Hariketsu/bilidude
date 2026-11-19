import { agentLoop, type AgentTool } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, Message, Model, ThinkingLevel } from '@earendil-works/pi-ai';
import { DEEPSEEK_SEARCH_TOOL, watchServerTools } from './deepseekServerTools';
import { streamChat } from './providers';
import type { SearchSource, SearchStep } from './search';

/** Tool rounds per answer; past this, tool calls are refused so the model answers with what it has. */
const MAX_TOOL_CALLS = 6;

export interface AgentProgress {
  text: string;
  thinking: string;
  /** When the first answer text arrived, in ms since the start; undefined while still thinking. */
  thoughtMs?: number;
  searches: SearchStep[];
  /** Pages cited by a server-side search. */
  citations: SearchSource[];
}

export interface AgentResult extends AgentProgress {
  /** The last assistant message, which carries the stop reason. */
  final?: AssistantMessage;
  /** Assistant turns and tool results to replay as history; empty if no text was produced. */
  messages: Message[];
  /** HTTP status of the last model response, for error advice. */
  httpStatus?: number;
}

export interface AgentRun {
  model: Model<Api>;
  apiKey: string;
  reasoning?: ThinkingLevel;
  sessionId: string;
  signal: AbortSignal;
  systemPrompt: string;
  history: Message[];
  prompt: string;
  tools: AgentTool<any>[];
  /** Turn on DeepSeek's server-side web search (DeepSeek models only). */
  serverSearch?: boolean;
  /** Called with the latest state, at most once per animation frame. */
  onProgress: (progress: AgentProgress) => void;
}

/** Answers `prompt`, letting the model call `tools` until it writes its answer. */
export async function runAgent(run: AgentRun): Promise<AgentResult> {
  const startedAt = Date.now();
  const state: AgentProgress = { text: '', thinking: '', searches: [], citations: [] };
  // Searches DeepSeek ran itself, per request; kept apart so later requests don't overwrite earlier ones.
  const serverSearches: SearchStep[][] = [];
  let clientSearches: SearchStep[] = [];
  const syncSearches = () => {
    state.searches = [...serverSearches.flat(), ...clientSearches];
  };
  const produced: Message[] = [];
  let final: AssistantMessage | undefined;
  let httpStatus: number | undefined;
  let toolCalls = 0;

  // Deltas arrive faster than the screen refreshes; report at most once per frame.
  let frame: number | undefined;
  const report = () => {
    frame ??= requestAnimationFrame(() => {
      frame = undefined;
      run.onProgress({ ...state });
    });
  };
  const setSearch = (id: string, patch: Partial<SearchStep>) => {
    clientSearches = clientSearches.map((step) => (step.id === id ? { ...step, ...patch } : step));
    syncSearches();
    report();
  };
  const pendingTaps: Promise<void>[] = [];

  const stream = agentLoop(
    [{ role: 'user', content: run.prompt, timestamp: Date.now() }],
    { messages: [{ role: 'system', content: run.systemPrompt, timestamp: startedAt }, ...run.history], tools: run.tools },
    {
      model: run.model,
      apiKey: run.apiKey,
      reasoning: run.reasoning,
      sessionId: run.sessionId,
      convertToLlm: (messages) => messages as Message[],
      toolExecution: 'sequential',
      // pi-ai reports failures as text only; the status tells which advice fits.
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        httpStatus = response.status;
        if (!run.serverSearch || !response.ok || !response.body) return response;
        // One copy for pi-ai, one for the server-side search events it ignores.
        const [forModel, forTools] = response.body.tee();
        const slot = serverSearches.push([]) - 1;
        pendingTaps.push(
          watchServerTools(forTools, ({ searches, citations }) => {
            serverSearches[slot] = searches;
            syncSearches();
            state.citations = [...state.citations, ...citations.filter((c) => !state.citations.some((k) => k.url === c.url))];
            report();
          }).catch(() => {}),
        );
        return new Response(forModel, { status: response.status, statusText: response.statusText, headers: response.headers });
      },
      onPayload: run.serverSearch
        ? (payload) => {
            const body = payload as { tools?: unknown[] };
            return { ...body, tools: [...(body.tools ?? []), DEEPSEEK_SEARCH_TOOL] };
          }
        : undefined,
      beforeToolCall: async () =>
        ++toolCalls > MAX_TOOL_CALLS ? { block: true, reason: 'Tool limit reached. Answer with what you have.' } : undefined,
    },
    run.signal,
    streamChat,
  );

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start':
        // A later turn's text continues the answer as a new paragraph.
        if (event.message.role === 'assistant' && state.text) state.text += '\n\n';
        break;
      case 'message_update': {
        const delta = event.assistantMessageEvent;
        if (delta.type === 'thinking_delta') state.thinking += delta.delta;
        else if (delta.type === 'text_delta') {
          state.thoughtMs ??= Date.now() - startedAt;
          state.text += delta.delta;
        } else break;
        report();
        break;
      }
      case 'message_end':
        if (event.message.role === 'assistant') final = event.message;
        if (event.message.role === 'assistant' || event.message.role === 'toolResult') produced.push(event.message);
        break;
      case 'tool_execution_start':
        if (event.toolName === 'web_search') {
          clientSearches = [...clientSearches, { id: event.toolCallId, queries: [String(event.args?.query ?? '')], status: 'running', sources: [] }];
          syncSearches();
          report();
        }
        break;
      case 'tool_execution_end':
        if (event.toolName === 'web_search') {
          const sources: SearchSource[] = event.isError ? [] : (event.result?.details ?? []);
          setSearch(event.toolCallId, { status: event.isError ? 'failed' : 'done', sources });
        }
        break;
    }
  }
  await Promise.all(pendingTaps);
  if (frame !== undefined) cancelAnimationFrame(frame);

  // Replay up to the last turn with text: earlier tool calls are followed by their results.
  const lastText = produced.findLastIndex((m) => m.role === 'assistant' && m.content.some((b) => b.type === 'text' && b.text));
  state.text = state.text.trim();
  return { ...state, final, messages: produced.slice(0, lastText + 1), httpStatus };
}
