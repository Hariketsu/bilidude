import { buildVideoUrl, parseVideoUrl } from './bili/url';
import type { VideoRef } from './types';

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Seeks the player if the active tab shows this video; otherwise opens it at that time. */
export async function seekVideo(video: VideoRef, seconds: number) {
  const tab = await getActiveTab();
  if (tab?.id === undefined) return;

  const location = parseVideoUrl(tab.url);
  if (location?.bvid !== video.bvid || location.p !== video.p) {
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
