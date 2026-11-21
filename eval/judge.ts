// Blind pairwise judging for the prompt eval (docs/PROMPT-EVAL.md): each version's first-run answer
// against the baseline's, sides shuffled. Results go to eval/results/<case>/judge-<version>.json.
//   pnpm eval:judge [--video 1] [--case 1-recap] [--concurrency 4]
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import { runAgent } from '@/lib/llm/agent';
import { reasoningOption, resolveModel } from '@/lib/llm/providers';
import { formatTimestamp, parseTimestamp, TIMESTAMP_PATTERN } from '@/lib/render/timestamp';
import { EVAL, loadCases, loadVideos, type Case, type Material, type Result } from './data';
import type { Judgement } from './report';

const JUDGE_MODEL = 'deepseek-v4-pro';
const BASELINE = 'v1';
const VERSIONS = ['v0', 'v2', 'vmin'];
const MAX_EXCERPT_LINES = 80;

globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(performance.now()), 16) as unknown as number;
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);

const { values: args } = parseArgs({
  options: { video: { type: 'string' }, case: { type: 'string' }, concurrency: { type: 'string', default: '4' } },
});

const apiKey = process.env.E2E_LLM_API_KEY;
if (!apiKey || process.env.E2E_LLM_PROVIDER !== 'deepseek') throw new Error('Set E2E_LLM_PROVIDER=deepseek and E2E_LLM_API_KEY in .env.local');
const resolved = resolveModel({
  provider: 'deepseek',
  models: { deepseek: JUDGE_MODEL },
  apiKeys: { deepseek: apiKey },
  baseUrls: {},
  openaiApi: 'responses',
  thinking: 'medium',
  webSearch: false,
  deepseekAuth: 'key',
})!;

const SYSTEM = `You compare two answers from BiliDude, a browser extension that answers questions about the Bilibili video the user is watching. Answers appear in a narrow side panel next to the video. Timestamps like [03:05] become buttons that seek the video; blockquotes are meant to be verbatim quotes from the transcript, and the panel shows quotes it cannot find in the transcript as ordinary text. [n] marks cite web pages.

Decide which answer a user of this product would rather get for this question. Consider whether it answers what was asked, whether it is accurate to the transcript excerpt, whether its length and structure fit the question and the narrow panel, and whether it follows any format the user asked for. Do not prefer an answer just because it is longer or more detailed. The two answers come from different versions in random order.

Reply with JSON only: {"preference": "A" | "B" | "tie", "reason": "<one sentence in Chinese>"}`;

async function load(c: Case, version: string): Promise<Result | undefined> {
  const file = new URL(`results/${c.id}/${version}-1.json`, EVAL);
  return existsSync(file) ? JSON.parse(await readFile(file, 'utf8')) : undefined;
}

/** Transcript lines around the times either answer cites, and the playback position. */
function excerpt(material: Material, texts: string[], playback?: number): string {
  const { lines } = material.transcript;
  const wanted = new Set<number>();
  const near = (seconds: number) => {
    let index = 0;
    for (const [i, line] of lines.entries()) if (line.from <= seconds) index = i;
    for (let i = index - 1; i <= index + 1; i++) if (i >= 0 && i < lines.length) wanted.add(i);
  };
  for (const text of texts) for (const m of text.matchAll(TIMESTAMP_PATTERN)) near(parseTimestamp(m[1], m[2]!, m[3]!));
  if (playback !== undefined) near(playback);
  return [...wanted]
    .sort((a, b) => a - b)
    .slice(0, MAX_EXCERPT_LINES)
    .map((i) => `[${formatTimestamp(lines[i]!.from)}] ${lines[i]!.text}`)
    .join('\n');
}

function conversation(result: Result): string {
  return result.turns.map((t, i) => `${i ? `Follow-up question: ${t.prompt}\n\n` : ''}${t.text}`).join('\n\n');
}

async function judge(c: Case, version: string, material: Material): Promise<{ judgement: Judgement; cost: number } | undefined> {
  const [mine, base] = await Promise.all([load(c, version), load(c, BASELINE)]);
  if (!mine || !base) return undefined;
  // Stable per pair, so a rerun shows the judge the same sides.
  const swap = createHash('sha1').update(`${c.id}:${version}`).digest()[0]! % 2 === 1;
  const [a, b] = swap ? [base, mine] : [mine, base];
  const { video } = material;
  const prompt = `<video>
Title: ${video.title}${video.partTitle ? ` (P${video.p} ${video.partTitle})` : ''}
Uploader: ${video.upName}
Duration: ${formatTimestamp(video.durationSec)}
${video.desc ? `Description: ${video.desc.slice(0, 600)}` : ''}
</video>

<transcript_excerpt>
${excerpt(material, [conversation(a), conversation(b)], c.playback)}
</transcript_excerpt>

<question>
${base.turns[0]!.prompt}
</question>

<answer_A>
${conversation(a)}
</answer_A>

<answer_B>
${conversation(b)}
</answer_B>`;
  const result = await runAgent({
    model: resolved.model,
    apiKey: resolved.apiKey,
    reasoning: reasoningOption(resolved.model, 'medium'),
    sessionId: `judge-${c.id}-${version}`,
    signal: AbortSignal.timeout(5 * 60_000),
    systemPrompt: SYSTEM,
    history: [],
    prompt,
    tools: [],
    onProgress: () => {},
  });
  const cost = result.final?.usage.cost.total ?? 0;
  const json = result.text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error(`Judge gave no JSON: ${result.final?.errorMessage ?? result.text.slice(0, 200)}`);
  const { preference, reason } = JSON.parse(json) as { preference: 'A' | 'B' | 'tie'; reason: string };
  const winnerOf = { A: swap ? BASELINE : version, B: swap ? version : BASELINE, tie: 'tie' };
  return { judgement: { version, winner: winnerOf[preference], reason }, cost };
}

async function main() {
  const videos = await loadVideos();
  const only = (list?: string) => (list ? new Set(list.split(',')) : undefined);
  const videoFilter = only(args.video);
  const caseFilter = only(args.case);
  const cases = (await loadCases()).filter(
    (c) => (!videoFilter || videoFilter.has(String(c.video))) && (!caseFilter || caseFilter.has(c.id)),
  );
  const jobs = cases.flatMap((c) =>
    VERSIONS.map((version) => ({ c, version, file: new URL(`results/${c.id}/judge-${version}.json`, EVAL) })).filter((j) => !existsSync(j.file)),
  );
  console.log(`${jobs.length} pairs to judge`);
  let cost = 0;
  const worker = async () => {
    for (let job = jobs.shift(); job; job = jobs.shift()) {
      const { c, version, file } = job;
      try {
        const judged = await judge(c, version, videos.get(c.video)!);
        if (!judged) continue; // Answers not run yet.
        cost += judged.cost;
        await writeFile(file, `${JSON.stringify(judged.judgement, null, 2)}\n`);
        console.log(`✓ ${c.id} ${version}: ${judged.judgement.winner}  (total $${cost.toFixed(4)})`);
      } catch (error) {
        console.log(`✗ ${c.id} ${version}: ${error instanceof Error ? error.message : error}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));
  console.log(`Finished, cost $${cost.toFixed(4)}`);
}

await main();
