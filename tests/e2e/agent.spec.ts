// The agent loop and web search; models and the search API are mocked.
import { readFile } from 'node:fs/promises';
import { ask, configure, expect, MOCK_LLM, mockChatTurns, mockSubtitles, openPanel, patchLlmSettings, test } from './fixtures';

const OPENROUTER = { provider: 'openrouter', apiKey: 'sk-or', model: 'vendor/some-model' };
const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

test.beforeEach(async ({ context }) => {
  await mockSubtitles(context);
});

test('with web search on, a non-DeepSeek model searches through the DeepSeek Search API', async ({ context, extensionId }) => {
  const requests = await mockChatTurns(context, CHAT_URL, [
    { toolCall: { name: 'web_search', arguments: { query: 'Rick Astley 1987' } } },
    { text: 'Released in 1987 [1]. [00:20]' },
  ]);
  const searches: { auth?: string; body: any }[] = [];
  await context.route('https://api.deepseek.com/v1/tools/search', (route) => {
    searches.push({ auth: route.request().headers().authorization, body: route.request().postDataJSON() });
    return route.fulfill({
      json: { results: [{ title: 'Never Gonna Give You Up', url: 'https://example.com/ngguy', site_name: 'Example', site_icon: null, snippet: 's', summary: 'A 1987 song.', content: '' }] },
    });
  });
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, OPENROUTER);
  await patchLlmSettings(panel, { apiKeys: { openrouter: 'sk-or', deepseek: 'sk-ds' } });

  await panel.getByRole('button', { name: 'Web search' }).click();
  const answer = await ask(panel, { text: 'When was this released?' });

  expect(requests[0].tools.map((tool: any) => tool.function.name)).toContain('web_search');
  expect(searches).toEqual([{ auth: 'Bearer sk-ds', body: expect.objectContaining({ query: 'Rick Astley 1987' }) }]);
  // The result goes back to the model, numbered for citing.
  expect(JSON.stringify(requests[1].messages)).toContain('[1] Never Gonna Give You Up');
  expect(JSON.stringify(requests[1].messages)).toContain('A 1987 song.');
  await expect(answer).toContainText('Released in 1987');
  await expect(answer.getByTestId('search-step')).toContainText('Read 1 web page');
  // The model's [1] is a chip linking to the page.
  await expect(answer.locator('[data-citation="1"]')).toHaveAttribute('href', 'https://example.com/ngguy');
  await expect(answer.getByTestId('answer-sources')).toContainText('1 web page');
  // Pages are folded away until asked for.
  await expect(answer.getByTestId('search-step').getByRole('link')).toHaveCount(0);
  await answer.getByTestId('search-step').getByRole('button').click();
  await expect(answer.getByTestId('search-step')).toContainText('Rick Astley 1987');
  await expect(answer.getByTestId('search-step').getByRole('link', { name: /Never Gonna Give You Up/ })).toHaveAttribute(
    'href',
    'https://example.com/ngguy',
  );
});

test('web search is off by default: no tools are offered', async ({ context, extensionId }) => {
  const requests = await mockChatTurns(context, CHAT_URL, [{ text: 'An answer. [00:20]' }]);
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, OPENROUTER);
  await patchLlmSettings(panel, { apiKeys: { openrouter: 'sk-or', deepseek: 'sk-ds' } });

  await expect(panel.getByRole('button', { name: 'Web search' })).toHaveAttribute('aria-pressed', 'false');
  await ask(panel, { text: 'What is this?' });
  expect(requests[0].tools ?? []).toEqual([]);
});

test('without a DeepSeek key there is no web search', async ({ context, extensionId }) => {
  await mockChatTurns(context, CHAT_URL, [{ text: 'An answer.' }]);
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, OPENROUTER);
  await expect(panel.getByRole('button', { name: 'Recap', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Web search' })).toHaveCount(0);
});

test('a DeepSeek key for search alone can be entered in settings', async ({ context, extensionId }) => {
  await mockChatTurns(context, CHAT_URL, [{ text: 'An answer.' }]);
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, OPENROUTER);
  await expect(panel.getByRole('button', { name: 'Web search' })).toHaveCount(0);

  await panel.getByRole('button', { name: 'Settings' }).click();
  await panel.getByLabel('DeepSeek API key').fill('sk-ds');
  await panel.getByRole('button', { name: 'Back' }).click();
  await expect(panel.getByRole('button', { name: 'Web search' })).toBeVisible();
});

test('a follow-up replays the earlier search', async ({ context, extensionId }) => {
  const requests = await mockChatTurns(context, CHAT_URL, [
    { toolCall: { name: 'web_search', arguments: { query: 'Rick Astley' } } },
    { text: 'He is a singer.' },
    { text: 'Yes.' },
  ]);
  await context.route('https://api.deepseek.com/v1/tools/search', (route) =>
    route.fulfill({ json: { results: [{ title: 'Rick Astley', url: 'https://example.com/ra', summary: 'English singer.' }] } }),
  );
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, OPENROUTER);
  await patchLlmSettings(panel, { apiKeys: { openrouter: 'sk-or', deepseek: 'sk-ds' } });
  await panel.getByRole('button', { name: 'Web search' }).click();

  await ask(panel, { text: 'Who is singing?' });
  await ask(panel, { text: 'Is he English?' });
  const replayed = JSON.stringify(requests[2].messages);
  expect(replayed).toContain('English singer.');
  expect(replayed).toContain('He is a singer.');
});

test('with DeepSeek, web search runs on DeepSeek and its searches and citations are shown', async ({ context, extensionId }) => {
  const recorded = await readFile('tests/unit/fixtures/deepseek-server-search.sse', 'utf8');
  const requests: any[] = [];
  await context.route('https://api.deepseek.com/chat/completions', (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: recorded });
  });
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await panel.getByRole('button', { name: 'Web search' }).click();

  const answer = await ask(panel, { text: 'When was this released?' });
  expect(requests[0].tools).toContainEqual({ type: 'deepseek_web_search' });
  expect(requests[0].tools.map((tool: any) => tool.function?.name)).not.toContain('web_search');
  await expect(answer).toContainText('1987');
  await expect(answer.getByTestId('search-step')).toContainText('Read 3 web pages');
  await answer.getByTestId('search-step').getByRole('button').click();
  await expect(answer.getByTestId('search-step')).toContainText('When was "Never Gonna Give You Up" by Rick Astley released?');
  await expect(answer.getByTestId('search-step').getByRole('link')).toHaveCount(3);
  // Where the cited text ends: Wikipedia is the second search result; Baidu Baike wasn't among them, so it comes after.
  await expect(answer.locator('[data-citation]')).toHaveText(['2', '4']);
  await expect(answer.locator('p').first()).toContainText('发行24。');
  await expect(answer.getByTestId('answer-sources')).toContainText('2 web pages');
  await answer.getByTestId('answer-sources').getByRole('button').click();
  await expect(answer.getByTestId('answer-sources').getByRole('link')).toHaveCount(2);
});
