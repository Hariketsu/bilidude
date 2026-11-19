import { fetchAudioUrls } from '../bili/api';
import type { VideoRef } from '../types';
import { extractAac, type AacTrack } from './aac';

/** Downloads the video's audio track, trying backup CDN URLs in turn. */
export async function downloadAudio(
  video: VideoRef,
  signal: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<AacTrack> {
  const urls = await fetchAudioUrls(video.bvid, video.cid);
  const failures: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const total = Number(response.headers.get('content-length')) || 0;
      const parts: Uint8Array[] = [];
      let loaded = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.length;
        onProgress?.(loaded, total);
      }
      const bytes = new Uint8Array(loaded);
      let offset = 0;
      for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
      }
      return extractAac(bytes);
    } catch (error) {
      if (signal.aborted) throw error;
      // Every CDN's result goes in the message: the last one alone hides why the main CDN failed.
      failures.push(`${new URL(url).host}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Audio download failed (${failures.join('; ')})`);
}
