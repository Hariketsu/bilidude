import type { Context, Message as PiMessage } from '@earendil-works/pi-ai';
import { useMemo, useRef, useState } from 'react';
import { createCitations } from '@/lib/citations';
import { buildSystemPrompt, buildUserPrompt, estimateTokens } from '@/lib/llm/prompt';
import { resolveModel, streamChat } from '@/lib/llm/providers';
import { resolveOutputLanguage, type Settings } from '@/lib/settings';
import { getPlaybackTime } from '@/lib/tab';
import { getTranscript } from '@/lib/transcript';
import type { AssistantMessage, Message, PresetId, Transcript, VideoRef } from '@/lib/types';

/** Headroom kept free of the transcript for the conversation and the answer. */
const RESERVED_TOKENS = 16_000;

/** Earlier turns as model input; failed answers and the questions behind them are left out. */
function toHistory(messages: Message[]): PiMessage[] {
  const history: PiMessage[] = [];
  for (const [i, message] of messages.entries()) {
    if (message.role === 'assistant') {
      if (message.llm) history.push(message.llm);
      continue;
    }
    const answer = messages[i + 1];
    if (answer?.role === 'assistant' && !answer.llm) continue;
    history.push({ role: 'user', content: message.prompt, timestamp: Date.now() });
  }
  return history;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One conversation about one video. */
export function useChat(settings: Settings | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<Transcript>();
  const abortRef = useRef<AbortController>(undefined);
  const sessionRef = useRef(crypto.randomUUID());

  const generating = messages.some((m) => m.role === 'assistant' && m.status === 'streaming');
  const video = messages.find((m) => m.role === 'assistant')?.video;
  const citations = useMemo(
    () => (transcript && video ? createCitations(transcript, video.durationSec) : undefined),
    [transcript, video],
  );

  const update = (id: string, patch: Partial<AssistantMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === 'assistant' ? { ...m, ...patch } : m)));

  /** Answers the last user message of `conversation`. */
  const answer = async (conversation: Message[], target: VideoRef) => {
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages([...conversation, { id, role: 'assistant', video: target, status: 'streaming', phase: 'reading', text: '' }]);

    const resolved = settings && resolveModel(settings.llm);
    if (!resolved) {
      update(id, { status: 'error', error: 'Set up a model in Settings first.' });
      return;
    }

    let loaded: Transcript | null;
    try {
      loaded = await getTranscript(target);
    } catch (error) {
      update(id, { status: 'error', error: `Couldn't load subtitles: ${errorMessage(error)}` });
      return;
    }
    if (controller.signal.aborted) return;
    if (!loaded) {
      update(id, {
        status: 'error',
        error: 'This video has no subtitles. Turn on audio transcription in Settings to ask about it.',
      });
      return;
    }
    setTranscript(loaded);

    const { model, apiKey } = resolved;
    const systemPrompt = buildSystemPrompt(target, loaded, resolveOutputLanguage(settings.outputLanguage));
    if (estimateTokens(systemPrompt) + RESERVED_TOKENS > model.contextWindow) {
      update(id, {
        status: 'error',
        error: `This video is too long for ${model.name}. Choose a model with a larger context window.`,
      });
      return;
    }

    update(id, { phase: 'thinking' });
    const context: Context = { systemPrompt, messages: toHistory(conversation) };
    let stream: ReturnType<typeof streamChat>;
    try {
      stream = streamChat(model, context, {
        apiKey,
        signal: controller.signal,
        sessionId: sessionRef.current,
        reasoning: model.reasoning ? 'low' : undefined,
      });
    } catch (error) {
      update(id, { status: 'error', error: errorMessage(error) });
      return;
    }

    // Deltas arrive faster than the screen refreshes; render at most once per frame.
    let text = '';
    let thinking = '';
    let thoughtMs: number | undefined;
    let frame: number | undefined;
    const flush = () => {
      frame = undefined;
      update(id, { text, thinking: thinking || undefined, thoughtMs, phase: thoughtMs === undefined ? 'thinking' : 'writing' });
    };
    for await (const event of stream) {
      if (event.type === 'thinking_delta') thinking += event.delta;
      else if (event.type === 'text_delta') {
        thoughtMs ??= Date.now() - startedAt;
        text += event.delta;
      } else continue;
      frame ??= requestAnimationFrame(flush);
    }
    if (frame !== undefined) cancelAnimationFrame(frame);

    const result = await stream.result();
    const hasContent = result.content.some((block) => block.type === 'text' && block.text);
    update(id, {
      text,
      thinking: thinking || undefined,
      thoughtMs: thoughtMs ?? Date.now() - startedAt,
      phase: 'writing',
      status: result.stopReason === 'aborted' ? 'aborted' : result.stopReason === 'error' ? 'error' : 'done',
      error: result.stopReason === 'error' ? result.errorMessage || 'The model returned an error.' : undefined,
      // Keep partial answers in the history so follow-ups can refer to them.
      llm: hasContent ? result : undefined,
    });
  };

  return {
    messages,
    generating,
    citations,

    async send(target: VideoRef, text: string, preset?: PresetId) {
      const playback = await getPlaybackTime(target);
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        video: messages.length === 0 ? target : undefined,
        preset,
        text,
        prompt: buildUserPrompt(text, preset, playback),
      };
      await answer([...messages, userMessage], target);
    },

    async regenerate(answerId: string) {
      const index = messages.findIndex((m) => m.id === answerId);
      const previous = messages[index];
      if (index < 0 || previous?.role !== 'assistant') return;
      await answer(messages.slice(0, index), previous.video);
    },

    stop() {
      abortRef.current?.abort();
      setMessages((prev) =>
        prev.map((m) =>
          m.role === 'assistant' && m.status === 'streaming' && m.phase !== 'writing'
            ? { ...m, status: 'aborted', phase: 'writing' }
            : m,
        ),
      );
    },

    reset() {
      abortRef.current?.abort();
      sessionRef.current = crypto.randomUUID();
      setMessages([]);
      setTranscript(undefined);
    },
  };
}
