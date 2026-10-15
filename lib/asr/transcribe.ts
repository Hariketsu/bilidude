import { fetchPlayerInfo } from '../bili/api';
import { deleteAsrChunks, loadAsrChunk, storeAsrChunk, storeTranscript } from '../db';
import { mergeLines, parseAuthorChapters, rememberTranscript, toCues } from '../transcript';
import type { Transcript, VideoRef } from '../types';
import { splitAac } from './aac';
import { planCuts } from './silence';
import { downloadAudio } from './audio';
import { transcribeChunk, type AsrConfig, type ChunkTranscript } from './providers';
import { t } from '../i18n';

export type AsrProgress =
  | { stage: 'downloading'; fraction: number }
  | { stage: 'transcribing'; done: number; total: number; startedAt: number };

/** Overall 0–100: downloading the audio is the first 10%, transcribing its chunks the rest. */
export function asrPercent(progress: AsrProgress): number {
  return progress.stage === 'downloading' ? progress.fraction * 10 : 10 + (progress.done / progress.total) * 90;
}

const CONCURRENCY = 2;
const RETRIES = 2;

interface Job {
  promise: Promise<Transcript>;
  controller: AbortController;
  progress: AsrProgress;
  listeners: Set<(progress: AsrProgress) => void>;
}

/** One transcription per video at a time, shared by everyone waiting on it. */
const jobs = new Map<string, Job>();
/** Everyone showing a video's transcription state, whether or not a job is running. */
const watchers = new Map<string, Set<(progress: AsrProgress | undefined) => void>>();

const keyOf = (video: VideoRef) => `${video.bvid}:${video.cid}`;
const notify = (key: string, progress: AsrProgress | undefined) => watchers.get(key)?.forEach((watch) => watch(progress));

/** Calls `listener` with the video's transcription progress now and on every change; `undefined` when none runs. */
export function watchTranscription(video: VideoRef, listener: (progress: AsrProgress | undefined) => void) {
  const key = keyOf(video);
  const set = watchers.get(key) ?? new Set();
  watchers.set(key, set.add(listener));
  listener(jobs.get(key)?.progress);
  return () => {
    set.delete(listener);
    if (set.size === 0) watchers.delete(key);
  };
}

/** Stops the video's transcription; whoever waits on it gets an AbortError. Finished chunks stay cached. */
export function cancelTranscription(video: VideoRef) {
  jobs.get(keyOf(video))?.controller.abort();
}

/**
 * Transcribes the video's audio (or joins a running transcription) and stores the result
 * as its transcript. Runs while the side panel is open; finished chunks survive closing it.
 */
export function transcribeVideo(video: VideoRef, config: AsrConfig, onProgress?: (p: AsrProgress) => void) {
  const key = keyOf(video);
  let job = jobs.get(key);
  if (!job) {
    const created: Job = {
      progress: { stage: 'downloading', fraction: 0 },
      controller: new AbortController(),
      listeners: new Set(),
      promise: undefined!,
    };
    const report = (progress: AsrProgress) => {
      created.progress = progress;
      created.listeners.forEach((listener) => listener(progress));
      notify(key, progress);
    };
    created.promise = run(video, config, report, created.controller.signal).finally(() => {
      jobs.delete(key);
      notify(key, undefined);
    });
    jobs.set(key, created);
    notify(key, created.progress);
    job = created;
  }
  if (onProgress) {
    job.listeners.add(onProgress);
    onProgress(job.progress);
    void job.promise.finally(() => job.listeners.delete(onProgress)).catch(() => {});
  }
  return job.promise;
}

async function run(
  video: VideoRef,
  config: AsrConfig,
  report: (p: AsrProgress) => void,
  signal: AbortSignal,
): Promise<Transcript> {
  const track = await downloadAudio(video, signal, (loaded, total) =>
    report({ stage: 'downloading', fraction: total ? loaded / total : 0 }),
  );
  const chunks = splitAac(track, await planCuts(track, config.chunkSeconds));
  const results: ChunkTranscript[] = new Array(chunks.length);
  let done = 0;
  const startedAt = Date.now();
  report({ stage: 'transcribing', done, total: chunks.length, startedAt });

  // Chunk bounds follow the audio's pauses, so the key names the span rather than an index.
  const cacheKey = (chunk: (typeof chunks)[number]) => {
    const span = [chunk.startSec, chunk.durationSec].map((s) => Math.round(s * 1000));
    return [video.bvid, video.cid, config.provider.id, config.model, ...span].join(':');
  };

  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      signal.throwIfAborted();
      const chunk = chunks[next++]!;
      const key = cacheKey(chunk);
      let result = await loadAsrChunk(key);
      for (let attempt = 0; !result; attempt++) {
        try {
          result = await transcribeChunk(config, chunk, track.sampleRate, signal);
        } catch (error) {
          if (signal.aborted) throw error;
          const retryable = (error as { retryable?: boolean }).retryable ?? error instanceof TypeError; // TypeError: network
          if (!retryable || attempt >= RETRIES) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
        }
      }
      await storeAsrChunk(key, result);
      results[chunk.index] = result;
      report({ stage: 'transcribing', done: ++done, total: chunks.length, startedAt });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
  signal.throwIfAborted();

  const body = chunks.flatMap((chunk, i) =>
    results[i]!.segments.map((s) => ({
      from: chunk.startSec + s.start,
      to: chunk.startSec + Math.min(s.end, chunk.durationSec),
      content: s.text,
    })),
  );
  if (body.length === 0) throw new Error(t('errors.noSpeech'));

  const { chapters: official } = await fetchPlayerInfo(video.aid, video.cid, video.bvid).catch(() => ({ chapters: [] }));
  const chapters = official.length > 0 ? official : parseAuthorChapters(video.desc);
  const transcript: Transcript = {
    source: 'asr',
    lang: '',
    lines: mergeLines(body, chapters),
    cues: toCues(body),
    chapters,
    approximateTimes: results.some((r) => r.approximate) || undefined,
  };
  await storeTranscript(`${video.bvid}:${video.cid}`, transcript);
  await deleteAsrChunks(`${video.bvid}:${video.cid}`);
  rememberTranscript(video, transcript);
  return transcript;
}
