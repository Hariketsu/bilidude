// Deterministic UI tests: subtitles and the LLM are mocked, so these always run.
import type { BrowserContext } from '@playwright/test';
import { ask, chipSeconds, configure, expect, mockSubtitles, openPanel, test } from './fixtures';

const MOCK_LLM = { provider: 'deepseek', apiKey: 'sk-test', model: 'deepseek-flash' };

/** Streams `answer` as an OpenAI-compatible chat completion and records request bodies. */
async function mockLlm(context: BrowserContext, answer: string) {
  const requests: any[] = [];
  const chunk = (delta: object, finish: string | null = null) =>
    `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: MOCK_LLM.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
  await context.route('https://api.deepseek.com/**', (route) => {
    requests.push(route.request().postDataJSON());
    let body = chunk({ reasoning_content: 'Reading the transcript first.' });
    for (let i = 0; i < answer.length; i += 40) body += chunk({ content: answer.slice(i, i + 40) });
    body += chunk({}, 'stop') + 'data: [DONE]\n\n';
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body });
  });
  return requests;
}

test('asks to open a video when the active tab is not one', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configure(panel, MOCK_LLM);
  await expect(panel.getByText('Open a Bilibili video to start')).toBeVisible();
});

test('setup form connects a model', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const { panel } = await openPanel(context, extensionId);
  await expect(panel.getByText('Connect a model')).toBeVisible();

  await panel.getByLabel('Provider').selectOption('deepseek');
  await panel.getByLabel('API key').fill('sk-test');
  await panel.getByLabel('Model').selectOption('deepseek-flash');
  await panel.getByRole('button', { name: 'Save' }).click();

  await expect(panel.getByRole('button', { name: 'Recap', exact: true })).toBeVisible();
});

test('validates timestamps and quotes against the transcript', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const requests = await mockLlm(
    context,
    [
      '# Title',
      '[00:03]', // snaps to the line starting at 00:00
      'Snapped. [00:20]', // 6s sentences merge into 12s lines: snaps to 00:12
      '> “二十五分钟呢” [01:00]\n> Twenty-five minutes', // verbatim (line at 01:00), with translation
      '> “这句话视频里没有” [01:30]', // not in the transcript
      'Past the end of the video. [59:00]',
    ].join('\n\n'),
  );
  const { video, panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  const answer = await ask(panel, { preset: 'Recap' });
  await expect(answer).toHaveAttribute('data-status', 'done');
  expect(await chipSeconds(answer)).toEqual([0, 12, 60, 84]);
  await expect(answer.locator('blockquote')).toHaveCount(1);
  await expect(answer.locator('[data-paraphrase]')).toContainText('这句话视频里没有');

  // The preset expands to instructions; the transcript rides in the system prompt.
  const [system, user] = requests[0].messages;
  expect(JSON.stringify(system.content)).toContain('[00:12] 名字来自他上学时用的番茄形状的厨房计时器');
  expect(JSON.stringify(user.content)).toContain('Recap this video');

  await answer.getByRole('button', { name: '01:00' }).click();
  await expect.poll(() => video.evaluate(() => document.querySelector('video')?.currentTime ?? 0)).toBeGreaterThanOrEqual(60);
});

test('follow-ups carry history and the playback position', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const requests = await mockLlm(context, 'An answer. [00:06]');
  const { video, panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  await ask(panel, { preset: 'Recap' });
  await video.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) > 0);
  await video.evaluate(() => {
    document.querySelector('video')!.currentTime = 95;
  });
  await ask(panel, { text: 'What did he just say?' });

  const messages = requests[1].messages;
  expect(messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  expect(JSON.stringify(messages.at(-1).content)).toMatch(/Current playback position: 01:3\d/);
});

test('explains when a video has no subtitles', async ({ context, extensionId }) => {
  await context.route(/\/x\/player\/(wbi\/)?v2\?/, (route) =>
    route.fulfill({ json: { code: 0, data: { subtitle: { subtitles: [] }, view_points: [] } } }),
  );
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  const answer = await ask(panel, { preset: 'Recap' });
  await expect(answer.getByTestId('answer-error')).toContainText('no subtitles');
});

test('switches theme from settings', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  await panel.getByRole('button', { name: 'Settings' }).click();
  await panel.getByRole('button', { name: 'Dark' }).click();
  await expect(panel.locator('html')).toHaveClass(/dark/);
  await panel.getByRole('button', { name: 'Light' }).click();
  await expect(panel.locator('html')).not.toHaveClass(/dark/);
});
