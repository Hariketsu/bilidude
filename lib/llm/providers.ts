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

/** Providers offered in settings. Their API hosts are listed in `host_permissions`. */
export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google Gemini' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: CUSTOM_PROVIDER, name: 'Custom (OpenAI-compatible)' },
] as const;

const models = createModels();
for (const provider of [openaiProvider, anthropicProvider, googleProvider, openrouterProvider, deepseekProvider]) {
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

/** The model the user configured, or undefined if setup is incomplete. */
export function resolveModel(llm: Settings['llm']): ResolvedModel | undefined {
  const apiKey = llm.apiKeys[llm.provider]?.trim();
  const modelId = llm.models[llm.provider]?.trim();
  if (!apiKey || !modelId) return undefined;

  if (llm.provider === CUSTOM_PROVIDER) {
    const baseUrl = llm.customBaseUrl.trim().replace(/\/+$/, '');
    if (!baseUrl) return undefined;
    return {
      apiKey,
      model: {
        id: modelId,
        name: modelId,
        api: 'openai-completions',
        provider: CUSTOM_PROVIDER,
        baseUrl,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        // Unknown for arbitrary endpoints; a common lower bound for current models.
        contextWindow: 128_000,
        maxTokens: 8_192,
        // Many self-hosted servers reject the `developer` role and `reasoning_effort`.
        compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
      } satisfies Model<'openai-completions'>,
    };
  }

  const model = models.getModel(llm.provider, modelId);
  return model && { model, apiKey };
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
  if (model.provider === CUSTOM_PROVIDER) {
    return customApi.streamSimple(model, normalizeContext(context), options);
  }
  return models.streamSimple(model, context, options);
}
