import { strToU8, zipSync } from 'fflate';
import type { AsrConfig } from './asr/providers';
import { cancelTranscription, transcribeVideo } from './asr/transcribe';
import type { Session } from './db';
import { fileNameFor, saveBlob, saveTextFile, sessionToMarkdown } from './export';
import { subtitleFile, type SubtitleFormat } from './subtitles';
import { getTranscript } from './transcript';
import type { Transcript, VideoRef } from './types';

export type ExportFormat = 'md' | SubtitleFormat;
export type ExportBundle = 'zip' | 'files';

interface ExportFile {
  name: string;
  text: string;
  type: string;
}

/** Separate downloads started back to back can be dropped; this spaces them out. */
const FILE_GAP_MS = 300;

const keyOf = (video: VideoRef) => `${video.bvid}:${video.cid}`;

/** The sessions' videos, each once. */
export function uniqueVideos(sessions: Session[]): VideoRef[] {
  return [...new Map(sessions.map((s) => [keyOf(s.video), s.video])).values()];
}

/** Each video's subtitles, or `null` when only a transcription would get them. */
export async function loadTranscripts(videos: VideoRef[]): Promise<Map<string, Transcript | null>> {
  const entries = await Promise.all(
    videos.map(async (video) => [keyOf(video), await getTranscript(video).catch(() => null)] as const),
  );
  return new Map(entries);
}

export interface ExportJob {
  sessions: Session[];
  formats: ExportFormat[];
  bundle: ExportBundle;
  /** Transcribes videos without subtitles (one at a time) instead of skipping them. */
  asr?: AsrConfig;
  links: boolean;
  signal: AbortSignal;
  onTranscribing?: (done: number, total: number) => void;
}

/**
 * Downloads each session as Markdown and each video's subtitles, as one ZIP or as separate files.
 * Separate files go out as soon as they're ready; a ZIP waits for everything (or what's done when stopped).
 */
export async function runExport({ sessions, formats, bundle, asr, links, signal, onTranscribing }: ExportJob) {
  const subtitleFormats = formats.filter((f): f is SubtitleFormat => f !== 'md');
  const videos = uniqueVideos(sessions);
  const transcripts = subtitleFormats.length > 0 ? await loadTranscripts(videos) : new Map();
  const missing = videos.filter((video) => transcripts.get(keyOf(video)) === null);

  const files: ExportFile[] = [];
  const taken = new Set<string>();
  const add = async (...added: ExportFile[]) => {
    for (const file of added) {
      file.name = uniqueName(file.name, taken);
      if (bundle === 'files') {
        if (files.length > 0) await new Promise((resolve) => setTimeout(resolve, FILE_GAP_MS));
        saveTextFile(file.name, file.text, file.type);
      }
      files.push(file);
    }
  };
  const subtitlesOf = (video: VideoRef, transcript: Transcript) =>
    subtitleFormats.map((format) => subtitleFile(video, transcript, format));

  if (formats.includes('md')) {
    for (const session of sessions) {
      await add({ name: fileNameFor(session.video, 'md'), text: await sessionToMarkdown(session, links), type: 'text/markdown' });
    }
  }
  for (const video of videos) {
    const transcript = transcripts.get(keyOf(video));
    if (transcript) await add(...subtitlesOf(video, transcript));
  }

  let transcribed = 0;
  let failed = 0;
  if (asr) {
    for (const [i, video] of missing.entries()) {
      if (signal.aborted) break;
      onTranscribing?.(i, missing.length);
      const stop = () => cancelTranscription(video);
      signal.addEventListener('abort', stop);
      try {
        await add(...subtitlesOf(video, await transcribeVideo(video, asr)));
        transcribed++;
      } catch {
        if (!signal.aborted) failed++;
      } finally {
        signal.removeEventListener('abort', stop);
      }
    }
  }

  if (bundle === 'zip' && files.length > 0) {
    if (files.length === 1) saveTextFile(files[0]!.name, files[0]!.text, files[0]!.type);
    else {
      const zip = zipSync(Object.fromEntries(files.map((file) => [file.name, strToU8(file.text)])));
      const date = new Date().toISOString().slice(0, 10);
      saveBlob(`bilidude-${date}.zip`, new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
    }
  }
  return { skipped: missing.length - transcribed - failed, failed };
}

/** `a.md`, `a (2).md`, … so sessions about the same video don't overwrite each other. */
function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  let candidate = name;
  for (let n = 2; taken.has(candidate); n++) candidate = `${name.slice(0, dot)} (${n})${name.slice(dot)}`;
  taken.add(candidate);
  return candidate;
}
