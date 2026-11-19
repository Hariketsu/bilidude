// Signing in with a DeepSeek account (experimental); the platform and the model are mocked.
import type { BrowserContext } from '@playwright/test';
import { ask, configure, expect, MOCK_LLM, mockLlm, mockSubtitles, openPanel, patchLlmSettings, test } from './fixtures';

const PLATFORM = 'https://platform.deepseek.com';
const envelope = (bizData: unknown) => ({ json: { code: 0, msg: '', data: { biz_code: 0, biz_msg: '', biz_data: bizData } } });

/** A platform that approves the login at once, with a ¥10 bonus waiting. Returns what it was asked. */
async function mockPlatform(context: BrowserContext) {
  const calls = { init: undefined as any, exchange: undefined as any, claimed: [] as string[], logouts: 0 };
  await context.route(`${PLATFORM}/auth-api/v0/dsh/auth_init`, (route) => {
    calls.init = route.request().postDataJSON();
    return route.fulfill(envelope({ authorize_url: `${PLATFORM}/dsh/authorize?authorize_id=a1`, authorize_id: 'a1', expires_in: 600 }));
  });
  // The user approves; DeepSeek sends the browser to the loopback callback.
  await context.route(/^https:\/\/platform\.deepseek\.com\/dsh\/authorize\?/, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script>location.href = ${JSON.stringify(`${calls.init.redirect_uri}?code=c1&state=${calls.init.state}`)}</script>`,
    }),
  );
  await context.route(`${PLATFORM}/auth-api/v0/dsh/auth_exchange`, (route) => {
    calls.exchange = route.request().postDataJSON();
    return route.fulfill(
      envelope({ token: 'account-token', user: { email: 'u***r@example.com', mobile_number: '138******00', area_code: '+86', token: 'account-token' } }),
    );
  });
  let bonusWallet = '0';
  await context.route(`${PLATFORM}/api/v0/users/get_user_summary`, (route) =>
    route.fulfill(envelope({ normal_wallets: [{ currency: 'CNY', balance: '24.8946' }], bonus_wallets: [{ currency: 'CNY', balance: bonusWallet }] })),
  );
  await context.route(`${PLATFORM}/api/v0/users/get_unnotified_bonuses`, (route) =>
    route.fulfill(envelope(calls.claimed.length ? [] : [{ order_id: 'b1', amount: '10', expires_at: '2026-12-20T00:00:00+08:00' }])),
  );
  await context.route(`${PLATFORM}/api/v0/users/ack_bonus_notified`, (route) => {
    calls.claimed.push(route.request().postDataJSON().order_id);
    bonusWallet = '10';
    return route.fulfill(envelope(null));
  });
  await context.route(`${PLATFORM}/auth-api/v0/users/logout`, (route) => {
    calls.logouts++;
    return route.fulfill(envelope(null));
  });
  return calls;
}

test('signs in with a DeepSeek account and answers with it', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const calls = await mockPlatform(context);
  await mockLlm(context, 'An answer. [00:20]');
  const headers: Record<string, string>[] = [];
  await context.route('https://api.deepseek.com/chat/completions', (route) => {
    headers.push(route.request().headers());
    return route.fallback();
  });
  const { panel, video } = await openPanel(context, extensionId);

  // DeepSeek offers the account first.
  await expect(panel.getByRole('button', { name: 'DeepSeek account' })).toHaveAttribute('aria-pressed', 'true');
  const opened = context.waitForEvent('page');
  await panel.getByRole('button', { name: 'Sign in', exact: true }).click();
  const page = await opened;
  // A tab the extension opens loads before Playwright's routes attach, so load the authorization page again.
  await page.goto(`${PLATFORM}/dsh/authorize?authorize_id=a1`).catch(() => {});
  await expect(page).toHaveURL(new RegExp(`^chrome-extension://${extensionId}/account-callback.html`));
  await expect(page.getByText('Signed in to DeepSeek')).toBeVisible();
  expect(calls.init).toMatchObject({ code_challenge_method: 'S256', redirect_uri: 'http://127.0.0.1:53682/oauth/callback' });
  expect(calls.exchange).toMatchObject({ code: 'c1', redirect_uri: 'http://127.0.0.1:53682/oauth/callback' });

  // Back in the panel: the account shows in the form, and connecting needs only a model.
  await expect(panel.getByText('u***r@example.com')).toBeVisible();
  await panel.getByLabel('Model').selectOption('deepseek-flash');
  await panel.getByRole('button', { name: 'Connect' }).click();
  // The login tab closes itself and the browser goes back to the video.
  await page.waitForEvent('close');
  await video.bringToFront();

  await ask(panel, { preset: 'Recap' });
  expect(headers[0]!['x-dsh-auth-token']).toBe('account-token');
  expect(headers[0]!.authorization).toBeUndefined();

  // Settings: who, balances, the bonus to claim.
  await panel.getByRole('button', { name: 'Settings' }).click();
  const card = panel.getByTestId('account-card');
  await expect(card).toContainText('u***r@example.com');
  await expect(card).toContainText('+86 138******00');
  await expect(panel.getByTestId('account-balance')).toHaveText('¥24.89');
  await panel.getByRole('button', { name: 'Claim' }).click();
  await expect(panel.getByText(/Claimed · expires/)).toBeVisible();
  expect(calls.claimed).toEqual(['b1']);
  await expect(panel.getByText('¥10.00')).toBeVisible();

  // Signing out asks first, then voids the token at DeepSeek.
  await panel.getByRole('button', { name: 'Sign out' }).click();
  await expect(panel.getByText('Sign out of DeepSeek?')).toBeVisible();
  await panel.getByRole('button', { name: 'Sign out' }).last().click();
  await expect(panel.getByTestId('account-card')).toHaveCount(0);
  expect(calls.logouts).toBe(1);
});

test('an expired account login offers to sign in again', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  await mockPlatform(context);
  await context.route('https://api.deepseek.com/chat/completions', (route) =>
    route.fulfill({ status: 401, json: { error: { message: 'Authentication Fails', type: 'authentication_error' } } }),
  );
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await patchLlmSettings(panel, { apiKeys: {}, deepseekAuth: 'account', deepseekAccount: { token: 'old-token', email: 'u***r@example.com' } });

  const answer = await ask(panel, { preset: 'Recap' });
  await expect(answer.getByTestId('answer-error')).toContainText('login has expired');
  await expect(answer.getByRole('button', { name: 'Sign in again' })).toBeVisible();

  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByTestId('account-card')).toContainText('Login expired');
});
