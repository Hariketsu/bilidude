import {
  fetchPlayerInfo,
  fetchSubtitleBody,
  type BiliChapter,
  type BiliSubtitleLine,
  type BiliSubtitleTrack,
} from './bili/api';
import { loadStoredTranscript, storeTranscript } from './db';
import type { Chapter, Transcript, TranscriptLine, VideoRef } from './types';

/** Target length of one merged line sent to the model (docs/DESIGN.md §5.1). */
const LINE_SECONDS = 10;
/** A pause longer than this always starts a new line. */
const MAX_GAP_SECONDS = 2;
/** Subtitles running past the video by more than this belong to another video. */
const DURATION_TOLERANCE_SECONDS = 30;

const cache = new Map<string, Promise<Transcript | null>>();

/** Loads (once per part, cached in IndexedDB) the transcript of a video; `null` when it has no usable subtitles. */
export function getTranscript(video: VideoRef): Promise<Transcript | null> {
  const key = `${video.bvid}:${video.cid}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = loadTranscript(video);
    // Let a failed request be retried on the next call.
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

async function loadTranscript(video: VideoRef): Promise<Transcript | null> {
  const key = `${video.bvid}:${video.cid}`;
  const stored = await loadStoredTranscript(key);
  if (stored) return stored;
  const transcript = await fetchTranscript(video);
  if (transcript) await storeTranscript(key, transcript);
  return transcript;
}

async function fetchTranscript(video: VideoRef): Promise<Transcript | null> {
  const { tracks, chapters } = await fetchPlayerInfo(video.aid, video.cid, video.bvid);
  const mergedChapters = chapters.length > 0 ? chapters : parseAuthorChapters(video.desc);

  for (const track of rankTracks(tracks)) {
    const body = await fetchSubtitleBody(track.url);
    if (body.length === 0 || !matchesDuration(body, video.durationSec)) continue;
    return {
      source: track.lan.startsWith('ai-') ? 'ai' : 'cc',
      lang: track.lan.replace(/^ai-/, ''),
      lines: mergeLines(body, mergedChapters),
      chapters: mergedChapters,
    };
  }
  return null;
}

/** Human tracks before AI ones; Chinese first within each group. */
export function rankTracks(tracks: BiliSubtitleTrack[]): BiliSubtitleTrack[] {
  const score = (track: BiliSubtitleTrack) =>
    (track.lan.startsWith('ai-') ? 2 : 0) + (track.lan.replace(/^ai-/, '').startsWith('zh') ? 0 : 1);
  return [...tracks].sort((a, b) => score(a) - score(b));
}

function matchesDuration(body: BiliSubtitleLine[], durationSec: number): boolean {
  if (!durationSec) return true;
  return body[body.length - 1]!.to <= durationSec + DURATION_TOLERANCE_SECONDS;
}

/** Merges short subtitle lines into ~10s lines without crossing chapter starts. */
export function mergeLines(body: BiliSubtitleLine[], chapters: Chapter[] = []): TranscriptLine[] {
  const boundaries = chapters.map((chapter) => chapter.from).filter((from) => from > 0);
  const crossesChapter = (start: number, next: number) => boundaries.some((b) => start < b && next >= b);

  const lines: TranscriptLine[] = [];
  let current: TranscriptLine | undefined;
  let previousText = '';
  for (const item of [...body].sort((a, b) => a.from - b.from)) {
    const text = item.content.replace(/\s+/g, ' ').trim();
    if (!text || text === previousText) continue;
    previousText = text;

    const extend =
      current &&
      item.from - current.from < LINE_SECONDS &&
      item.from - current.to <= MAX_GAP_SECONDS &&
      !crossesChapter(current.from, item.from);
    if (current && extend) {
      current.text += ` ${text}`;
      current.to = item.to;
    } else {
      current = { from: item.from, to: item.to, text };
      lines.push(current);
    }
  }
  return lines;
}

const AUTHOR_CHAPTER_LINE = /^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s*[-–—:：|]?\s*(.+?)\s*$/;

/** Reads a timeline like `00:00 开场` / `1:02:03 - 总结` from the description; needs at least 2 entries. */
export function parseAuthorChapters(desc: string): BiliChapter[] {
  const chapters: BiliChapter[] = [];
  for (const line of desc.split('\n')) {
    const match = line.match(AUTHOR_CHAPTER_LINE);
    if (!match) continue;
    const [, hours, minutes, seconds, title] = match;
    chapters.push({ from: Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds), title: title! });
  }
  return chapters.length >= 2 ? chapters.sort((a, b) => a.from - b.from) : [];
}
