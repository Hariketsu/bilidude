// Runs the prompt eval's cases against each prompt version (docs/PROMPT-EVAL.md).
//   pnpm eval [--video 1,2] [--case 1-recap] [--versions current,v1,vmin] [--runs 3] [--concurrency 4]
// Needs E2E_LLM_API_KEY (a DeepSeek key) in .env.local. Results go to eval/results/<case>/<version>-<run>.json;
// existing results are kept, so an interrupted run continues where it stopped.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import type { Message } from '@earendil-works/pi-ai';
import { runAgent } from '@/lib/llm/agent';
import * as current from '@/lib/llm/prompt';
import { resolveModel } from '@/lib/llm/providers';
import type { PresetId, Transcript, VideoRef } from '@/lib/types';
import { EVAL, loadCases, loadVideos, type Case, type Result, type Turn } from './data';
import * as v1 from './variants/v1';
import * as vmin from './variants/vmin';

type Search = 'server' | 'client' | 'off';
interface Variant {
  buildSystemPrompt(video: VideoRef, transcript: Transcript, outputLanguage: string, search?: Search): string;
  buildUserPrompt(text: string, preset?: PresetId, playbackSeconds?: number): string;
}
const VARIANTS = { current, v1, vmin } as Record<string, Variant>;

const MODEL = 'deepseek-flash';
// What the extension sends with a Simplified Chinese browser (resolveOutputLanguage).
const OUTPUT_LANGUAGE = new Intl.DisplayNames(['en'], { type: 'language' }).of('zh-CN')!;

// runAgent reports progress once per frame.
globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()), 16) as unknown as number;
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);

const { values: args } = parseArgs({
  options: {
    video: { type: 'string' },
    case: { type: 'string' },
    versions: { type: 'string', default: 'current,v1,vmin' },
    runs: { type: 'string', default: '3' },
    concurrency: { type: 'string', default: '4' },
  },
});

const apiKey = process.env.E2E_LLM_API_KEY;
if (!apiKey || process.env.E2E_LLM_PROVIDER !== 'deepseek') throw new Error('Set E2E_LLM_PROVIDER=deepseek and E2E_LLM_API_KEY in .env.local');
const resolved = resolveModel({
  provider: 'deepseek',
  models: { deepseek: MODEL },
  apiKeys: { deepseek: apiKey },
  baseUrls: {},
  openaiApi: 'responses',
  thinking: 'off',
  webSearch: false,
  deepseekAuth: 'key',
});
if (!resolved) throw new Error(`Unknown model ${MODEL}`);

async function answer(
  run: { systemPrompt: string; history: Message[]; prompt: string; serverSearch: boolean; sessionId: string },
): Promise<{ turn: Turn; messages: Message[] }> {
  const started = Date.now();
  const result = await runAgent({
    model: resolved!.model,
    apiKey: resolved!.apiKey,
    sessionId: run.sessionId,
    signal: AbortSignal.timeout(5 * 60_000),
    systemPrompt: run.systemPrompt,
    history: run.history,
    prompt: run.prompt,
    tools: [],
    serverSearch: run.serverSearch,
    onProgress: () => {},
  });
  const assistant = result.messages.filter((m) => m.role === 'assistant');
  const usages = (assistant.length ? assistant : result.final ? [result.final] : []).map((m) => m.usage);
  const sum = (pick: (u: (typeof usages)[number]) => number) => usages.reduce((total, u) => total + pick(u), 0);
  return {
    turn: {
      prompt: run.prompt,
      text: result.text,
      sources: result.sources,
      steps: result.steps,
      stopReason: result.final?.stopReason ?? 'error',
      error: result.final?.errorMessage,
      ms: Date.now() - started,
      usage: { input: sum((u) => u.input), output: sum((u) => u.output), cacheRead: sum((u) => u.cacheRead), cost: sum((u) => u.cost.total) },
    },
    // The next turn's history, as the extension builds it (useChat's toHistory).
    messages: [...run.history, { role: 'user', content: run.prompt, timestamp: Date.now() }, ...result.messages],
  };
}

async function runCase(c: Case, version: string, run: number, material: { video: VideoRef; transcript: Transcript }): Promise<Result> {
  const variant = VARIANTS[version]!;
  // Search is available (DeepSeek) but off unless the case turns it on; current knows about "off".
  const search: Search | undefined = c.search ? 'server' : version === 'current' ? 'off' : undefined;
  const systemPrompt = variant.buildSystemPrompt(material.video, material.transcript, OUTPUT_LANGUAGE, search);
  const sessionId = `${c.id}-${version}-${run}`;
  const turns: Turn[] = [];
  let history: Message[] = [];
  for (const [i, text] of [c.text ?? '', ...(c.followUp ? [c.followUp] : [])].entries()) {
    const prompt = variant.buildUserPrompt(text, i === 0 ? c.preset : undefined, i === 0 ? c.playback : undefined);
    const { turn, messages } = await answer({ systemPrompt, history, prompt, serverSearch: !!c.search, sessionId });
    turns.push(turn);
    history = messages;
    if (turn.stopReason === 'error') break;
  }
  return { caseId: c.id, version, run, model: MODEL, date: new Date().toISOString(), turns };
}

async function main() {
  const videos = await loadVideos();
  const only = (list?: string) => (list ? new Set(list.split(',')) : undefined);
  const videoFilter = only(args.video);
  const caseFilter = only(args.case);
  const versions = args.versions!.split(',');
  for (const version of versions) if (!VARIANTS[version]) throw new Error(`Unknown version ${version}`);
  const cases = (await loadCases()).filter(
    (c) => (!videoFilter || videoFilter.has(String(c.video))) && (!caseFilter || caseFilter.has(c.id)),
  );

  const jobs: { c: Case; version: string; run: number; file: URL }[] = [];
  for (const c of cases) {
    if (!videos.has(c.video)) throw new Error(`Case ${c.id}: no eval/videos/${c.video}.*.json`);
    for (let run = 1; run <= Number(args.runs); run++) {
      for (const version of versions) {
        const file = new URL(`results/${c.id}/${version}-${run}.json`, EVAL);
        if (!existsSync(file)) jobs.push({ c, version, run, file });
      }
    }
  }
  console.log(`${jobs.length} to run (${cases.length} cases × ${versions.join(', ')} × ${args.runs} runs, done ones skipped)`);

  let cost = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const { c, version, run, file } = job;
      const result = await runCase(c, version, run, videos.get(c.video)!);
      const turnCost = result.turns.reduce((total, t) => total + t.usage.cost, 0);
      cost += turnCost;
      done++;
      const error = result.turns.find((t) => t.stopReason !== 'stop')?.error;
      if (error || result.turns.some((t) => t.stopReason !== 'stop')) {
        // Not saved, so the next run retries it.
        failed++;
        console.log(`✗ ${c.id} ${version} #${run}: ${result.turns.map((t) => t.stopReason).join(', ')} ${error ?? ''}`);
        continue;
      }
      await mkdir(new URL('.', file), { recursive: true });
      await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
      console.log(`✓ ${c.id} ${version} #${run}  $${turnCost.toFixed(4)}  (${done} done, total $${cost.toFixed(4)})`);
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));
  console.log(`Finished: ${done - failed} saved, ${failed} failed, cost $${cost.toFixed(4)}`);
}

await main();
