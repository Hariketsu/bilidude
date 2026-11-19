/**
 * Signing in with a DeepSeek account instead of an API key (experimental). This is the login
 * DeepSeek Harness uses (github.com/deepseek-ai/deepseek-harness, packages/account): PKCE in the
 * browser, a token that never expires on its own, sent as `x-dsh-auth-token`. It is not a public
 * API, so DeepSeek may change it; see docs/DESIGN.md.
 */

export const PLATFORM_ORIGIN = 'https://platform.deepseek.com';
export const TOP_UP_URL = `${PLATFORM_ORIGIN}/top_up`;
/** The platform only accepts loopback callbacks. Nothing listens there: a DNR rule sends it back to our page. */
export const CALLBACK_URL = 'http://127.0.0.1:53682/oauth/callback';
const CALLBACK_PAGE = '/account-callback.html';
const CALLBACK_RULE_ID = 9001;
const ATTEMPT_KEY = 'deepseekLoginAttempt';
/** The platform lets an authorization run for ten minutes. */
const ATTEMPT_MS = 10 * 60_000;
const ACCOUNT_HEADER = 'x-dsh-auth-token';

/** What is kept of a signed-in account; without `token`, its login has expired. */
export interface DeepseekAccount {
  token?: string;
  name?: string;
  /** Masked by the platform. */
  email?: string;
  phone?: string;
}

export type DeepseekCredential = { kind: 'key'; key: string } | { kind: 'account'; token: string };

/** The way to reach DeepSeek: the one chosen in settings, or the other when it is missing. */
export function deepseekCredential(llm: {
  deepseekAuth: 'account' | 'key';
  apiKeys: Partial<Record<string, string>>;
  deepseekAccount?: DeepseekAccount;
}): DeepseekCredential | undefined {
  const key = llm.apiKeys.deepseek?.trim();
  const token = llm.deepseekAccount?.token;
  const byKey = key ? ({ kind: 'key', key } as const) : undefined;
  const byAccount = token ? ({ kind: 'account', token } as const) : undefined;
  return llm.deepseekAuth === 'key' ? (byKey ?? byAccount) : (byAccount ?? byKey);
}

/** Request headers that authenticate `credential`. */
export function deepseekAuthHeaders(credential: DeepseekCredential): Record<string, string> {
  return credential.kind === 'key' ? { Authorization: `Bearer ${credential.key}` } : { [ACCOUNT_HEADER]: credential.token };
}

/** `init` with its API key header swapped for the account token (pi-ai always sends a Bearer key). */
export function withAccountAuth(init: RequestInit | undefined, token: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.delete('authorization');
  headers.set(ACCOUNT_HEADER, token);
  return { ...init, headers };
}

/**
 * The client identity DeepSeek Harness desktop reports. The platform treats these as the client's
 * identity; we report Harness's (the user's choice when this was added).
 */
function clientHeaders(): Record<string, string> {
  const mac = navigator.userAgent.includes('Mac');
  return {
    'x-client-bundle-id': '',
    'x-client-platform': mac ? 'desktop-mac' : 'desktop-win',
    'x-client-version': '0.2.1-rc.5',
    'x-client-locale': navigator.language.startsWith('zh') ? 'zh_CN' : 'en_US',
    'x-client-timezone-offset': String(-new Date().getTimezoneOffset() * 60),
  };
}

export class AccountError extends Error {
  constructor(
    readonly code: 'unauthorized' | 'network' | 'business' | 'protocol' | 'state',
    message: string,
  ) {
    super(message);
    this.name = 'AccountError';
  }
}

/** A platform request; returns the `biz_data` of its `{code, data: {biz_code, biz_data}}` envelope. */
export async function platformRequest<T = unknown>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; token?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...clientHeaders() };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers[ACCOUNT_HEADER] = options.token;
  let response: Response;
  try {
    response = await fetch(`${PLATFORM_ORIGIN}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new AccountError('network', error instanceof Error ? error.message : String(error));
  }
  const payload = (await response.json().catch(() => undefined)) as
    | { code?: number; msg?: string; data?: { biz_code?: number; biz_msg?: string; biz_data?: T } }
    | undefined;
  if (response.status === 401 || payload?.code === 40003) throw new AccountError('unauthorized', 'DeepSeek login expired');
  if (!response.ok) throw new AccountError('network', `HTTP ${response.status}${payload?.msg ? `: ${payload.msg}` : ''}`);
  if (!payload) throw new AccountError('protocol', `Unreadable response from ${path}`);
  if (payload.code !== 0) throw new AccountError('business', `${payload.msg || 'Request refused'} (code ${payload.code})`);
  const envelope = payload.data;
  if (envelope?.biz_code !== undefined && envelope.biz_code !== 0) {
    throw new AccountError('business', `${envelope.biz_msg || 'Request refused'} (biz_code ${envelope.biz_code})`);
  }
  return envelope?.biz_data as T;
}

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export async function createPkce(): Promise<{ verifier: string; challenge: string; state: string }> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  return { verifier, challenge, state };
}

/** A login waiting for the user in the browser. Kept in session storage, so it ends with the browser. */
export interface LoginAttempt {
  verifier: string;
  state: string;
  authorizeId: string;
  authorizeUrl: string;
  /** ms since the epoch. */
  expiresAt?: number;
}

export async function getLoginAttempt(): Promise<LoginAttempt | undefined> {
  const attempt = ((await browser.storage.session.get(ATTEMPT_KEY)) as Record<string, LoginAttempt | undefined>)[ATTEMPT_KEY];
  return attempt && (attempt.expiresAt ?? Infinity) > Date.now() ? attempt : undefined;
}

async function clearLoginAttempt() {
  await browser.storage.session.remove(ATTEMPT_KEY);
  await browser.declarativeNetRequest?.updateSessionRules({ removeRuleIds: [CALLBACK_RULE_ID] });
}

/** Starts a login: the DeepSeek authorization page opens in a new tab and comes back to our callback page. */
export async function startLogin(): Promise<void> {
  const { verifier, challenge, state } = await createPkce();
  await browser.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [CALLBACK_RULE_ID],
    addRules: [
      {
        id: CALLBACK_RULE_ID,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: `${browser.runtime.getURL(CALLBACK_PAGE)}?\\1` } },
        condition: { regexFilter: `^${CALLBACK_URL.replace(/[.]/g, '\\.')}\\?(.*)$`, resourceTypes: ['main_frame'] },
      },
    ],
  });
  const start = await platformRequest<{ authorize_url?: string; authorize_id?: string; expires_in?: number }>(
    '/auth-api/v0/dsh/auth_init',
    {
      method: 'POST',
      body: {
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        redirect_uri: CALLBACK_URL,
        locale: clientHeaders()['x-client-locale'],
        login_source: 'desktop',
      },
    },
  );
  // Only ever send the user to the platform's own authorization page.
  const url = new URL(start?.authorize_url ?? '', PLATFORM_ORIGIN);
  if (url.origin !== PLATFORM_ORIGIN || url.pathname !== '/dsh/authorize' || !start?.authorize_id) {
    throw new AccountError('protocol', 'Unexpected authorization address');
  }
  const attempt: LoginAttempt = {
    verifier,
    state,
    authorizeId: start.authorize_id,
    authorizeUrl: url.href,
    expiresAt: Date.now() + Math.min((start.expires_in ?? 600) * 1000, ATTEMPT_MS),
  };
  await browser.storage.session.set({ [ATTEMPT_KEY]: attempt });
  await browser.tabs.create({ url: url.href });
}

/** Stops waiting for the browser and voids the authorization on the platform. */
export async function cancelLogin(): Promise<void> {
  const attempt = await getLoginAttempt();
  await clearLoginAttempt();
  if (attempt) {
    await platformRequest('/auth-api/v0/dsh/auth_cancel', {
      method: 'POST',
      body: { authorize_id: attempt.authorizeId, code_verifier: attempt.verifier },
    }).catch(() => {});
  }
}

interface PlatformUser {
  email?: string;
  mobile_number?: string;
  area_code?: string;
  id_profile?: { name?: string };
}

function accountFrom(token: string, user?: PlatformUser | null): DeepseekAccount {
  const phone = user?.mobile_number ? [user.area_code, user.mobile_number].filter(Boolean).join(' ') : undefined;
  return {
    token,
    ...(user?.id_profile?.name && { name: user.id_profile.name }),
    ...(user?.email && { email: user.email }),
    ...(phone && { phone }),
  };
}

/** Finishes a login from the callback's query: checks it belongs to our attempt, then trades the code for the account. */
export async function completeLogin(params: URLSearchParams): Promise<DeepseekAccount> {
  const attempt = await getLoginAttempt();
  await clearLoginAttempt();
  const code = params.get('code');
  if (!attempt || !code || params.get('state') !== attempt.state) {
    throw new AccountError('state', 'This login does not match the one started in BiliDude');
  }
  const result = await platformRequest<{ token?: string; user?: PlatformUser | null }>('/auth-api/v0/dsh/auth_exchange', {
    method: 'POST',
    body: {
      code,
      code_verifier: attempt.verifier,
      redirect_uri: CALLBACK_URL,
      device_id: crypto.randomUUID(),
      device_model: navigator.userAgent.includes('Mac') ? 'macOS' : 'Windows',
      os_version: navigator.platform,
    },
  });
  if (!result?.token) throw new AccountError('protocol', 'No token in the login response');
  return accountFrom(result.token, result.user);
}

export interface Wallets {
  /** Topped-up balance, CNY. */
  balance: string;
  bonus: string;
}

export async function fetchWallets(token: string, signal?: AbortSignal): Promise<Wallets> {
  const data = await platformRequest<{ normal_wallets?: { balance?: string }[]; bonus_wallets?: { balance?: string }[] }>(
    '/api/v0/users/get_user_summary',
    { token, signal },
  );
  const sum = (wallets?: { balance?: string }[]) => String((wallets ?? []).reduce((total, w) => total + (Number(w.balance) || 0), 0));
  return { balance: sum(data?.normal_wallets), bonus: sum(data?.bonus_wallets) };
}

export interface Bonus {
  orderId: string;
  amount?: string;
  expiresAt?: string;
}

/** Bonuses granted to the account and not claimed yet. */
export async function fetchBonuses(token: string, signal?: AbortSignal): Promise<Bonus[]> {
  const data = await platformRequest<{ order_id?: string; amount?: string; expires_at?: string }[]>('/api/v0/users/get_unnotified_bonuses', {
    token,
    signal,
  });
  return (Array.isArray(data) ? data : [])
    .filter((b) => b.order_id)
    .map((b) => ({ orderId: b.order_id!, amount: b.amount, expiresAt: b.expires_at }));
}

/** Claims bonuses (the platform calls it marking them as shown). */
export async function claimBonuses(token: string, bonuses: Bonus[]): Promise<void> {
  for (const bonus of bonuses) {
    await platformRequest('/api/v0/users/ack_bonus_notified', { method: 'POST', token, body: { order_id: bonus.orderId } });
  }
}

/** Voids the token on the platform; the caller forgets it locally either way. */
export async function revokeToken(token: string): Promise<void> {
  await platformRequest('/auth-api/v0/users/logout', { method: 'POST', token }).catch(() => {});
}

export function formatYuan(amount: string | undefined): string {
  return `¥${(Number(amount) || 0).toFixed(2)}`;
}
