import { useEffect, useState } from 'react';
import { fetchVideoInfo } from '@/lib/bili/api';
import { parseVideoUrl } from '@/lib/bili/url';
import { t } from '@/lib/i18n';
import { getTranscript } from '@/lib/transcript';
import type { VideoRef } from '@/lib/types';

/** `key` is `${bvid}:${p}`; `tabId` is the active tab showing it. */
export type ActiveVideo =
  | { status: 'none' }
  | { status: 'loading'; key: string; tabId: number }
  | { status: 'ready'; key: string; tabId: number; video: VideoRef }
  | { status: 'error'; key: string; tabId: number; error: string };

/** Tracks the bilibili video shown in this window's active tab. */
export function useActiveVideo(): ActiveVideo {
  const [state, setState] = useState<ActiveVideo>({ status: 'none' });

  useEffect(() => {
    let windowId: number | undefined;
    let currentKey: string | undefined;

    const resolve = async (tabId: number | undefined, url: string | undefined) => {
      const location = parseVideoUrl(url);
      // The same video in another tab is a different conversation.
      const key = location && tabId !== undefined ? `${location.bvid}:${location.p}` : undefined;
      const identity = key && `${tabId}/${key}`;
      if (identity === currentKey) return;
      currentKey = identity;
      if (!location || !key || tabId === undefined) {
        setState({ status: 'none' });
        return;
      }

      setState({ status: 'loading', key, tabId });
      try {
        const info = await fetchVideoInfo(location.bvid);
        const page = info.pages.find((item) => item.page === location.p) ?? info.pages[0];
        if (!page) throw new Error(t('errors.noPlayableParts'));
        const video: VideoRef = {
          bvid: info.bvid,
          aid: info.aid,
          cid: page.cid,
          p: page.page,
          title: info.title,
          partTitle: info.pages.length > 1 ? page.part : undefined,
          upName: info.upName,
          desc: info.desc,
          coverUrl: info.coverUrl,
          durationSec: page.durationSec || info.durationSec,
        };
        if (currentKey !== identity) return;
        setState({ status: 'ready', key, tabId, video });
        // Subtitles are free to fetch, so warm them up before the first question.
        getTranscript(video).catch(() => {});
      } catch (error) {
        if (currentKey !== identity) return;
        setState({ status: 'error', key, tabId, error: error instanceof Error ? error.message : String(error) });
      }
    };

    const refresh = async () => {
      const [tab] = await browser.tabs.query({ active: true, windowId });
      void resolve(tab?.id, tab?.url);
    };

    const onActivated = (info: { windowId: number }) => {
      if (info.windowId === windowId) void refresh();
    };
    // B站 is a SPA: switching videos only changes the URL.
    const onUpdated = (tabId: number, change: { url?: string }, tab: { active: boolean; windowId?: number }) => {
      if (change.url && tab.active && tab.windowId === windowId) void resolve(tabId, change.url);
    };

    browser.windows.getCurrent().then((win) => {
      windowId = win.id;
      void refresh();
    });
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return state;
}
