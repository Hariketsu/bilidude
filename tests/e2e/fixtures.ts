import path from 'node:path';
import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { TRANSCRIPT_BODY } from './transcript';

const EXTENSION_PATH = path.resolve('.output/chrome-mv3');
/** A long-lived public video; its page provides a real player for seeking. */
export const DEFAULT_BVID = 'BV1GJ411x7h7';
const FAKE_SUBTITLE_URL = 'https://aisubtitle.hdslb.com/bfs/e2e-fixture.json';

export const env = {
  llm: {
    provider: process.env.E2E_LLM_PROVIDER ?? '',
    apiKey: process.env.E2E_LLM_API_KEY ?? '',
    model: process.env.E2E_LLM_MODEL ?? '',
    baseUrl: process.env.E2E_LLM_BASE_URL ?? '',
  },
  bilibili: {
    sessdata: process.env.E2E_BILIBILI_SESSDATA ?? '',
    bvid: process.env.E2E_BILIBILI_BVID ?? '',
  },
};

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
      viewport: { width: 420, height: 860 },
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
});

export { expect };

/** Serves the built-in transcript for every video instead of Bilibili's (login-only) subtitles. */
export async function mockSubtitles(context: BrowserContext) {
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  });
  await context.route(/\/x\/player\/(wbi\/)?v2\?/, (route) =>
    route.fulfill(
      json({
        code: 0,
        data: {
          subtitle: { subtitles: [{ id_str: '1', lan: 'ai-zh', lan_doc: '中文', subtitle_url: FAKE_SUBTITLE_URL }] },
          view_points: [],
        },
      }),
    ),
  );
  await context.route(FAKE_SUBTITLE_URL, (route) => route.fulfill(json({ body: TRANSCRIPT_BODY })));
}

export async function loginBilibili(context: BrowserContext, sessdata: string) {
  await context.addCookies([
    { name: 'SESSDATA', value: sessdata, domain: '.bilibili.com', path: '/', httpOnly: true, secure: true },
  ]);
}

/**
 * Opens a video and the side panel page next to it. The panel follows the active tab,
 * so the video tab is brought to front afterwards.
 */
export async function openPanel(context: BrowserContext, extensionId: string, bvid = DEFAULT_BVID) {
  const video = context.pages()[0] ?? (await context.newPage());
  await video.goto(`https://www.bilibili.com/video/${bvid}/`, { waitUntil: 'domcontentloaded' });
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await video.bringToFront();
  return { video, panel };
}

export interface LlmConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** Writes settings directly, skipping the setup form (and its permission prompt). */
export async function configure(panel: Page, llm: LlmConfig, outputLanguage = 'en') {
  await panel.evaluate(
    ({ llm, outputLanguage }) =>
      // Runs in the extension page, where `chrome` is the extension API.
      (globalThis as unknown as { chrome: typeof browser }).chrome.storage.local.set({
        settings: {
          llm: {
            provider: llm.provider,
            models: { [llm.provider]: llm.model },
            apiKeys: { [llm.provider]: llm.apiKey },
            customBaseUrl: llm.baseUrl ?? '',
          },
          outputLanguage,
          theme: 'system',
        },
      }),
    { llm, outputLanguage },
  );
}

/** Sends a preset (and optional text) and waits until the answer finishes. */
export async function ask(panel: Page, { preset, text }: { preset?: string; text?: string }, timeout = 30_000) {
  const answers = panel.getByTestId('answer');
  const count = await answers.count();
  if (preset) await panel.getByRole('button', { name: preset, exact: true }).click();
  if (text) await panel.getByRole('textbox').fill(text);
  await panel.getByRole('button', { name: 'Send' }).click();
  const answer = answers.nth(count);
  await expect(answer).not.toHaveAttribute('data-status', 'streaming', { timeout });
  return answer;
}

export async function chipSeconds(scope: Page | ReturnType<Page['locator']>): Promise<number[]> {
  const values = await scope.locator('[data-seconds]').evaluateAll((els) => els.map((el) => el.getAttribute('data-seconds')));
  return values.map(Number);
}
