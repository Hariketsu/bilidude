import { createCitations, type Citations } from './citations';
import { loadStoredTranscript, type Session } from './db';
import { t } from './i18n';
import { formatTimestamp, parseTimestamp, TIMESTAMP_PATTERN } from './timestamp';
import type { VideoRef } from './types';

export interface ExportOptions {
  /** Write timestamps as links that open the video at that moment. */
  links: boolean;
  /** Snaps and drops timestamps the same way the panel shows them. */
  citations?: Citations;
}

export function videoUrl(video: Pick<VideoRef, 'bvid' | 'p'>, seconds?: number): string {
  const params = new URLSearchParams();
  if (video.p > 1) params.set('p', String(video.p));
  if (seconds !== undefined) params.set('t', String(seconds));
  const query = params.toString();
  return `https://www.bilibili.com/video/${video.bvid}/${query ? `?${query}` : ''}`;
}

/** An answer's Markdown with its timestamps as shown in the panel: plain `[03:05]`, or links. */
export function formatAnswer(text: string, video: VideoRef, { links, citations }: ExportOptions): string {
  return text.replace(TIMESTAMP_PATTERN, (_match, hours: string | undefined, minutes: string, secs: string) => {
    const cited = parseTimestamp(hours, minutes, secs);
    const seconds = citations ? citations.resolveTime(cited) : cited;
    if (seconds === null) return '';
    const label = `[${formatTimestamp(seconds)}]`;
    return links ? `${label}(${videoUrl(video, seconds)})` : label;
  });
}

/** The whole conversation as a Markdown document: the video, then each question and its answer. */
export async function sessionToMarkdown(session: Session, links: boolean): Promise<string> {
  const { video } = session;
  const transcript = await loadStoredTranscript(`${video.bvid}:${video.cid}`);
  const options = { links, citations: transcript && createCitations(transcript, video.durationSec) };

  const title = video.partTitle ? `${video.title} · P${video.p} ${video.partTitle}` : video.title;
  const parts = [`# ${title}`, `${videoUrl(video)}  \n${t('export.uploader', { name: video.upName })}`];
  for (const message of session.messages) {
    if (message.role === 'user') {
      const question = [message.preset && t(`presets.${message.preset}`), message.text].filter(Boolean).join(' · ');
      parts.push('---', `**${question}**`);
    } else if (message.text) {
      parts.push(formatAnswer(message.text, video, options));
    }
  }
  return `${parts.join('\n\n')}\n`;
}

/** A file name for the video: its title (plus the part for multi-part videos), minus characters file systems reject. */
export function fileNameFor(video: VideoRef, extension: string): string {
  const title = video.p > 1 ? `${video.title} P${video.p}` : video.title;
  return `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || video.bvid}.${extension}`;
}

/** Hands `text` to the browser's download flow. */
export function saveTextFile(name: string, text: string, type: string) {
  saveBlob(name, new Blob([text], { type: `${type};charset=utf-8` }));
}

export function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Revoking right away can cancel the download before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Saves the conversation as `<video title>.md`. */
export async function downloadSession(session: Session, links: boolean) {
  saveTextFile(fileNameFor(session.video, 'md'), await sessionToMarkdown(session, links), 'text/markdown');
}
