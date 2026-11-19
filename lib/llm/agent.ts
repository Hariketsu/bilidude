import { agentLoop, type AgentTool } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, Message, Model, ThinkingLevel } from '@earendil-works/pi-ai';
import { insertCitations, numberSources, type Citation } from '../sources';
import { withAccountAuth } from '../deepseekAccount';
import { DEEPSEEK_SEARCH_TOOL, watchServerTools } from './deepseekServerTools';
import { streamChat } from './providers';
import type { SearchSource } from './search';
import { applyEvent, type AnswerStep, type TimelineEvent } from './steps';

/** Tool rounds per answer; past this, tool calls are refused so the model answers with what it has. */
const MAX_TOOL_CALLS = 6;

export interface AgentProgress {
  text: string;
  /** Thinking and tool calls, in order. */
  steps: AnswerStep[];
  /** When the first answer text arrived, in ms since the start; undefined while still thinking. */
  thoughtMs?: number;
  /** The pages `[n]` in the text refers to (see `numberSources`). */
  sources: SearchSource[];
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
  /** The signed-in DeepSeek account's token, sent instead of `apiKey`'s Bearer header. */
  accountToken?: string;
  /** Turn on DeepSeek's server-side web search (DeepSeek models only). */
  serverSearch?: boolean;
  /** Called with the latest state, at most once per animation frame. */
  onProgress: (progress: AgentProgress) => void;
}

/** Answers `prompt`, letting the model call `tools` until it writes its answer. */
export async function runAgent(run: AgentRun): Promise<AgentResult> {
  const startedAt = Date.now();
  const state: AgentProgress = { text: '', steps: [], sources: [] };
  // Citations per request; each request is one assistant turn, and positions count in its text.
  const serverCitations: Citation[][] = [];
  const syncSources = () => {
    state.sources = numberSources(state.steps, serverCitations.flat());
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
  const step = (event: TimelineEvent) => {
    state.steps = applyEvent(state.steps, event);
    if (event.type !== 'thinking') syncSources();
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
        const response = await fetch(input, run.accountToken ? withAccountAuth(init, run.accountToken) : init);
        httpStatus = response.status;
        if (!run.serverSearch || !response.ok || !response.body) return response;
        // One copy for pi-ai, one for the server-side search events it ignores.
        const [forModel, forTools] = response.body.tee();
        const citations = serverCitations[serverCitations.push([]) - 1]!;
        pendingTaps.push(
          watchServerTools(forTools, (event) => {
            if (event.type !== 'citation') return step(event);
            citations.push(event.citation);
            syncSources();
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
        // With DeepSeek's search, thinking comes from the server-event copy, in order with the searches.
        if (delta.type === 'thinking_delta' && !run.serverSearch) step({ type: 'thinking', delta: delta.delta });
        if (delta.type === 'text_delta') {
          state.thoughtMs ??= Date.now() - startedAt;
          state.text += delta.delta;
          report();
        }
        break;
      }
      case 'message_end':
        if (event.message.role === 'assistant') final = event.message;
        if (event.message.role === 'assistant' || event.message.role === 'toolResult') produced.push(event.message);
        break;
      case 'tool_execution_start':
        if (event.toolName === 'web_search') step({ type: 'search_start', id: event.toolCallId, queries: [String(event.args?.query ?? '')] });
        break;
      case 'tool_execution_end':
        if (event.toolName === 'web_search') {
          const sources: SearchSource[] = event.isError ? [] : (event.result?.details ?? []);
          step({ type: 'search_end', id: event.toolCallId, failed: event.isError, sources });
        }
        break;
    }
  }
  await Promise.all(pendingTaps);
  if (frame !== undefined) cancelAnimationFrame(frame);

  // Replay up to the last turn with text: earlier tool calls are followed by their results.
  const lastText = produced.findLastIndex((m) => m.role === 'assistant' && m.content.some((b) => b.type === 'text' && b.text));
  const turns = produced.filter((m) => m.role === 'assistant');
  // Citations arrive with each request's last chunk, so the marks go in once the text is complete.
  if (serverCitations.some((c) => c.length) && turns.length === serverCitations.length) {
    state.text = turns
      .map((turn, i) => {
        const text = turn.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
        return insertCitations(text, serverCitations[i]!, state.sources);
      })
      .filter(Boolean)
      .join('\n\n');
  }
  state.text = state.text.trim();
  return { ...state, final, messages: produced.slice(0, lastText + 1), httpStatus };
}
