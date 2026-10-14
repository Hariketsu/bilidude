import { useEffect, useRef, useState } from 'react';
import { Composer } from '@/components/Composer';
import { AssistantMessage, UserMessage } from '@/components/Messages';
import { ModelForm } from '@/components/ModelForm';
import { PresetChip } from '@/components/PresetChip';
import { SettingsPanel } from '@/components/SettingsPanel';
import { TopBar } from '@/components/TopBar';
import { resolveModel } from '@/lib/llm/providers';
import { PRESETS } from '@/lib/presets';
import { saveSettings, useSettings } from '@/lib/settings';
import { seekVideo } from '@/lib/tab';
import { applyTheme } from '@/lib/theme';
import type { PresetId } from '@/lib/types';
import { useActiveVideo } from './useActiveVideo';
import { useChat } from './useChat';

export default function App() {
  const settings = useSettings();
  const active = useActiveVideo();
  const chat = useChat(settings);
  const video = active.status === 'ready' ? active.video : undefined;
  const videoKey = active.status === 'none' ? undefined : active.key;

  const [preset, setPreset] = useState<PresetId>();
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isEmpty = chat.messages.length === 0;
  const needsSetup = !!settings && !resolveModel(settings.llm);

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages.length]);

  const newChat = () => {
    chat.reset();
    setPreset(undefined);
  };

  // One session per video: a different video (or part) starts over.
  useEffect(newChat, [videoKey]);

  const send = (text: string) => {
    if (!video) return;
    void chat.send(video, text, preset);
    setPreset(undefined);
  };

  return (
    <main className="relative flex h-screen flex-col bg-bg text-fg">
      <TopBar onNewChat={newChat} onSettings={() => setShowSettings(true)} />

      <div className="flex-1 overflow-y-auto px-5">
        {isEmpty && needsSetup && settings && (
          <div className="mx-auto max-w-sm space-y-5 py-8">
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold">Connect a model</h1>
              <p className="text-sm text-fg-muted">bilidude answers with your own API key.</p>
            </div>
            <ModelForm value={settings.llm} onSave={(llm) => saveSettings({ ...settings, llm })} />
          </div>
        )}
        {isEmpty && !needsSetup && !video && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-muted">
            {active.status === 'none' && 'Open a Bilibili video to start'}
            {active.status === 'error' && `Couldn't load this video: ${active.error}`}
          </div>
        )}
        <div className="space-y-8 py-4">
          {chat.messages.map((message) =>
            message.role === 'user' ? (
              <UserMessage key={message.id} message={message} />
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                citations={chat.citations}
                onSeek={(seconds) => void seekVideo(message.video, seconds)}
                onRegenerate={() => void chat.regenerate(message.id)}
              />
            ),
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 space-y-3 p-3 pt-1">
        {isEmpty && video && !needsSetup && !preset && (
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(({ id }) => (
              <PresetChip key={id} id={id} size="sm" onClick={() => setPreset(id)} />
            ))}
          </div>
        )}
        {(video || !isEmpty) && !needsSetup && (
          <Composer
            video={video}
            showAttachment={isEmpty}
            preset={preset}
            onClearPreset={() => setPreset(undefined)}
            generating={chat.generating}
            onSend={send}
            onStop={chat.stop}
          />
        )}
      </div>

      {showSettings && settings && <SettingsPanel settings={settings} onClose={() => setShowSettings(false)} />}
    </main>
  );
}
