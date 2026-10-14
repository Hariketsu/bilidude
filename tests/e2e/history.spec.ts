import type { Page } from '@playwright/test';
import { ask, configure, DEFAULT_BVID, expect, MOCK_LLM, mockLlm, mockSubtitles, openPanel, test } from './fixtures';

test.beforeEach(async ({ context }) => {
  await mockSubtitles(context);
  await mockLlm(context, '# A recap\n\nFirst point. [00:12]');
});

const presets = (panel: Page) => panel.getByRole('button', { name: 'Recap', exact: true });

test('saves conversations and reopens them from history', async ({ context, extensionId }) => {
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await ask(panel, { preset: 'Recap' });

  await panel.getByRole('button', { name: 'New chat' }).click();
  await expect(panel.getByTestId('answer')).toHaveCount(0);

  await panel.getByRole('button', { name: 'History' }).click();
  const items = panel.getByTestId('history-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Never Gonna Give You Up');
  await expect(items.first()).toContainText('Recap');

  await items.first().click();
  await expect(panel.getByTestId('answer')).toContainText('First point.');
  await expect(panel.getByRole('button', { name: '00:12' })).toBeVisible();
  // Follow-ups continue the restored conversation.
  await ask(panel, { text: 'More?' });
  await expect(panel.getByTestId('answer')).toHaveCount(2);
});

test('deletes a conversation from history', async ({ context, extensionId }) => {
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await ask(panel, { preset: 'Recap' });

  await panel.getByRole('button', { name: 'History' }).click();
  await panel.getByTestId('history-item').hover();
  await panel.getByRole('button', { name: 'Delete' }).click();
  await expect(panel.getByText('No conversations yet')).toBeVisible();
});

test("restores a tab's conversation when switching back to it", async ({ context, extensionId }) => {
  const { video, panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await ask(panel, { preset: 'Recap' });

  const other = await context.newPage();
  await other.goto('about:blank');
  await expect(panel.getByText('Open a Bilibili video to start')).toBeVisible();

  await video.bringToFront();
  await expect(panel.getByTestId('answer')).toContainText('First point.');
});

for (const [policy, resumes] of [
  ['new', false],
  ['resume', true],
] as const) {
  test(`opening the same video again with policy "${policy}"`, async ({ context, extensionId }) => {
    const { panel } = await openPanel(context, extensionId);
    await configure(panel, MOCK_LLM);
    await panel.evaluate(async (sessionPolicy) => {
      const storage = (globalThis as unknown as { chrome: typeof browser }).chrome.storage.local;
      const { settings } = await storage.get('settings');
      await storage.set({ settings: { ...(settings as object), sessionPolicy } });
    }, policy);
    await ask(panel, { preset: 'Recap' });

    const again = await context.newPage();
    await again.goto(`https://www.bilibili.com/video/${DEFAULT_BVID}/`, { waitUntil: 'domcontentloaded' });
    if (resumes) {
      await expect(panel.getByTestId('answer')).toContainText('First point.');
    } else {
      await expect(presets(panel)).toBeVisible();
      await expect(panel.getByTestId('answer')).toHaveCount(0);
    }
  });
}
