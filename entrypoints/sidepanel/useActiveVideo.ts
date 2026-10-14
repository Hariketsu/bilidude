import { useEffect, useState } from 'react';
import { fetchVideoInfo } from '@/lib/bili/api';
import { parseVideoUrl } from '@/lib/bili/url';
import { getTranscript } from '@/lib/transcript';
import type { VideoRef } from '@/lib/types';

export type ActiveVideo =
  | { status: 'none' }
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; video: VideoRef }
  | { status: 'error'; key: string; error: string };

/** Tracks the bilibili video shown in this window's active tab. */
export function useActiveVideo(): ActiveVideo {
  const [state, setState] = useState<ActiveVideo>({ status: 'none' });

  useEffect(() => {
    let windowId: number | undefined;
    let currentKey: string | undefined;

    const resolve = async (url: string | undefined) => {
      const location = parseVideoUrl(url);
      const key = location && `${location.bvid}:${location.p}`;
      if (key === currentKey) return;
      currentKey = key ?? undefined;
      if (!location || !key) {
        setState({ status: 'none' });
        return;
      }

      setState({ status: 'loading', key });
      try {
        const info = await fetchVideoInfo(location.bvid);
        const page = info.pages.find((item) => item.page === location.p) ?? info.pages[0];
        if (!page) throw new Error('Video has no playable parts');
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
        if (currentKey !== key) return;
        setState({ status: 'ready', key, video });
        // Subtitles are free to fetch, so warm them up before the first question.
        getTranscript(video).catch(() => {});
      } catch (error) {
        if (currentKey !== key) return;
        setState({ status: 'error', key, error: error instanceof Error ? error.message : String(error) });
      }
    };

    const refresh = async () => {
      const [tab] = await browser.tabs.query({ active: true, windowId });
      void resolve(tab?.url);
    };

    const onActivated = (info: { windowId: number }) => {
      if (info.windowId === windowId) void refresh();
    };
    // B站 is a SPA: switching videos only changes the URL.
    const onUpdated = (_tabId: number, change: { url?: string }, tab: { active: boolean; windowId?: number }) => {
      if (change.url && tab.active && tab.windowId === windowId) void resolve(change.url);
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
