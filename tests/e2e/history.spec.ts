import { readFile } from 'node:fs/promises';
import type { Download, Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
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
  // Asks first; cancelling keeps it.
  const dialog = panel.getByRole('alertdialog');
  await expect(dialog).toContainText('Delete this conversation?');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel.getByTestId('history-item')).toHaveCount(1);
  await panel.getByTestId('history-item').hover();
  await panel.getByRole('button', { name: 'Delete' }).click();
  await panel.keyboard.press('Escape');
  await expect(panel.getByRole('alertdialog')).toHaveCount(0);
  await expect(panel.getByTestId('history-item')).toHaveCount(1);

  await panel.getByTestId('history-item').hover();
  await panel.getByRole('button', { name: 'Delete' }).click();
  await panel.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
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
  await panel.getByRole('button', { name: 'Download' }).click();
  await panel.getByRole('menuitem', { name: 'Conversation (.md)' }).click();
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

test('downloads several conversations and their subtitles from the history', async ({ context, extensionId }) => {
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await ask(panel, { preset: 'Recap' });
  await panel.getByRole('button', { name: 'New chat' }).click();
  await ask(panel, { text: 'Second question' });
  await panel.getByRole('button', { name: 'History' }).click();
  await expect(panel.getByTestId('history-item')).toHaveCount(2);

  const downloads: Download[] = [];
  panel.on('download', (d) => downloads.push(d));
  const chooseAndDownload = async (bundle: 'One ZIP file' | 'Separate files') => {
    await panel.getByRole('button', { name: 'Select', exact: true }).click();
    await panel.getByText('Select all').click();
    await expect(panel.getByTestId('history-bar')).toContainText('2 selected');
    await panel.getByTestId('history-bar').getByRole('button', { name: 'Download' }).click();
    const sheet = panel.getByTestId('export-sheet');
    await sheet.getByText('Subtitles (.srt)').click();
    await sheet.getByRole('button', { name: bundle }).click();
    await sheet.getByRole('button', { name: 'Download' }).click();
  };

  // Esc closes the sheet without downloading.
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  await panel.getByText('Select all').click();
  await panel.getByTestId('history-bar').getByRole('button', { name: 'Download' }).click();
  await expect(panel.getByTestId('export-sheet')).toBeVisible();
  await panel.keyboard.press('Escape');
  await expect(panel.getByTestId('export-sheet')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Done' }).click();

  // One ZIP: a Markdown file per conversation, the shared video's subtitles once.
  await chooseAndDownload('One ZIP file');
  await expect.poll(() => downloads.length).toBe(1);
  expect(downloads[0]!.suggestedFilename()).toMatch(/^bilidude-.*\.zip$/);
  const zip = unzipSync(await readFile((await downloads[0]!.path())!));
  const names = Object.keys(zip).sort();
  expect(names).toHaveLength(3);
  expect(names.filter((n) => n.endsWith('.md'))).toHaveLength(2);
  expect(names.filter((n) => n.endsWith(' (2).md'))).toHaveLength(1);
  const srt = names.find((n) => n.endsWith('.srt'))!;
  expect(strFromU8(zip[srt]!)).toContain('-->');

  // Separate files, the choice remembered for next time.
  await chooseAndDownload('Separate files');
  await expect.poll(() => downloads.length).toBe(4);
  expect(downloads.slice(1).map((d) => d.suggestedFilename().split('.').pop()).sort()).toEqual(['md', 'md', 'srt']);
  await panel.getByRole('button', { name: 'Select', exact: true }).click();
  await panel.getByText('Select all').click();
  await panel.getByTestId('history-bar').getByRole('button', { name: 'Download' }).click();
  await expect(panel.getByTestId('export-sheet').getByRole('button', { name: 'Separate files' })).toHaveAttribute('aria-pressed', 'true');
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
