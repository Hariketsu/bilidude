import type { Transcript, VideoRef } from '../types';

/** The video and its merged transcript, exactly what the prompt is built from (used by the prompt eval). */
export function toVideoJson(video: VideoRef, transcript: Transcript): string {
  // Cues are the unmerged lines kept for subtitle downloads; the model never sees them.
  const { cues: _, ...rest } = transcript;
  return `${JSON.stringify({ video, transcript: rest }, null, 2)}\n`;
}
