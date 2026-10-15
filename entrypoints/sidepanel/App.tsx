import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Composer } from '@/components/Composer';
import { HistoryPanel } from '@/components/HistoryPanel';
import { AssistantMessage, UserMessage } from '@/components/Messages';
import { ModelSetup } from '@/components/ModelSettings';
import { PresetChip } from '@/components/PresetChip';
import { SettingsPanel } from '@/components/SettingsPanel';
import { TopBar } from '@/components/TopBar';
import { resolveAsr } from '@/lib/asr/providers';
import { transcribeVideo } from '@/lib/asr/transcribe';
import { getSession, latestSessionFor } from '@/lib/db';
import { downloadSession } from '@/lib/export';
import { applyUiLanguage } from '@/lib/i18n';
import { effectiveThinking, resolveModel, thinkingLevels } from '@/lib/llm/providers';
import { PRESETS } from '@/lib/presets';
import { saveSettings, useSettings } from '@/lib/settings';
import { seekVideo } from '@/lib/tab';
import { getTranscript } from '@/lib/transcript';
import { applyTheme } from '@/lib/theme';
import type { PresetId } from '@/lib/types';
import { useActiveVideo } from './useActiveVideo';
import { useChat } from './useChat';

export default function App() {
  const { t } = useTranslation();
  const settings = useSettings();
  const active = useActiveVideo();
  const chat = useChat(settings);
  const activeVideo = active.status === 'ready' ? active.video : undefined;
  // A session opened from history stays about its own video, whatever the tab shows.
  const video = chat.video ?? activeVideo;
  const tabId = active.status === 'none' ? undefined : active.tabId;
  const identity = active.status === 'none' ? undefined : `${active.tabId}/${active.key}`;

  const [preset, setPreset] = useState<PresetId>();
  const [overlay, setOverlay] = useState<'settings' | 'history'>();
  const bottomRef = useRef<HTMLDivElement>(null);
  /** The conversation each tab was showing, restored when switching back to it. */
  const tabSessions = useRef(new Map<number, string>());

  const isEmpty = chat.messages.length === 0;
  const canExport = !chat.generating && chat.messages.some((m) => m.role === 'assistant' && m.text);
  const resolved = settings && resolveModel(settings.llm);
  const needsSetup = !!settings && !resolved;
  const levels = resolved ? thinkingLevels(resolved.model) : [];

  useEffect(() => {
    if (settings) applyTheme(settings.theme);
  }, [settings?.theme]);

  useEffect(() => {
    if (settings) applyUiLanguage(settings.uiLanguage);
  }, [settings?.uiLanguage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages.length]);

  const newChat = () => {
    chat.reset();
    setPreset(undefined);
    if (tabId !== undefined) tabSessions.current.delete(tabId);
  };

  useEffect(() => {
    if (tabId !== undefined && chat.messages.length > 0) tabSessions.current.set(tabId, chat.sessionId);
  }, [tabId, chat.sessionId, chat.messages.length > 0]);

  // A different tab or video: restore that tab's conversation, or apply the session policy.
  useEffect(() => {
    if (!settings) return;
    setPreset(undefined);
    if (active.status === 'none') {
      chat.reset();
      return;
    }
    let cancelled = false;
    const { tabId, key } = active;
    void (async () => {
      const remembered = tabSessions.current.get(tabId);
      const restored = remembered ? await getSession(remembered) : undefined;
      const session =
        restored?.videoKey === key
          ? restored
          : settings.sessionPolicy === 'resume'
            ? await latestSessionFor(key)
            : undefined;
      if (cancelled) return;
      if (session) chat.load(session);
      else chat.reset();
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, !!settings]);

  // "As soon as the panel shows the video": transcribe ahead of the first question.
  useEffect(() => {
    const asr = settings && settings.asr.trigger === 'open' ? resolveAsr(settings.asr) : undefined;
    if (!activeVideo || !asr) return;
    getTranscript(activeVideo)
      .then((transcript) => transcript ?? transcribeVideo(activeVideo, asr))
      .catch(() => {}); // Errors surface when a question is asked.
  }, [activeVideo, settings?.asr]);

  const send = (text: string) => {
    if (!video) return;
    void chat.send(video, text, preset);
    setPreset(undefined);
  };

  return (
    <main className="relative flex h-screen flex-col bg-bg text-fg">
      <TopBar
        onNewChat={newChat}
        onHistory={() => setOverlay('history')}
        onSettings={() => setOverlay('settings')}
        onExport={
          canExport && settings
            ? () => void getSession(chat.sessionId).then((session) => session && downloadSession(session, settings.exportLinks))
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto px-5">
        {isEmpty && needsSetup && settings && (
          <div className="mx-auto max-w-sm space-y-5 py-8">
            <div className="space-y-1.5">
              <h1 className="text-lg font-semibold">{t('setup.title')}</h1>
              <p className="text-sm text-fg-muted">{t('setup.subtitle')}</p>
            </div>
            <ModelSetup value={settings.llm} onSave={(llm) => saveSettings({ ...settings, llm })} />
          </div>
        )}
        {isEmpty && !needsSetup && !video && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-muted">
            {active.status === 'none' && t('empty.openVideo')}
            {active.status === 'error' && t('empty.loadFailed', { error: active.error })}
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
                exportLinks={settings?.exportLinks ?? true}
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
            thinking={
              settings && resolved && levels.length > 0
                ? {
                    levels,
                    value: effectiveThinking(resolved.model, settings.llm.thinking),
                    onChange: (thinking) => void saveSettings({ ...settings, llm: { ...settings.llm, thinking } }),
                  }
                : undefined
            }
          />
        )}
      </div>

      {overlay === 'settings' && settings && <SettingsPanel settings={settings} onClose={() => setOverlay(undefined)} />}
      {overlay === 'history' && (
        <HistoryPanel
          currentSessionId={chat.sessionId}
          onExport={(session) => void downloadSession(session, settings?.exportLinks ?? true)}
          onOpen={(session) => {
            chat.load(session);
            setPreset(undefined);
            setOverlay(undefined);
          }}
          onClose={() => setOverlay(undefined)}
        />
      )}
    </main>
  );
}
