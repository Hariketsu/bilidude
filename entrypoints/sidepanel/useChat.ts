import type { Context, Message as PiMessage } from '@earendil-works/pi-ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveAsr } from '@/lib/asr/providers';
import { transcribeVideo } from '@/lib/asr/transcribe';
import { createCitations } from '@/lib/citations';
import { saveSession, videoKeyOf, type Session } from '@/lib/db';
import { t } from '@/lib/i18n';
import { buildSystemPrompt, buildUserPrompt, estimateTokens } from '@/lib/llm/prompt';
import { reasoningOption, resolveModel, streamChat } from '@/lib/llm/providers';
import { resolveOutputLanguage, type Settings } from '@/lib/settings';
import { getPlaybackTime } from '@/lib/tab';
import { getTranscript } from '@/lib/transcript';
import type { AssistantMessage, Message, PresetId, Transcript, VideoRef } from '@/lib/types';

/** Headroom kept free of the transcript for the conversation and the answer. */
const RESERVED_TOKENS = 16_000;
/** A streaming answer is persisted at most this often; finished states are saved at once. */
const STREAMING_SAVE_DELAY_MS = 500;

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

function newSession() {
  return { id: crypto.randomUUID(), createdAt: Date.now() };
}

/** One conversation about one video, saved to IndexedDB once it has messages. */
export function useChat(settings: Settings | undefined) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [transcript, setTranscript] = useState<Transcript>();
  const [session, setSession] = useState<{ id: string; createdAt: number }>(() => newSession());
  const abortRef = useRef<AbortController>(undefined);
  // Lets async work started for one session notice that another one has replaced it.
  const sessionIdRef = useRef(session.id);

  const generating = messages.some((m) => m.role === 'assistant' && m.status === 'streaming');
  // The first message carries the video the whole session is about.
  const video = messages[0]?.role === 'user' ? messages[0].video : undefined;

  useEffect(() => {
    if (!video) return;
    const save = () =>
      void saveSession({ ...session, video, videoKey: videoKeyOf(video), updatedAt: Date.now(), messages });
    if (!generating) {
      save();
      return;
    }
    const timer = setTimeout(save, STREAMING_SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [messages, session, video, generating]);
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
      update(id, { status: 'error', error: t('errors.noModel') });
      return;
    }

    let loaded: Transcript | null;
    try {
      loaded = await getTranscript(target);
    } catch (error) {
      update(id, { status: 'error', error: t('errors.subtitles', { error: errorMessage(error) }) });
      return;
    }
    if (controller.signal.aborted) return;
    if (!loaded) {
      const asr = resolveAsr(settings.asr);
      if (!asr) {
        update(id, { status: 'error', error: t('errors.noSubtitles') });
        return;
      }
      update(id, { phase: 'transcribing' });
      try {
        // Stopping the answer doesn't cancel the transcription; it keeps going for the next question.
        loaded = await transcribeVideo(target, asr, (asrProgress) => {
          if (!controller.signal.aborted) update(id, { asrProgress });
        });
      } catch (error) {
        if (!controller.signal.aborted) update(id, { status: 'error', error: t('errors.transcription', { error: errorMessage(error) }) });
        return;
      }
      if (controller.signal.aborted) return;
    }
    setTranscript(loaded);

    const { model, apiKey } = resolved;
    const systemPrompt = buildSystemPrompt(target, loaded, resolveOutputLanguage(settings));
    if (estimateTokens(systemPrompt) + RESERVED_TOKENS > model.contextWindow) {
      update(id, { status: 'error', error: t('errors.tooLong', { model: model.name }) });
      return;
    }

    update(id, { phase: 'thinking' });
    const context: Context = { systemPrompt, messages: toHistory(conversation) };
    let stream: ReturnType<typeof streamChat>;
    try {
      stream = streamChat(model, context, {
        apiKey,
        signal: controller.signal,
        sessionId: session.id,
        reasoning: reasoningOption(model, settings.llm.thinking),
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
      error: result.stopReason === 'error' ? result.errorMessage || t('errors.modelError') : undefined,
      // Keep partial answers in the history so follow-ups can refer to them.
      llm: hasContent ? result : undefined,
    });
  };

  return {
    sessionId: session.id,
    messages,
    generating,
    citations,
    /** The video this session is about; undefined until the first message. */
    video,

    /** Asks about the session's video, or `activeVideo` when starting a session. */
    async send(activeVideo: VideoRef, text: string, preset?: PresetId) {
      const target = video ?? activeVideo;
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
      const next = newSession();
      sessionIdRef.current = next.id;
      setSession(next);
      setMessages([]);
      setTranscript(undefined);
    },

    load(stored: Session) {
      abortRef.current?.abort();
      sessionIdRef.current = stored.id;
      setSession({ id: stored.id, createdAt: stored.createdAt });
      setMessages(stored.messages);
      setTranscript(undefined);
      // Needed to validate citations; usually already cached.
      getTranscript(stored.video)
        .then((loaded) => loaded && sessionIdRef.current === stored.id && setTranscript(loaded))
        .catch(() => {});
    },
  };
}
