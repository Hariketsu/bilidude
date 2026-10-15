import type { AacChunk } from './aac';
import { concatFrames } from './aac';
import { aacToWav } from './wav';
import { t } from '../i18n';

export type AsrProviderId = 'bcut' | 'openai' | 'groq' | 'siliconflow' | 'dashscope' | 'custom';
export type DashscopeRegion = 'cn-beijing' | 'ap-southeast-1';

export interface AsrSettings {
  enabled: boolean;
  provider: AsrProviderId;
  /** Per provider, like the LLM settings. */
  apiKeys: Partial<Record<AsrProviderId, string>>;
  models: Partial<Record<AsrProviderId, string>>;
  customBaseUrl: string;
  dashscopeRegion: DashscopeRegion;
  /** Empty: the shared dashscope(-intl).aliyuncs.com endpoint. */
  dashscopeWorkspace: string;
  /** Start transcribing when a question is asked, or as soon as the panel shows the video. */
  trigger: 'ask' | 'open';
}

interface ProviderInfo {
  id: AsrProviderId;
  name: string;
  /** OpenAI-compatible base URL; dashscope builds its own. */
  baseUrl?: string;
  defaultModel: string;
  /** Returns per-sentence timestamps; otherwise times are estimated within shorter chunks. */
  timestamps: boolean;
  /** Audio length per request. */
  chunkSeconds: number;
  /** Free services need no API key (and have no model choice). */
  free?: boolean;
}

/** API hosts are listed in `host_permissions`; custom endpoints are requested when saved. */
// Chunk lengths: 5 minutes is DashScope's limit and keeps WAV uploads under 25MB; without
// timestamps, 1-minute chunks bound the estimate; Bcut is fast and handles long audio.
export const ASR_PROVIDERS: ProviderInfo[] = [
  { id: 'bcut', name: 'Bilibili Bcut (free)', defaultModel: '', timestamps: true, chunkSeconds: 600, free: true },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'whisper-1', timestamps: true, chunkSeconds: 300 },
  { id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'whisper-large-v3-turbo', timestamps: true, chunkSeconds: 300 },
  { id: 'dashscope', name: 'Alibaba Cloud Model Studio', defaultModel: 'fun-asr-flash-2026-06-15', timestamps: true, chunkSeconds: 300 },
  { id: 'siliconflow', name: 'SiliconFlow', baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'FunAudioLLM/SenseVoiceSmall', timestamps: false, chunkSeconds: 60 },
  { id: 'custom', name: 'Custom (OpenAI-compatible)', defaultModel: '', timestamps: true, chunkSeconds: 300 },
];

export const DEFAULT_ASR_SETTINGS: AsrSettings = {
  enabled: false,
  provider: 'bcut',
  apiKeys: {},
  models: {},
  customBaseUrl: '',
  dashscopeRegion: 'cn-beijing',
  dashscopeWorkspace: '',
  trigger: 'ask',
};

export interface AsrConfig {
  provider: ProviderInfo;
  apiKey: string;
  model: string;
  baseUrl: string;
  chunkSeconds: number;
  region: DashscopeRegion;
  workspace: string;
}

export function getAsrProvider(id: AsrProviderId): ProviderInfo {
  return ASR_PROVIDERS.find((p) => p.id === id) ?? ASR_PROVIDERS[0]!;
}

/** The configured provider, or undefined when ASR is off or incomplete. */
export function resolveAsr(asr: AsrSettings): AsrConfig | undefined {
  if (!asr.enabled) return undefined;
  const provider = getAsrProvider(asr.provider);
  const apiKey = asr.apiKeys[provider.id]?.trim() ?? '';
  const model = asr.models[provider.id]?.trim() || provider.defaultModel;
  const baseUrl = (provider.id === 'custom' ? asr.customBaseUrl : (provider.baseUrl ?? '')).trim().replace(/\/+$/, '');
  if (!provider.free && (!apiKey || !model)) return undefined;
  if (provider.id === 'custom' && !baseUrl) return undefined;
  return {
    provider,
    apiKey,
    model,
    baseUrl,
    chunkSeconds: provider.chunkSeconds,
    region: asr.dashscopeRegion,
    workspace: asr.dashscopeWorkspace.trim(),
  };
}

export interface Segment {
  /** Seconds from the start of the chunk. */
  start: number;
  end: number;
  text: string;
}

export interface ChunkTranscript {
  segments: Segment[];
  /** Times were estimated from text length, not reported by the provider. */
  approximate: boolean;
}

export async function transcribeChunk(config: AsrConfig, chunk: AacChunk, sampleRate: number, signal?: AbortSignal) {
  if (config.provider.id === 'bcut') return transcribeBcut(chunk, signal);
  return config.provider.id === 'dashscope'
    ? transcribeDashscope(config, chunk, sampleRate, signal)
    : transcribeOpenAi(config, chunk, signal);
}

async function errorFrom(response: Response): Promise<Error> {
  const body = await response.text().catch(() => '');
  let message = body.slice(0, 300);
  try {
    const json = JSON.parse(body);
    message = json.error?.message ?? json.message ?? message;
  } catch {
    // Not JSON; keep the raw text.
  }
  return Object.assign(new Error(`Transcription failed (HTTP ${response.status}): ${message}`), {
    retryable: response.status === 429 || response.status >= 500,
  });
}

async function transcribeOpenAi(config: AsrConfig, chunk: AacChunk, signal?: AbortSignal): Promise<ChunkTranscript> {
  const form = new FormData();
  form.append('file', await aacToWav(chunk.frames), 'audio.wav');
  form.append('model', config.model);
  form.append('response_format', config.provider.timestamps ? 'verbose_json' : 'json');
  if (config.provider.timestamps) form.append('timestamp_granularities[]', 'segment');

  const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: form,
    signal,
  });
  if (!response.ok) throw await errorFrom(response);
  const data: { text?: string; segments?: { start: number; end: number; text: string }[] } = await response.json();

  const segments = (data.segments ?? [])
    .map((s) => ({ start: Number(s.start), end: Number(s.end), text: String(s.text ?? '').trim() }))
    .filter((s) => s.text && Number.isFinite(s.start));
  if (segments.length > 0) return { segments, approximate: false };
  return { segments: estimateSegments(data.text ?? '', chunk.durationSec), approximate: true };
}

function dashscopeEndpoint(config: AsrConfig): string {
  const host = config.workspace
    ? `${config.workspace}.${config.region}.maas.aliyuncs.com`
    : config.region === 'cn-beijing'
      ? 'dashscope.aliyuncs.com'
      : 'dashscope-intl.aliyuncs.com';
  return `https://${host}/api/v1/services/aigc/multimodal-generation/generation`;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

interface DashscopeSentence {
  begin_time?: number;
  end_time?: number;
  text?: string;
  sentence_end?: boolean;
}

/** Fun-ASR-Flash and friends over HTTP: the ADTS chunk goes up as-is; finished sentences stream back. */
async function transcribeDashscope(
  config: AsrConfig,
  chunk: AacChunk,
  sampleRate: number,
  signal?: AbortSignal,
): Promise<ChunkTranscript> {
  const response = await fetch(dashscopeEndpoint(config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      // The plain JSON response describes a single `sentence`; SSE sends each finished sentence as an event.
      'X-DashScope-SSE': 'enable',
    },
    body: JSON.stringify({
      model: config.model,
      input: {
        messages: [
          {
            role: 'user',
            content: [{ type: 'input_audio', input_audio: { data: `data:audio/aac;base64,${toBase64(concatFrames(chunk.frames))}` } }],
          },
        ],
      },
      parameters: { format: 'aac', sample_rate: String(sampleRate) },
    }),
    signal,
  });
  if (!response.ok) throw await errorFrom(response);

  // SSE events (or a single JSON body for short audio), each carrying `output.sentence`.
  const raw = await response.text();
  const events = raw.trimStart().startsWith('{')
    ? [raw]
    : raw
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5));

  const sentences = new Map<number, Segment>();
  let fullText = '';
  for (const event of events) {
    const data = JSON.parse(event);
    if (data.code) throw new Error(`Transcription failed: ${data.message ?? data.code}`);
    const sentence: DashscopeSentence | undefined = data.output?.sentence;
    fullText = data.output?.text ?? fullText;
    if (!sentence?.sentence_end || !sentence.text?.trim()) continue;
    const start = (sentence.begin_time ?? 0) / 1000;
    sentences.set(start, { start, end: (sentence.end_time ?? sentence.begin_time ?? 0) / 1000, text: sentence.text.trim() });
  }
  if (sentences.size > 0) return { segments: [...sentences.values()], approximate: false };
  return { segments: estimateSegments(fullText, chunk.durationSec), approximate: true };
}

const BCUT_API = 'https://member.bilibili.com/x/bcut/rubick-interface';
const BCUT_MODEL = 7;
/** Polling backs off from 2s to 10s: the service rate-limits by IP (HTTP 412) when hit too often. */
const BCUT_POLL_MS = [2000, 3000, 5000, 10_000];

async function bcutCall<T>(path: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  // No cookies: the service works anonymously, like the reference implementation.
  const response = await fetch(BCUT_API + path, { ...init, credentials: 'omit', signal });
  if (response.status === 412) {
    // Not retried: retrying is what keeps the limit in place.
    throw new Error(t('errors.bcutRateLimited'));
  }
  if (!response.ok) throw Object.assign(new Error(`Bcut HTTP ${response.status}`), { retryable: response.status >= 500 });
  const body = await response.json();
  if (body.code) throw new Error(`Bcut error ${body.code}: ${body.message}`);
  return body.data as T;
}

const bcutForm = (fields: Record<string, string | number>) => ({
  method: 'POST',
  body: new URLSearchParams(Object.entries(fields).map(([k, v]) => [k, String(v)])),
});

/**
 * Bilibili's free speech recognition used by its Bcut editor. Port of
 * https://github.com/SocialSisterYi/bcut-asr (MIT): upload in parts, create a task, poll.
 */
async function transcribeBcut(chunk: AacChunk, signal?: AbortSignal): Promise<ChunkTranscript> {
  const audio = concatFrames(chunk.frames);
  const resource = await bcutCall<{
    in_boss_key: string;
    resource_id: string;
    upload_id: string;
    upload_urls: string[];
    per_size: number;
  }>(
    '/resource/create',
    bcutForm({ type: 2, name: `${Date.now()}.aac`, size: audio.length, resource_file_type: 'aac', model_id: BCUT_MODEL }),
    signal,
  );

  const etags: string[] = [];
  for (const [i, url] of resource.upload_urls.entries()) {
    const part = audio.subarray(i * resource.per_size, (i + 1) * resource.per_size);
    const response = await fetch(url, { method: 'PUT', body: new Blob([part as Uint8Array<ArrayBuffer>]), credentials: 'omit', signal });
    const etag = response.headers.get('etag');
    if (!response.ok || !etag) throw new Error(`Bcut upload failed: HTTP ${response.status}`);
    etags.push(etag);
  }

  const { download_url } = await bcutCall<{ download_url: string }>(
    '/resource/create/complete',
    bcutForm({
      in_boss_key: resource.in_boss_key,
      resource_id: resource.resource_id,
      etags: etags.join(','),
      upload_id: resource.upload_id,
      model_id: BCUT_MODEL,
    }),
    signal,
  );
  const { task_id } = await bcutCall<{ task_id: string }>(
    '/task',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: download_url, model_id: String(BCUT_MODEL) }),
    },
    signal,
  );

  // States: 0 queued, 1 running, 3 failed, 4 done.
  for (let poll = 0; ; poll++) {
    await new Promise((resolve) => setTimeout(resolve, BCUT_POLL_MS[Math.min(poll, BCUT_POLL_MS.length - 1)]));
    const task = await bcutCall<{ state: number; result?: string; remark?: string }>(
      `/task/result?model_id=${BCUT_MODEL}&task_id=${task_id}`,
      {},
      signal,
    );
    if (task.state === 3) throw new Error(`Bcut recognition failed: ${task.remark ?? 'unknown error'}`);
    if (task.state === 4) {
      const { utterances = [] }: { utterances?: { start_time: number; end_time: number; transcript: string }[] } =
        JSON.parse(task.result ?? '{}');
      return {
        segments: utterances
          .map((u) => ({ start: u.start_time / 1000, end: u.end_time / 1000, text: u.transcript.trim() }))
          .filter((s) => s.text),
        approximate: false,
      };
    }
  }
}

/**
 * For providers that return text only: split into sentences and spread them over the chunk
 * in proportion to their length. Good to a few seconds on a 1-minute chunk of steady speech.
 */
export function estimateSegments(text: string, durationSec: number): Segment[] {
  const sentences = text.match(/[^。！？!?.；;\n]+[。！？!?.；;]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const total = sentences.reduce((sum, s) => sum + s.length, 0);
  let consumed = 0;
  return sentences.map((sentence) => {
    const start = (consumed / total) * durationSec;
    consumed += sentence.length;
    return { start, end: (consumed / total) * durationSec, text: sentence };
  });
}
