import type { Message as PiMessage } from '@earendil-works/pi-ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveAsr } from '@/lib/asr/providers';
import { transcribeVideo } from '@/lib/asr/transcribe';
import { createTranscriptCheck } from '@/lib/render/transcriptCheck';
import { describeError, describeServiceError, ServiceError } from '@/lib/errors';
import { saveSession, videoKeyOf, type Session } from '@/lib/storage/db';
import { t } from '@/lib/i18n';
import { buildSystemPrompt, buildUserPrompt, estimateTokens } from '@/lib/llm/prompt';
import { runAgent } from '@/lib/llm/agent';
import { PROVIDERS, reasoningOption, resolveModel } from '@/lib/llm/providers';
import { webSearchTool } from '@/lib/search/client';
import { deepseekCredential } from '@/lib/deepseek/account';
import { loadSettings, resolveOutputLanguage, saveSettings, searchAvailable, type Settings } from '@/lib/storage/settings';
import { getPlaybackTime } from '@/lib/bili/tab';
import { getTranscript } from '@/lib/transcript';
import type { AssistantMessage, Message, PresetId, Transcript, VideoRef } from '@/lib/types';

/** Headroom kept free of the transcript for the conversation and the answer. */
const RESERVED_TOKENS = 16_000;
/** A streaming answer is persisted at most this often; finished states are saved at once. */
const STREAMING_SAVE_DELAY_MS = 500;

function replayOf(message: AssistantMessage): PiMessage[] {
  return message.llmMessages ?? (message.llm ? [message.llm] : []);
}

/** Earlier turns as model input; failed answers and the questions behind them are left out. */
function toHistory(messages: Message[]): PiMessage[] {
  const history: PiMessage[] = [];
  for (const [i, message] of messages.entries()) {
    if (message.role === 'assistant') {
      history.push(...replayOf(message));
      continue;
    }
    const answer = messages[i + 1];
    if (answer?.role === 'assistant' && replayOf(answer).length === 0) continue;
    history.push({ role: 'user', content: message.prompt, timestamp: Date.now() });
  }
  return history;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function providerName(id: string): string {
  return PROVIDERS.find((provider) => provider.id === id)?.name ?? id;
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
  const transcriptCheck = useMemo(
    () => (transcript && video ? createTranscriptCheck(transcript, video.durationSec) : undefined),
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
      const asr = resolveAsr(settings.asr, settings.llm);
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
        if (controller.signal.aborted) return;
        const { message, detail } = describeError(error);
        if (asr.deepseek?.kind === 'account' && error instanceof ServiceError && error.status === 401) {
          await expireAccount(asr.deepseek.token);
          update(id, { status: 'error', error: t('errors.accountExpired'), errorDetail: detail, signInAgain: true });
          return;
        }
        update(id, { status: 'error', error: t('errors.transcription', { error: message }), errorDetail: detail });
        return;
      }
      if (controller.signal.aborted) return;
    }
    setTranscript(loaded);

    const { model, apiKey } = resolved;
    const webSearch = settings.llm.webSearch && searchAvailable(settings.llm);
    // DeepSeek searches on its side, free of charge; other models call the Search API through a tool.
    const serverSearch = webSearch && model.provider === 'deepseek';
    const search = webSearch ? (serverSearch ? 'server' : 'client') : undefined;
    const systemPrompt = buildSystemPrompt(target, loaded, resolveOutputLanguage(settings), search);
    if (estimateTokens(systemPrompt) + RESERVED_TOKENS > model.contextWindow) {
      update(id, { status: 'error', error: t('errors.tooLong', { model: model.name }) });
      return;
    }

    update(id, { phase: 'thinking' });
    const history = toHistory(conversation);
    const prompt = history.pop();
    const result = await runAgent({
      model,
      apiKey,
      reasoning: reasoningOption(model, settings.llm.thinking),
      sessionId: session.id,
      signal: controller.signal,
      systemPrompt,
      history,
      prompt: typeof prompt?.content === 'string' ? prompt.content : '',
      serverSearch,
      tools: search === 'client' ? [webSearchTool(deepseekCredential(settings.llm)!)] : [],
      accountToken: resolved.accountToken,
      onProgress: ({ text, steps, thoughtMs, sources }) =>
        update(id, {
          text,
          steps: steps.length ? steps : undefined,
          thoughtMs,
          sources: sources.length ? sources : undefined,
          phase: thoughtMs === undefined ? 'thinking' : 'writing',
        }),
    });

    const stopReason = result.final?.stopReason ?? (controller.signal.aborted ? 'aborted' : 'error');
    const errorText = result.final?.errorMessage ?? '';
    // An error after a successful response (a broken stream) has no advice to give.
    const failure =
      stopReason === 'error' && (result.httpStatus === undefined || result.httpStatus >= 400)
        ? describeServiceError(providerName(model.provider), { status: result.httpStatus, message: errorText })
        : undefined;
    const accountExpired = stopReason === 'error' && result.httpStatus === 401 && !!resolved.accountToken;
    if (accountExpired) await expireAccount(resolved.accountToken!);
    update(id, {
      text: result.text,
      steps: result.steps.length ? result.steps : undefined,
      thoughtMs: result.thoughtMs ?? Date.now() - startedAt,
      sources: result.sources.length ? result.sources : undefined,
      phase: 'writing',
      status: stopReason === 'aborted' ? 'aborted' : stopReason === 'error' ? 'error' : 'done',
      error:
        stopReason === 'error'
          ? accountExpired
            ? t('errors.accountExpired')
            : failure?.message ?? (errorText || t('errors.modelError'))
          : undefined,
      errorDetail: failure?.detail,
      signInAgain: accountExpired || undefined,
      // Keep partial answers in the history so follow-ups can refer to them.
      llmMessages: result.messages.length ? result.messages : undefined,
    });
  };

  return {
    sessionId: session.id,
    messages,
    generating,
    transcriptCheck,
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

/** DeepSeek refused the account's token: forget it, so settings show the login as expired. */
async function expireAccount(token: string) {
  const settings = await loadSettings();
  const account = settings.llm.deepseekAccount;
  if (account?.token !== token) return;
  await saveSettings({ ...settings, llm: { ...settings.llm, deepseekAccount: { ...account, token: undefined } } });
}
