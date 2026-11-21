import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  AccountError,
  completeLogin,
  createPkce,
  deepseekCredential,
  platformRequest,
  withAccountAuth,
  type DeepseekAccount,
} from '@/lib/deepseek/account';

beforeEach(() => {
  // Not implemented by the fake browser.
  fakeBrowser.declarativeNetRequest.updateSessionRules = vi.fn(async () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  fakeBrowser.reset();
});

const llm = (patch: { deepseekAuth?: 'account' | 'key'; key?: string; account?: DeepseekAccount }) => ({
  deepseekAuth: patch.deepseekAuth ?? 'account',
  apiKeys: patch.key ? { deepseek: patch.key } : {},
  deepseekAccount: patch.account,
});

describe('deepseekCredential', () => {
  const account = { token: 'tok', email: 'a***@qq.com' };

  it('uses the chosen way to connect', () => {
    expect(deepseekCredential(llm({ deepseekAuth: 'account', key: 'sk', account }))).toEqual({ kind: 'account', token: 'tok' });
    expect(deepseekCredential(llm({ deepseekAuth: 'key', key: 'sk', account }))).toEqual({ kind: 'key', key: 'sk' });
  });

  it('falls back to the other when the chosen one is missing', () => {
    expect(deepseekCredential(llm({ deepseekAuth: 'account', key: 'sk' }))).toEqual({ kind: 'key', key: 'sk' });
    expect(deepseekCredential(llm({ deepseekAuth: 'key', account }))).toEqual({ kind: 'account', token: 'tok' });
  });

  it('has nothing once the account login expired and there is no key', () => {
    expect(deepseekCredential(llm({ account: { email: 'a***@qq.com' } }))).toBeUndefined();
  });
});

describe('withAccountAuth', () => {
  it('replaces the API key header with the account token', () => {
    const init = withAccountAuth({ method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' } }, 'tok');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-dsh-auth-token')).toBe('tok');
    expect(headers.get('content-type')).toBe('application/json');
    expect(init.method).toBe('POST');
  });
});

describe('createPkce', () => {
  it('derives the S256 challenge from the verifier', async () => {
    const { verifier, challenge, state } = await createPkce();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(challenge).toBe(expected);
    expect(verifier).toMatch(/^[\w-]{43}$/);
    expect(state).not.toBe(verifier);
  });
});

describe('platformRequest', () => {
  const respond = (status: number, body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it('returns biz_data and sends the client identity headers', async () => {
    respond(200, { code: 0, data: { biz_code: 0, biz_data: { ok: 1 } } });
    await expect(platformRequest('/x', { token: 'tok' })).resolves.toEqual({ ok: 1 });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const headers = new Headers(init!.headers);
    expect(headers.get('x-dsh-auth-token')).toBe('tok');
    expect(headers.get('x-client-version')).toBeTruthy();
  });

  it('reports a rejected login as unauthorized (HTTP 401 or code 40003)', async () => {
    respond(401, {});
    await expect(platformRequest('/x')).rejects.toMatchObject({ code: 'unauthorized' });
    respond(200, { code: 40003, msg: 'expired' });
    await expect(platformRequest('/x')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('reports business failures with their message', async () => {
    respond(200, { code: 0, data: { biz_code: 7, biz_msg: 'nope' } });
    const error = await platformRequest('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AccountError);
    expect(error).toMatchObject({ code: 'business', message: expect.stringContaining('nope') });
  });
});

describe('completeLogin', () => {
  const attempt = { verifier: 'v'.repeat(43), state: 's'.repeat(43), authorizeId: 'auth-1', authorizeUrl: 'https://platform.deepseek.com/dsh/authorize?authorize_id=auth-1' };

  it('rejects a callback whose state does not match the attempt', async () => {
    await fakeBrowser.storage.session.set({ deepseekLoginAttempt: attempt });
    vi.stubGlobal('fetch', vi.fn());
    await expect(completeLogin(new URLSearchParams({ code: 'c', state: 'forged' }))).rejects.toMatchObject({ code: 'state' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exchanges the code for the account, keeping only masked contact details', async () => {
    await fakeBrowser.storage.session.set({ deepseekLoginAttempt: attempt });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          code: 0,
          data: {
            biz_code: 0,
            biz_data: {
              token: 'account-token',
              user: { id: 'u1', token: 'account-token', email: 'u***r@example.com', mobile_number: '138******00', area_code: '+86', id_profile: { name: 'Alice' } },
            },
          },
        }),
      ),
    );
    const account = await completeLogin(new URLSearchParams({ code: 'the-code', state: attempt.state }));
    expect(account).toEqual({ token: 'account-token', name: 'Alice', email: 'u***r@example.com', phone: '+86 138******00' });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('https://platform.deepseek.com/auth-api/v0/dsh/auth_exchange');
    expect(JSON.parse(String(init!.body))).toMatchObject({ code: 'the-code', code_verifier: attempt.verifier, redirect_uri: 'http://127.0.0.1:53682/oauth/callback' });
    // The attempt can't be replayed.
    expect(await fakeBrowser.storage.session.get('deepseekLoginAttempt')).toEqual({});
  });
});
