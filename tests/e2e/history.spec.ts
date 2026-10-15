import { readFile } from 'node:fs/promises';
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

test('exports a conversation as Markdown with linked timestamps', async ({ context, extensionId }) => {
  await mockLlm(context, '# Title\n\nSnapped. [00:20]\n\nPast the end. [59:00]');
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await ask(panel, { preset: 'Recap' });

  const download = panel.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export conversation' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.md$/);
  const markdown = await readFile((await file.path())!, 'utf8');
  expect(markdown).toContain('https://www.bilibili.com/video/BV1GJ411x7h7/');
  expect(markdown).toContain('**Recap**');
  // Snapped to the transcript line like in the panel; the invented time is dropped.
  expect(markdown).toContain('Snapped. [00:12](https://www.bilibili.com/video/BV1GJ411x7h7/?t=12)');
  expect(markdown).not.toContain('59:00');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', { name: 'Copy' }).click();
  expect(await panel.evaluate(() => navigator.clipboard.readText())).toContain('[00:12](https://www.bilibili.com/video/BV1GJ411x7h7/?t=12)');
});

test('expires unused cached subtitles but keeps those of the history', async ({ context, extensionId }) => {
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await ask(panel, { preset: 'Recap' }); // caches this video's transcript, and it is in the history

  const daysAgo = (days: number) => Date.now() - days * 86_400_000;
  const transcriptKeys = () =>
    panel.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          indexedDB.open('bilidude').onsuccess = (e) => {
            const request = (e.target as IDBOpenDBRequest).result.transaction('transcripts').objectStore('transcripts').getAllKeys();
            request.onsuccess = () => resolve((request.result as string[]).sort());
          };
        }),
    );
  const [historyKey] = await transcriptKeys();
  await panel.evaluate(
    ({ historyKey, old }) =>
      new Promise<void>((resolve) => {
        indexedDB.open('bilidude').onsuccess = (e) => {
          const tx = (e.target as IDBOpenDBRequest).result.transaction('transcripts', 'readwrite');
          const store = tx.objectStore('transcripts');
          const line = { from: 0, to: 5, text: 'x' };
          store.put({ key: 'BVold:1', source: 'ai', lang: 'zh', lines: [line], chapters: [], fetchedAt: old, usedAt: old });
          store.put({ key: 'BVnew:2', source: 'ai', lang: 'zh', lines: [line], chapters: [], fetchedAt: Date.now() });
          // Unused for long too, but the saved conversation still needs it.
          store.get(historyKey).onsuccess = (g) => store.put({ ...(g.target as IDBRequest).result, usedAt: old });
          tx.oncomplete = () => resolve();
        };
      }),
    { historyKey: historyKey!, old: daysAgo(40) },
  );

  await panel.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.getByTestId('cache-size')).not.toHaveText('…');
  const policy = panel.getByLabel('Delete cached subtitles');
  await policy.selectOption('never');
  await policy.selectOption('age'); // 30 days by default; applies at once
  await expect.poll(transcriptKeys).toEqual(['BVnew:2', historyKey].sort());

  await panel.getByRole('button', { name: 'Clear' }).click();
  await expect.poll(transcriptKeys).toEqual([historyKey]);
});
