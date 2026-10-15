import { fileNameFor, saveTextFile } from './export';
import type { Transcript, TranscriptLine, VideoRef } from './types';

export type SubtitleFormat = 'srt' | 'txt';

/** `65.5` → `00:01:05,500`. */
function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

export function toSrt(cues: TranscriptLine[]): string {
  return cues.map((cue, i) => `${i + 1}\n${srtTime(cue.from)} --> ${srtTime(cue.to)}\n${cue.text}\n`).join('\n');
}

/** Just the words, one subtitle line per line. */
export function toTxt(cues: TranscriptLine[]): string {
  return `${cues.map((cue) => cue.text).join('\n')}\n`;
}

/** Saves the video's subtitles; transcripts cached before cues were kept fall back to the merged lines. */
export function downloadSubtitles(video: VideoRef, transcript: Transcript, format: SubtitleFormat) {
  const cues = transcript.cues ?? transcript.lines;
  if (format === 'srt') saveTextFile(fileNameFor(video, 'srt'), toSrt(cues), 'application/x-subrip');
  else saveTextFile(fileNameFor(video, 'txt'), toTxt(cues), 'text/plain');
}
