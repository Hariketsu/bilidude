import { buildVideoUrl, parseVideoUrl } from './bili/url';
import type { VideoRef } from './types';

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** The tab shows this video (same part). */
function isShowing(url: string | undefined, video: VideoRef): boolean {
  const location = parseVideoUrl(url);
  return location?.bvid === video.bvid && location.p === video.p;
}

/** Playback position of the video in the active tab, if it is this video. */
export async function getPlaybackTime(video: VideoRef): Promise<number | undefined> {
  const tab = await getActiveTab();
  if (tab?.id === undefined || !isShowing(tab.url, video)) return undefined;
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, video')?.currentTime ?? null,
    });
    return typeof result?.result === 'number' ? result.result : undefined;
  } catch {
    return undefined;
  }
}

/** Seeks the player if the active tab shows this video; otherwise opens it at that time. */
export async function seekVideo(video: VideoRef, seconds: number) {
  const tab = await getActiveTab();
  if (tab?.id === undefined) return;

  if (!isShowing(tab.url, video)) {
    await browser.tabs.update(tab.id, { url: buildVideoUrl(video, seconds) });
    return;
  }
  await browser.scripting.executeScript({
    target: { tabId: tab.id },
    args: [seconds],
    func: (time: number) => {
      const player = document.querySelector<HTMLVideoElement>('.bpx-player-video-wrap video, video');
      if (!player) return;
      player.currentTime = time;
      // May be rejected by the autoplay policy before any user interaction; seeking still works.
      player.play().catch(() => {});
    },
  });
}
