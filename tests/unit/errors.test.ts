import i18next from 'i18next';
import { beforeEach, describe, expect, it } from 'vitest';
import { describeServiceError } from '@/lib/errors';

beforeEach(async () => {
  await i18next.changeLanguage('zh-CN');
});

describe('describeServiceError', () => {
  it('tells the user to replace an invalid or expired key, keeping the original error as detail', () => {
    const error = describeServiceError('Groq', { status: 401, message: 'Invalid API Key' });
    expect(error.message).toBe('Groq 的 API Key 无效或已过期，请在设置里更换。');
    expect(error.detail).toBe('HTTP 401: Invalid API Key');
  });

  it('asks to top up when the account is out of credit', () => {
    const error = describeServiceError('DeepSeek', { status: 402, message: 'Insufficient Balance' });
    expect(error.message).toBe('DeepSeek 账户余额不足，请充值后再试。');
  });

  it('asks to wait when requests are rate limited', () => {
    const error = describeServiceError('OpenAI', { status: 429, message: 'Rate limit reached' });
    expect(error.message).toBe('OpenAI 的请求过于频繁或额度已用完，请稍后再试。');
  });

  it('reports a server-side failure as temporary', () => {
    const error = describeServiceError('DeepSeek', { status: 503, message: 'Service Unavailable' });
    expect(error.message).toBe('DeepSeek 服务暂时不可用，请稍后再试。');
  });

  it('points at the network or address when the request got no response', () => {
    const error = describeServiceError('Custom', { message: 'Failed to fetch' });
    expect(error.message).toBe('无法连接到 Custom，请检查网络或接口地址。');
    expect(error.detail).toBe('Failed to fetch');
  });

  it('does not blame the key for other errors', () => {
    const error = describeServiceError('OpenAI', { status: 404, message: 'The model `gpt-x` does not exist' });
    expect(error.message).toBe('OpenAI 返回了错误，可展开查看详情。');
  });

  it('does not repeat a status the original message already starts with', () => {
    const error = describeServiceError('DeepSeek', { status: 401, message: '401: {"message":"Authentication Fails"}' });
    expect(error.detail).toBe('401: {"message":"Authentication Fails"}');
  });
});
