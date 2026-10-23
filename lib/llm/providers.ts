import type { Api, Model, ModelThinkingLevel, ThinkingLevel } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { clampThinkingLevel, createModels, getSupportedThinkingLevels } from '@earendil-works/pi-ai/models';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import { googleProvider } from '@earendil-works/pi-ai/providers/google';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import type { Settings } from '../settings';

export const CUSTOM_PROVIDER = 'custom';

/** Providers offered in settings, with the API a model id outside pi-ai's catalog uses. Their API hosts are listed in `host_permissions`. */
export const PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', api: 'openai-completions' },
  { id: 'openai', name: 'OpenAI', api: 'openai-responses' },
  { id: 'anthropic', name: 'Anthropic', api: 'anthropic-messages' },
  { id: 'google', name: 'Google Gemini', api: 'google-generative-ai' },
  { id: 'openrouter', name: 'OpenRouter', api: 'openai-completions' },
  { id: CUSTOM_PROVIDER, name: 'Custom (OpenAI-compatible)', api: 'openai-completions' },
] as const satisfies readonly { id: string; name: string; api: Api }[];

const models = createModels();
for (const provider of [deepseekProvider, openaiProvider, anthropicProvider, googleProvider, openrouterProvider]) {
  models.setProvider(provider());
}

const customApi = openAICompletionsApi();

/** Chat models of a built-in provider, newest catalog order. */
export function listModels(providerId: string): readonly Model<Api>[] {
  return providerId === CUSTOM_PROVIDER ? [] : models.getModels(providerId);
}

export interface ResolvedModel {
  model: Model<Api>;
  apiKey: string;
}

/** A built-in provider's own endpoint, used when no base URL is set. */
export function defaultBaseUrl(providerId: string): string | undefined {
  return models.getProvider(providerId)?.baseUrl;
}

/** The model the user configured, or undefined if setup is incomplete. */
export function resolveModel(llm: Settings['llm']): ResolvedModel | undefined {
  const { provider } = llm;
  const apiKey = llm.apiKeys[provider]?.trim();
  const modelId = llm.models[provider]?.trim();
  const customUrl = llm.baseUrls[provider]?.trim().replace(/\/+$/, '');
  const baseUrl = customUrl || defaultBaseUrl(provider);
  if (!apiKey || !modelId || !baseUrl) return undefined;

  // Every pi-ai API sends requests to `model.baseUrl`, so a proxy speaking the provider's protocol can stand in.
  const listed = models.getModel(provider, modelId);
  let model = listed ? { ...listed, baseUrl } : unlistedModel(provider, modelId, baseUrl);
  // Many OpenAI-compatible proxies only offer Chat Completions.
  if (provider === 'openai' && customUrl && llm.openaiApi === 'completions') model = { ...model, api: 'openai-completions' };
  return { model, apiKey };
}

/** A model id typed by the user; its limits and abilities are unknown. */
function unlistedModel(provider: string, id: string, baseUrl: string): Model<Api> {
  return {
    id,
    name: id,
    api: PROVIDERS.find((p) => p.id === provider)?.api ?? 'openai-completions',
    provider,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // A common lower bound for current models.
    contextWindow: 128_000,
    maxTokens: 8_192,
    // Many self-hosted servers reject the `developer` role and `reasoning_effort`.
    ...(provider === CUSTOM_PROVIDER && { compat: { supportsDeveloperRole: false, supportsReasoningEffort: false } }),
  };
}

/** Thinking levels the model offers, or none if it can't reason (or can't turn it off). */
export function thinkingLevels(model: Model<Api>): ModelThinkingLevel[] {
  const levels = getSupportedThinkingLevels(model);
  return levels.length > 1 ? levels : [];
}

/** The level a request actually uses: the preference, clamped to what the model supports. */
export function effectiveThinking(model: Model<Api>, preference: ModelThinkingLevel): ModelThinkingLevel {
  return clampThinkingLevel(model, preference);
}

/** pi-ai's `reasoning` option; omitting it turns thinking off. */
export function reasoningOption(model: Model<Api>, preference: ModelThinkingLevel): ThinkingLevel | undefined {
  const level = effectiveThinking(model, preference);
  return level === 'off' ? undefined : level;
}

type StreamArgs = Parameters<typeof models.streamSimple>;

export function streamChat(model: Model<Api>, context: StreamArgs[1], options: StreamArgs[2]) {
  // pi-ai's OpenAI provider only implements Responses, so Chat Completions go to that API directly.
  if (model.provider === CUSTOM_PROVIDER || (model.provider === 'openai' && model.api === 'openai-completions')) {
    return customApi.streamSimple(model, normalizeContext(context), options);
  }
  return models.streamSimple(model, context, options);
}
