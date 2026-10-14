// Calls the real LLM configured in .env.local (see .env.example); skipped when unset.
import { ask, chipSeconds, configure, DEFAULT_BVID, env, expect, loginBilibili, mockSubtitles, openPanel, test } from './fixtures';

const ANSWER_TIMEOUT = 150_000;
const realSubtitles = !!(env.bilibili.sessdata && env.bilibili.bvid);

test.skip(!env.llm.provider || !env.llm.apiKey || !env.llm.model, 'Set E2E_LLM_* in .env.local to run');
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ context }) => {
  if (realSubtitles) await loginBilibili(context, env.bilibili.sessdata);
  else await mockSubtitles(context);
});

async function start(context: Parameters<typeof openPanel>[0], extensionId: string) {
  const { video, panel } = await openPanel(context, extensionId, realSubtitles ? env.bilibili.bvid : DEFAULT_BVID);
  // English answers about a Chinese video exercise the quote-plus-translation rule.
  await configure(panel, env.llm, 'en');
  return { video, panel };
}

for (const preset of ['Recap', 'Table of Contents', 'Top Quotes']) {
  test(`${preset} produces a finished answer with citations`, async ({ context, extensionId }, testInfo) => {
    const { panel } = await start(context, extensionId);
    const answer = await ask(panel, { preset }, ANSWER_TIMEOUT);
    await testInfo.attach('answer.txt', { body: await answer.innerText(), contentType: 'text/plain' });

    await expect(answer).toHaveAttribute('data-status', 'done');
    await expect(answer.getByTestId('answer-error')).toHaveCount(0);
    const chips = await chipSeconds(answer);
    expect(chips.length).toBeGreaterThan(1);

    if (preset === 'Recap') {
      await expect(answer.locator('h1')).toHaveCount(1);
      await expect(answer.locator('h2').first()).toBeVisible();
    }
    if (preset === 'Table of Contents') {
      expect(await answer.locator('h2').count()).toBeGreaterThanOrEqual(2);
      // The built-in transcript runs to 02:59; the last chapter should start in its final quarter.
      if (!realSubtitles) expect(Math.max(...chips)).toBeGreaterThanOrEqual(120);
    }
    if (preset === 'Top Quotes') {
      expect(await answer.locator('h2').count()).toBeGreaterThanOrEqual(3);
      // Quotes that fail the verbatim check are shown as paraphrases; most should pass.
      const quotes = await answer.locator('blockquote').count();
      const paraphrases = await answer.locator('[data-paraphrase]').count();
      testInfo.annotations.push({ type: 'quotes', description: `${quotes} verbatim, ${paraphrases} paraphrased` });
      expect(quotes).toBeGreaterThan(paraphrases);
    }
  });
}

test('follow-up uses the playback position', async ({ context, extensionId }, testInfo) => {
  const { video, panel } = await start(context, extensionId);
  await ask(panel, { preset: 'Recap' }, ANSWER_TIMEOUT);

  await video.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) > 0);
  await video.evaluate(() => {
    document.querySelector('video')!.currentTime = 100;
  });
  const answer = await ask(panel, { text: 'What is being said right now?' }, ANSWER_TIMEOUT);
  await testInfo.attach('answer.txt', { body: await answer.innerText(), contentType: 'text/plain' });

  await expect(answer).toHaveAttribute('data-status', 'done');
  // Cited moments should be near the playhead, not anywhere in the video.
  const chips = await chipSeconds(answer);
  expect(chips.some((s) => Math.abs(s - 100) <= 30)).toBe(true);
});
