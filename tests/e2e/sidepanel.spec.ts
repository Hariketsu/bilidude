// Deterministic UI tests: subtitles and the LLM are mocked, so these always run.
import { readFile } from 'node:fs/promises';
import { ask, chipSeconds, configure, expect, MOCK_LLM, mockLlm, mockNoSubtitles, mockSubtitles, openPanel, test } from './fixtures';

test('asks to open a video when the active tab is not one', async ({ context, extensionId }) => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await configure(panel, MOCK_LLM);
  await expect(panel.getByText('Open a Bilibili video to start')).toBeVisible();
});

test('recognizes legacy av links', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  // av80433022 is the default test video, BV1GJ411x7h7.
  const { panel } = await openPanel(context, extensionId, 'av80433022');
  await configure(panel, MOCK_LLM);
  await expect(panel.getByText('Never Gonna Give You Up').first()).toBeVisible();
});

test('setup form connects a model', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const { panel } = await openPanel(context, extensionId);
  await expect(panel.getByText('Connect a model')).toBeVisible();

  await panel.getByLabel('Provider').selectOption('deepseek');
  await panel.getByLabel('API key').fill('sk-test');
  await panel.getByLabel('Model').selectOption('deepseek-flash');
  await panel.getByRole('button', { name: 'Connect' }).click();

  await expect(panel.getByRole('button', { name: 'Recap', exact: true })).toBeVisible();
});

test('fetches models from a custom OpenAI-compatible endpoint', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  await context.route('https://api.deepseek.com/v1/models', (route) =>
    route.fulfill({ json: { object: 'list', data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-chat' }] } }),
  );
  const { panel } = await openPanel(context, extensionId);
  await expect(panel.getByText('Connect a model')).toBeVisible();

  await panel.getByLabel('Provider').selectOption('custom');
  await panel.getByLabel('Base URL').fill('https://api.deepseek.com/v1');
  await panel.getByLabel('API key').fill('sk-test');
  await panel.getByRole('button', { name: 'Fetch models' }).click();

  await expect(panel.getByText('Fetched 2')).toBeVisible();
  await panel.getByLabel('Model').selectOption('deepseek-v4-flash');
  await panel.getByRole('button', { name: 'Connect' }).click();

  // Bilibili availability varies by environment; the saved choice is what matters here.
  await expect(panel.getByText('Connect a model')).toHaveCount(0);
  const saved = await panel.evaluate(async () => {
    const chrome = (globalThis as unknown as { chrome: typeof browser }).chrome;
    const { settings } = (await chrome.storage.local.get('settings')) as {
      settings: { llm: { provider: string; models: Record<string, string> } };
    };
    return settings.llm;
  });
  expect(saved.provider).toBe('custom');
  expect(saved.models.custom).toBe('deepseek-v4-flash');
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

test('thinking is off by default and switchable next to the composer', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const requests = await mockLlm(context, 'An answer. [00:06]');
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  const picker = panel.getByLabel('Thinking');
  await expect(picker).toHaveValue('off');
  // DeepSeek V4.1 Flash supports these levels; ones it lacks (medium) aren't offered.
  await expect(picker.locator('option')).toHaveText(['Off', 'Low', 'High', 'Max']);
  await ask(panel, { preset: 'Recap' });
  expect(requests[0].thinking).toEqual({ type: 'disabled' });

  await picker.selectOption('high');
  await ask(panel, { text: 'More detail?' });
  expect(requests[1].thinking).toEqual({ type: 'enabled' });
  expect(requests[1].reasoning_effort).toBe('high');
});

test('explains when a video has no subtitles', async ({ context, extensionId }) => {
  await mockNoSubtitles(context);
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

test('switches the interface language from settings', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  await panel.getByRole('button', { name: 'Settings' }).click();
  await panel.getByLabel('Language', { exact: true }).selectOption('zh-TW');
  await expect(panel.getByRole('heading', { name: '設定' })).toBeVisible();
  await expect(panel.locator('html')).toHaveAttribute('lang', 'zh-TW');

  await panel.getByRole('button', { name: '返回' }).click();
  await expect(panel.getByRole('button', { name: '摘要' })).toBeVisible();
  await expect(panel.getByRole('textbox')).toHaveAttribute('placeholder', '針對這部影片提問…');
});

test('downloads the subtitles as SRT, line by line', async ({ context, extensionId }) => {
  await mockSubtitles(context);
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  await panel.getByRole('button', { name: 'Download' }).click();
  // Nothing to export before the first answer.
  await expect(panel.getByRole('menuitem', { name: 'Conversation (.md)' })).toBeDisabled();
  const download = panel.waitForEvent('download');
  await panel.getByRole('menuitem', { name: 'Subtitles (.srt)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.srt$/);
  const srt = await readFile((await file.path())!, 'utf8');
  // The original 6 s sentences, not the ~12 s lines the model reads.
  expect(srt.startsWith('1\n00:00:00,000 --> 00:00:05,500\n大家好，今天我们聊一聊番茄工作法\n\n2\n00:00:06,000 --> ')).toBe(true);
});

test('offers to turn on transcription when a video has no subtitles', async ({ context, extensionId }) => {
  await mockNoSubtitles(context);
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);

  await panel.getByRole('button', { name: 'Download' }).click();
  await expect(panel.getByText('Turn on audio transcription to get them.')).toBeVisible();
  await expect(panel.getByRole('menuitem', { name: 'Subtitles (.srt)' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Open settings' }).click();
  await expect(panel.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
