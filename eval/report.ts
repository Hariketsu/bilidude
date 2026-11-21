// Builds eval/results/report.html from the saved results (docs/PROMPT-EVAL.md); calls no model.
// Answers go through the extension's own remark plugins, so dropped timestamps and failed quotes
// look and count exactly as in the panel.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { remarkCitations } from '@/lib/render/remark-citations';
import { remarkTimestamps } from '@/lib/render/remark-timestamps';
import { parseTimestamp, TIMESTAMP_PATTERN } from '@/lib/render/timestamp';
import { createTranscriptCheck } from '@/lib/render/transcriptCheck';
import { EVAL, loadCases, loadVideos, type Case, type Result } from './data';

const VERSIONS = ['v0', 'v1', 'v2', 'vmin'];
const BASELINE = 'v1';

export interface Judgement {
  version: string;
  /** The version, the baseline, or a tie. */
  winner: string;
  reason: string;
}

interface Metrics {
  chars: number;
  headings: number;
  tables: number;
  timestamps: number;
  dropped: number;
  clusters: number;
  quotes: number;
  quotesPassed: number;
  cites: number;
  searches: number;
  globe: boolean;
}

interface Answer {
  c: Case;
  version: string;
  run: number;
  /** 0 for the question, 1 for the follow-up. */
  turn: number;
  category: string;
  metrics: Metrics;
  html: string;
}

/** Runs of three or more timestamps with nothing but separators between them. */
function countClusters(text: string): number {
  const matches = [...text.matchAll(TIMESTAMP_PATTERN)];
  let clusters = 0;
  let run = 1;
  for (let i = 1; i <= matches.length; i++) {
    const prev = matches[i - 1]!;
    const next = matches[i];
    const adjacent = next && /^[\s,，、;；和与]*$/.test(text.slice(prev.index! + prev[0].length, next.index));
    if (adjacent) run++;
    else {
      if (run >= 3) clusters++;
      run = 1;
    }
  }
  return clusters;
}

const components = {
  'bd-timestamp': ({ children }: { children?: ReactNode }) => createElement('span', { className: 'ts' }, children),
  'bd-paraphrase': ({ children }: { children?: ReactNode }) => createElement('blockquote', { className: 'failed' }, children),
  'bd-cite': ({ children }: { children?: ReactNode }) => createElement('sup', { className: 'cite' }, children),
} as unknown as Components;

function analyze(text: string, turn: Result['turns'][number], check: ReturnType<typeof createTranscriptCheck>): { metrics: Metrics; html: string } {
  const metrics: Metrics = {
    chars: 0,
    headings: 0,
    tables: 0,
    timestamps: 0,
    dropped: 0,
    clusters: countClusters(text),
    quotes: 0,
    quotesPassed: 0,
    cites: 0,
    searches: turn.steps.filter((s) => s.type === 'search').reduce((n, s) => n + (s.type === 'search' ? s.calls.length : 0), 0),
    globe: /地球|globe/i.test(text),
  };
  // Runs after the extension's plugins and counts what they left.
  const collect = () => (tree: Root) => {
    metrics.chars = toString(tree).replace(/\s+/g, '').length;
    visit(tree, (node) => {
      if (node.type === 'heading') metrics.headings++;
      if (node.type === 'table') metrics.tables++;
      if (node.type === 'text') {
        if (node.data?.hName === 'bd-timestamp') metrics.timestamps++;
        if (node.data?.hName === 'bd-cite') metrics.cites++;
      }
      if (node.type === 'blockquote') {
        const failed = node.data?.hName === 'bd-paraphrase';
        if (failed || /\[\d/.test(toString(node))) {
          metrics.quotes++;
          if (!failed) metrics.quotesPassed++;
        }
      }
    });
  };
  // remarkTimestamps removes dropped timestamps from the text, so count them before it runs.
  const countDropped = () => (tree: Root) => {
    visit(tree, 'text', (node) => {
      for (const m of node.value.matchAll(TIMESTAMP_PATTERN)) {
        if (check.resolveTime(parseTimestamp(m[1], m[2]!, m[3]!)) === null) metrics.dropped++;
      }
    });
  };
  const html = renderToStaticMarkup(
    createElement(ReactMarkdown, {
      remarkPlugins: [
        remarkGfm,
        countDropped,
        [remarkTimestamps, { transcriptCheck: check }],
        [remarkCitations, { count: turn.sources.length }],
        collect,
      ],
      components,
      children: text,
    }),
  );
  return { metrics, html };
}

async function loadResults(): Promise<{ results: Result[]; judgements: Map<string, Judgement[]> }> {
  const results: Result[] = [];
  const judgements = new Map<string, Judgement[]>();
  const dir = new URL('results/', EVAL);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of await readdir(new URL(`${entry.name}/`, dir))) {
      const data = JSON.parse(await readFile(new URL(`${entry.name}/${name}`, dir), 'utf8'));
      if (name.startsWith('judge-')) judgements.set(entry.name, [...(judgements.get(entry.name) ?? []), data]);
      else results.push(data);
    }
  }
  return { results, judgements };
}

type Stat = (answers: Answer[]) => number | undefined;
const sum = (answers: Answer[], pick: (m: Metrics) => number) => answers.reduce((n, a) => n + pick(a.metrics), 0);
const mean = (pick: (m: Metrics) => number): Stat => (a) => (a.length ? sum(a, pick) / a.length : undefined);
const ratio = (part: (m: Metrics) => number, whole: (m: Metrics) => number): Stat => (a) => {
  const total = sum(a, whole);
  return total ? sum(a, part) / total : undefined;
};

const SHORT = ['short', 'playback', 'outside', 'external-off', 'follow-up'];
const METRICS: { label: string; note?: string; categories?: string[]; stat: Stat; percent?: boolean }[] = [
  { label: '平均字数', stat: mean((m) => m.chars) },
  { label: '带标题的回答', note: '短问题不该加标题', categories: [...SHORT, 'format'], stat: mean((m) => +(m.headings > 0)), percent: true },
  { label: '用了表格的回答', categories: ['table', 'format'], stat: mean((m) => +(m.tables > 0)), percent: true },
  { label: '每个回答的时间戳', stat: mean((m) => m.timestamps) },
  { label: '时间戳丢弃率', note: '超出视频时长被丢掉的', stat: ratio((m) => m.dropped, (m) => m.timestamps + m.dropped), percent: true },
  { label: '每个回答的时间戳扎堆', note: '连着三个以上', stat: mean((m) => m.clusters) },
  { label: '引文通过率', note: '引用块能在字幕里找到原文', stat: ratio((m) => m.quotesPassed, (m) => m.quotes), percent: true },
  { label: '每个回答的引用块', categories: ['preset', 'quote'], stat: mean((m) => m.quotes) },
  { label: '提示打开联网搜索', categories: ['external-off'], stat: mean((m) => +m.globe), percent: true },
  { label: '每个回答的搜索次数', categories: ['external-on'], stat: mean((m) => m.searches) },
  { label: '每个回答的网页引用 [n]', categories: ['external-on'], stat: mean((m) => m.cites) },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const fmt = (n: number | undefined, percent?: boolean) => (n === undefined ? '–' : percent ? `${Math.round(n * 100)}%` : n < 10 ? n.toFixed(1) : String(Math.round(n)));

/** Mean over runs, with the range across runs. */
function cell(answers: Answer[], stat: Stat, percent?: boolean): string {
  const runs = [...new Set(answers.map((a) => a.run))].sort();
  const values = runs.map((r) => stat(answers.filter((a) => a.run === r))).filter((v): v is number => v !== undefined);
  if (!values.length) return '–';
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const range = values.length > 1 ? `<small>${fmt(Math.min(...values), percent)}–${fmt(Math.max(...values), percent)}</small>` : '';
  return `${fmt(avg, percent)} ${range}`;
}

function metricsTable(answers: Answer[], categories: string[]): string {
  const rows = METRICS.map(({ label, note, categories: only, stat, percent }) => {
    const scope = only ? answers.filter((a) => only.includes(a.category)) : answers;
    const head = `<th>${label}${note ? `<br><small>${note}</small>` : ''}${only ? `<br><small>${only.join(', ')}</small>` : ''}</th>`;
    const overall = `<tr>${head}${VERSIONS.map((v) => `<td>${cell(scope.filter((a) => a.version === v), stat, percent)}</td>`).join('')}</tr>`;
    const perCategory = (only ?? categories)
      .filter((cat) => scope.some((a) => a.category === cat))
      .map(
        (cat) =>
          `<tr class="sub"><th>${cat}</th>${VERSIONS.map((v) => `<td>${cell(scope.filter((a) => a.version === v && a.category === cat), stat, percent)}</td>`).join('')}</tr>`,
      );
    return `<tbody>${overall}${perCategory.length > 1 ? perCategory.join('') : ''}</tbody>`;
  });
  return `<table class="metrics"><thead><tr><th></th>${VERSIONS.map((v) => `<th>${v}</th>`).join('')}</tr></thead>${rows.join('')}</table>`;
}

function judgeTable(cases: Case[], judgements: Map<string, Judgement[]>): string {
  const rows = VERSIONS.filter((v) => v !== BASELINE).map((version) => {
    const tally = (filter: (c: Case) => boolean) => {
      const js = cases.filter(filter).flatMap((c) => (judgements.get(c.id) ?? []).filter((j) => j.version === version));
      if (!js.length) return '–';
      const won = js.filter((j) => j.winner === version).length;
      const lost = js.filter((j) => j.winner === BASELINE).length;
      return `${won} / ${js.length - won - lost} / ${lost}`;
    };
    const categories = [...new Set(cases.map((c) => c.category))];
    return `<tr><th>${version}</th><td>${tally(() => true)}</td>${categories.map((cat) => `<td>${tally((c) => c.category === cat)}</td>`).join('')}</tr>`;
  });
  const categories = [...new Set(cases.map((c) => c.category))];
  return `<table class="metrics"><thead><tr><th>对 ${BASELINE}：胜 / 平 / 负</th><th>全部</th>${categories.map((c) => `<th>${c}</th>`).join('')}</tr></thead>${rows.join('')}</table>`;
}

function badges(m: Metrics): string {
  const parts = [`${m.chars} 字`, `时间戳 ${m.timestamps}${m.dropped ? `（丢 ${m.dropped}）` : ''}`];
  if (m.quotes) parts.push(`引文 ${m.quotesPassed}/${m.quotes}`);
  if (m.clusters) parts.push(`扎堆 ${m.clusters}`);
  if (m.headings) parts.push(`标题 ${m.headings}`);
  if (m.tables) parts.push('表格');
  if (m.searches) parts.push(`搜索 ${m.searches}`);
  if (m.cites) parts.push(`引用 ${m.cites}`);
  if (m.globe) parts.push('地球');
  return `<div class="badges">${parts.join(' · ')}</div>`;
}

function caseSection(c: Case, answers: Answer[], judgements: Judgement[]): string {
  const question = [c.preset ? `预设：${c.preset}` : '', c.text ?? '', c.playback !== undefined ? `（播放位置 ${c.playback}s）` : '', c.search ? '（搜索开）' : '']
    .filter(Boolean)
    .join(' ');
  const column = (version: string) => {
    const mine = answers.filter((a) => a.version === version);
    const runs = [...new Set(mine.map((a) => a.run))].sort();
    const render = (run: number) =>
      mine
        .filter((a) => a.run === run)
        .sort((a, b) => a.turn - b.turn)
        .map((a) => `${a.turn ? `<p class="follow">追问：${esc(c.followUp ?? '')}</p>` : ''}${badges(a.metrics)}<div class="answer">${a.html}</div>`)
        .join('');
    const [first, ...rest] = runs;
    return `<div class="col"><h4>${version}</h4>${first !== undefined ? render(first) : '<p>（没有结果）</p>'}${rest.map((r) => `<details><summary>第 ${r} 次</summary>${render(r)}</details>`).join('')}</div>`;
  };
  const verdicts = judgements.length
    ? `<ul class="judge">${judgements
        .sort((a, b) => VERSIONS.indexOf(a.version) - VERSIONS.indexOf(b.version))
        .map((j) => `<li><b>${j.version} 对 ${BASELINE}</b>：${j.winner === 'tie' ? '差不多' : `${j.winner} 更好`}。${esc(j.reason)}</li>`)
        .join('')}</ul>`
    : '';
  return `<section id="${c.id}"><h3>${c.id} <small>${c.category}</small></h3><p class="q">${esc(question)}${c.followUp ? `<br>追问：${esc(c.followUp)}` : ''}</p>${verdicts}<div class="grid">${VERSIONS.map(column).join('')}</div></section>`;
}

const STYLE = `
body { font: 14px/1.6 -apple-system, "PingFang SC", sans-serif; margin: 24px; color: #222; }
table.metrics { border-collapse: collapse; margin: 12px 0 28px; }
table.metrics th, table.metrics td { border: 1px solid #ddd; padding: 4px 10px; text-align: left; vertical-align: top; }
table.metrics tr.sub th { font-weight: normal; padding-left: 24px; color: #666; }
small { color: #888; font-weight: normal; }
section { border-top: 2px solid #eee; margin-top: 32px; padding-top: 8px; }
.q { font-size: 15px; }
.grid { display: grid; grid-template-columns: repeat(${VERSIONS.length}, minmax(320px, 1fr)); gap: 16px; overflow-x: auto; }
.col { background: #fafafa; border-radius: 8px; padding: 8px 12px; min-width: 0; }
.answer { font-size: 13px; }
.answer table { border-collapse: collapse; } .answer td, .answer th { border: 1px solid #ddd; padding: 2px 6px; }
.ts { background: #e8f0fe; color: #1a56db; border-radius: 4px; padding: 0 4px; font-size: 12px; }
.cite { color: #1a56db; }
blockquote { border-left: 3px solid #9ab; margin: 8px 0; padding-left: 10px; color: #555; }
blockquote.failed { border-left-color: #e55; background: #fff0f0; }
.badges { font-size: 12px; color: #666; background: #eef; border-radius: 4px; padding: 2px 6px; margin: 4px 0; }
.follow { font-weight: bold; margin-top: 16px; }
.judge li { margin: 2px 0; }
`;

async function main() {
  const [cases, videos, { results, judgements }] = await Promise.all([loadCases(), loadVideos(), loadResults()]);
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const answers: Answer[] = [];
  for (const result of results) {
    const c = caseById.get(result.caseId);
    if (!c) continue;
    const { video, transcript } = videos.get(c.video)!;
    const check = createTranscriptCheck(transcript, video.durationSec);
    for (const [turn, t] of result.turns.entries()) {
      answers.push({ c, version: result.version, run: result.run, turn, category: turn ? 'follow-up' : c.category, ...analyze(t.text, t, check) });
    }
  }
  const ran = cases.filter((c) => answers.some((a) => a.c.id === c.id));
  const categories = [...new Set(answers.map((a) => a.category))];
  const cost = results.reduce((n, r) => n + r.turns.reduce((m, t) => m + t.usage.cost, 0), 0);
  const runs = [...new Set(results.map((r) => r.run))].length;

  const html = `<!doctype html><meta charset="utf-8"><title>提示词评测</title><style>${STYLE}</style>
<h1>提示词评测</h1>
<p>${ran.length} 个用例 · ${answers.length} 个回答 · 每个版本最多 ${runs} 次 · 模型 ${results[0]?.model ?? '–'} · 回答花费 $${cost.toFixed(3)}。数值是各次的平均，小字是各次之间的范围。红框引用块是没通过校验、在扩展里会显示成普通文字的引文。</p>
<h2>自动指标</h2>${metricsTable(answers, categories)}
<h2>盲评（${BASELINE} 为基准，评委看第 1 次的回答）</h2>${judgements.size ? judgeTable(ran, judgements) : '<p>还没有盲评结果（pnpm eval:judge）。</p>'}
<h2>逐个用例</h2>
<p>${ran.map((c) => `<a href="#${c.id}">${c.id}</a>`).join(' · ')}</p>
${ran.map((c) => caseSection(c, answers.filter((a) => a.c.id === c.id), judgements.get(c.id) ?? [])).join('\n')}`;
  const out = new URL('results/report.html', EVAL);
  await writeFile(out, html);
  console.log(`Wrote ${out.pathname}`);
}

await main();
