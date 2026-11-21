// The prompt eval's inputs and results (docs/PROMPT-EVAL.md), shared by run.ts and report.ts.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentResult } from '@/lib/llm/agent';
import type { PresetId, Transcript, VideoRef } from '@/lib/types';

export const EVAL = new URL('./', import.meta.url);

export interface Case {
  id: string;
  video: number;
  category: string;
  preset?: PresetId;
  text?: string;
  playback?: number;
  search?: boolean;
  followUp?: string;
}

export interface Turn {
  prompt: string;
  text: string;
  sources: AgentResult['sources'];
  steps: AgentResult['steps'];
  stopReason: string;
  error?: string;
  ms: number;
  usage: { input: number; output: number; cacheRead: number; cost: number };
}

export interface Result {
  caseId: string;
  version: string;
  run: number;
  model: string;
  date: string;
  turns: Turn[];
}

export interface Material {
  video: VideoRef;
  transcript: Transcript;
}

/** eval/videos/<n>. <title>.json, by n. */
export async function loadVideos(): Promise<Map<number, Material>> {
  const videos = new Map<number, Material>();
  // File names are video titles, which can hold `#` and other characters a URL would mangle.
  const dir = fileURLToPath(new URL('videos/', EVAL));
  for (const name of await readdir(dir)) {
    const n = /^(\d+)\..*\.json$/.exec(name)?.[1];
    if (n) videos.set(Number(n), JSON.parse(await readFile(join(dir, name), 'utf8')));
  }
  return videos;
}

export async function loadCases(): Promise<Case[]> {
  return JSON.parse(await readFile(new URL('cases.json', EVAL), 'utf8')).cases;
}
