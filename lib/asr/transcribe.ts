import { fetchPlayerInfo } from '../bili/api';
import { loadAsrChunk, storeAsrChunk, storeTranscript } from '../db';
import { mergeLines, parseAuthorChapters, rememberTranscript } from '../transcript';
import type { Transcript, VideoRef } from '../types';
import { splitAac } from './aac';
import { downloadAudio } from './audio';
import { transcribeChunk, type AsrConfig, type ChunkTranscript } from './providers';

export type AsrProgress = { stage: 'downloading'; fraction: number } | { stage: 'transcribing'; done: number; total: number };

const CONCURRENCY = 2;
const RETRIES = 2;

interface Job {
  promise: Promise<Transcript>;
  progress: AsrProgress;
  listeners: Set<(progress: AsrProgress) => void>;
}

/** One transcription per video at a time, shared by everyone waiting on it. */
const jobs = new Map<string, Job>();

/**
 * Transcribes the video's audio (or joins a running transcription) and stores the result
 * as its transcript. Runs while the side panel is open; finished chunks survive closing it.
 */
export function transcribeVideo(video: VideoRef, config: AsrConfig, onProgress?: (p: AsrProgress) => void) {
  const key = `${video.bvid}:${video.cid}`;
  let job = jobs.get(key);
  if (!job) {
    const created: Job = { progress: { stage: 'downloading', fraction: 0 }, listeners: new Set(), promise: undefined! };
    const report = (progress: AsrProgress) => {
      created.progress = progress;
      created.listeners.forEach((listener) => listener(progress));
    };
    created.promise = run(video, config, report).finally(() => jobs.delete(key));
    jobs.set(key, created);
    job = created;
  }
  if (onProgress) {
    job.listeners.add(onProgress);
    onProgress(job.progress);
    void job.promise.finally(() => job.listeners.delete(onProgress)).catch(() => {});
  }
  return job.promise;
}

async function run(video: VideoRef, config: AsrConfig, report: (p: AsrProgress) => void): Promise<Transcript> {
  const track = await downloadAudio(video, new AbortController().signal, (loaded, total) =>
    report({ stage: 'downloading', fraction: total ? loaded / total : 0 }),
  );
  const chunks = splitAac(track, config.chunkSeconds);
  const results: ChunkTranscript[] = new Array(chunks.length);
  let done = 0;
  report({ stage: 'transcribing', done, total: chunks.length });

  const cacheKey = (index: number) =>
    [video.bvid, video.cid, config.provider.id, config.model, config.chunkSeconds, index].join(':');

  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++]!;
      const key = cacheKey(chunk.index);
      let result = await loadAsrChunk(key);
      for (let attempt = 0; !result; attempt++) {
        try {
          result = await transcribeChunk(config, chunk, track.sampleRate);
        } catch (error) {
          const retryable = (error as { retryable?: boolean }).retryable ?? error instanceof TypeError; // TypeError: network
          if (!retryable || attempt >= RETRIES) throw error;
          await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
        }
      }
      await storeAsrChunk(key, result);
      results[chunk.index] = result;
      report({ stage: 'transcribing', done: ++done, total: chunks.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

  const body = chunks.flatMap((chunk, i) =>
    results[i]!.segments.map((s) => ({
      from: chunk.startSec + s.start,
      to: chunk.startSec + Math.min(s.end, chunk.durationSec),
      content: s.text,
    })),
  );
  if (body.length === 0) throw new Error('No speech was recognized in this video');

  const { chapters: official } = await fetchPlayerInfo(video.aid, video.cid, video.bvid).catch(() => ({ chapters: [] }));
  const chapters = official.length > 0 ? official : parseAuthorChapters(video.desc);
  const transcript: Transcript = {
    source: 'asr',
    lang: '',
    lines: mergeLines(body, chapters),
    chapters,
    approximateTimes: results.some((r) => r.approximate) || undefined,
  };
  await storeTranscript(`${video.bvid}:${video.cid}`, transcript);
  rememberTranscript(video, transcript);
  return transcript;
}
