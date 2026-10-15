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

/** The video's subtitles as a file; transcripts cached before cues were kept fall back to the merged lines. */
export function subtitleFile(video: VideoRef, transcript: Transcript, format: SubtitleFormat) {
  const cues = transcript.cues ?? transcript.lines;
  return format === 'srt'
    ? { name: fileNameFor(video, 'srt'), text: toSrt(cues), type: 'application/x-subrip' }
    : { name: fileNameFor(video, 'txt'), text: toTxt(cues), type: 'text/plain' };
}

export function downloadSubtitles(video: VideoRef, transcript: Transcript, format: SubtitleFormat) {
  const file = subtitleFile(video, transcript, format);
  saveTextFile(file.name, file.text, file.type);
}
