import { useEffect, useRef, useState } from 'react';
import { Composer } from '@/components/Composer';
import { AssistantMessage, UserMessage } from '@/components/Messages';
import { PresetChip } from '@/components/PresetChip';
import { TopBar } from '@/components/TopBar';
import { PRESETS } from '@/lib/presets';
import { seekVideo } from '@/lib/tab';
import { getTranscript } from '@/lib/transcript';
import type { Message, PresetId, VideoRef } from '@/lib/types';
import { MOCK_ANSWER } from './mock';
import { useActiveVideo } from './useActiveVideo';

type AssistantMsg = Extract<Message, { role: 'assistant' }>;

export default function App() {
  const active = useActiveVideo();
  const video = active.status === 'ready' ? active.video : undefined;
  const videoKey = active.status === 'none' ? undefined : active.key;

  const [messages, setMessages] = useState<Message[]>([]);
  const [preset, setPreset] = useState<PresetId>();
  const stopRef = useRef<() => void>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const generating = messages.some((m) => m.role === 'assistant' && m.status === 'streaming');
  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const newChat = () => {
    stopRef.current?.();
    setMessages([]);
    setPreset(undefined);
  };

  // One session per video: a different video (or part) starts over.
  useEffect(newChat, [videoKey]);

  const updateAnswer = (id: string, patch: Partial<AssistantMsg>) =>
    setMessages((prev) => prev.map((m) => (m.id === id && m.role === 'assistant' ? { ...m, ...patch } : m)));

  // Reads the transcript, then streams a canned answer. The LLM replaces the canned part in milestone 3.
  const startAnswer = async (target: VideoRef) => {
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    stopRef.current = () => {
      stopped = true;
      timers.forEach(clearTimeout);
      updateAnswer(id, { status: 'aborted', phase: 'writing' });
    };
    setMessages((prev) => [
      ...prev,
      { id, role: 'assistant', text: '', status: 'streaming', phase: 'reading', video: target },
    ]);

    try {
      const transcript = await getTranscript(target);
      if (stopped) return;
      if (!transcript) {
        updateAnswer(id, {
          status: 'error',
          text: 'This video has no subtitles. Turn on audio transcription in Settings to ask about it.',
        });
        return;
      }
    } catch (error) {
      if (stopped) return;
      updateAnswer(id, {
        status: 'error',
        text: `Couldn't load subtitles: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }

    updateAnswer(id, { phase: 'thinking' });
    timers.push(
      setTimeout(() => {
        updateAnswer(id, { phase: 'writing', thoughtMs: Date.now() - startedAt });
        let length = 0;
        const interval = setInterval(() => {
          length = Math.min(MOCK_ANSWER.length, length + 6);
          const done = length === MOCK_ANSWER.length;
          updateAnswer(id, { text: MOCK_ANSWER.slice(0, length), ...(done && { status: 'done' }) });
          if (done) clearInterval(interval);
        }, 16);
        stopRef.current = () => {
          clearInterval(interval);
          updateAnswer(id, { status: 'aborted' });
        };
      }, 1200),
    );
  };

  const send = (text: string) => {
    if (!video) return;
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', video: isEmpty ? video : undefined, preset, text },
    ]);
    setPreset(undefined);
    void startAnswer(video);
  };

  return (
    <main className="flex h-screen flex-col bg-bg text-fg">
      <TopBar onNewChat={newChat} />

      <div className="flex-1 overflow-y-auto px-5">
        {isEmpty && !video && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-muted">
            {active.status === 'none' && 'Open a Bilibili video to start'}
            {active.status === 'error' && `Couldn't load this video: ${active.error}`}
          </div>
        )}
        <div className="space-y-8 py-4">
          {messages.map((message) =>
            message.role === 'user' ? (
              <UserMessage key={message.id} message={message} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                onSeek={(seconds) => void seekVideo(message.video, seconds)}
                onRegenerate={() => {
                  setMessages((prev) => prev.filter((m) => m.id !== message.id));
                  void startAnswer(message.video);
                }}
              />
            ),
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 space-y-3 p-3 pt-1">
        {isEmpty && video && !preset && (
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(({ id }) => (
              <PresetChip key={id} id={id} size="sm" onClick={() => setPreset(id)} />
            ))}
          </div>
        )}
        {(video || !isEmpty) && (
          <Composer
            video={video}
            showAttachment={isEmpty}
            preset={preset}
            onClearPreset={() => setPreset(undefined)}
            generating={generating}
            onSend={send}
            onStop={() => stopRef.current?.()}
          />
        )}
      </div>
    </main>
  );
}
