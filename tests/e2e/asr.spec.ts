// Speech recognition for videos without subtitles. The default video (BV1GJ411x7h7) is a
// 3:33 English song, so its real audio gives recognizable text.
import {
  ask,
  configure,
  configureAsr,
  env,
  expect,
  MOCK_LLM,
  mockLlm,
  mockNoSubtitles,
  openPanel,
  test,
} from './fixtures';

const systemPrompt = (requests: any[]) => JSON.stringify(requests[0].messages[0].content);

test.beforeEach(async ({ context }) => {
  await mockNoSubtitles(context);
});

test('Bcut: uploads in parts, creates a task and polls for the result', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  // Mocked: the real service rate-limits by IP. Run it with E2E_ASR_PROVIDER=bcut.
  const requests = await mockLlm(context, 'A song. [00:20]');
  const api = 'https://member.bilibili.com/x/bcut/rubick-interface';
  const calls: string[] = [];
  let polls = 0;
  const ok = (data: unknown) => ({ json: { code: 0, message: '0', data } });
  await context.route(`${api}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/x/bcut/rubick-interface', '');
    calls.push(path);
    if (path === '/resource/create') {
      const form = new URLSearchParams(route.request().postData()!);
      expect(form.get('resource_file_type')).toBe('aac');
      const size = Number(form.get('size'));
      return route.fulfill(
        ok({ in_boss_key: 'k', resource_id: 'r', upload_id: 'u', per_size: Math.ceil(size / 2), upload_urls: ['http://jssz-boss.biliapi.net/p1', 'http://jssz-boss.biliapi.net/p2'] }),
      );
    }
    if (path === '/resource/create/complete') {
      expect(new URLSearchParams(route.request().postData()!).get('etags')).toBe('etag-p1,etag-p2');
      return route.fulfill(ok({ resource_id: 'r', download_url: 'http://jssz-boss.bilibili.co/x' }));
    }
    if (path === '/task') return route.fulfill(ok({ task_id: 't1' }));
    // Running once, then done.
    if (++polls === 1) return route.fulfill(ok({ task_id: 't1', state: 1, remark: '' }));
    const result = { utterances: [{ start_time: 2500, end_time: 5000, transcript: 'never gonna give you up' }] };
    return route.fulfill(ok({ task_id: 't1', state: 4, remark: '', result: JSON.stringify(result) }));
  });
  await context.route('http://jssz-boss.biliapi.net/**', (route) =>
    route.fulfill({ status: 200, headers: { etag: `etag-${route.request().url().split('/').pop()}` } }),
  );
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await configureAsr(panel, { provider: 'bcut' });

  const answer = await ask(panel, { preset: 'Recap' }, 60_000);
  await expect(answer).toHaveAttribute('data-status', 'done');
  expect(calls).toEqual(['/resource/create', '/resource/create/complete', '/task', '/task/result', '/task/result']);
  const prompt = systemPrompt(requests);
  expect(prompt).toContain('speech recognition of the audio');
  expect(prompt).toContain('[00:02] never gonna give you up');
  // Resume points are dropped once the transcript is stored.
  const chunks = await panel.evaluate(
    () =>
      new Promise<number>((resolve) => {
        indexedDB.open('bilidude').onsuccess = (e) => {
          const request = (e.target as IDBOpenDBRequest).result.transaction('asrChunks').objectStore('asrChunks').count();
          request.onsuccess = () => resolve(request.result);
        };
      }),
  );
  expect(chunks).toBe(0);
});

test('OpenAI-compatible: uploads WAV and uses segment timestamps', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  const requests = await mockLlm(context, 'A song. [00:20]');
  const uploads: Buffer[] = [];
  await context.route('https://api.openai.com/v1/audio/transcriptions', (route) => {
    uploads.push(route.request().postDataBuffer()!);
    return route.fulfill({
      json: { text: 'x', segments: [{ start: 1.5, end: 4, text: 'first line' }, { start: 20, end: 24, text: 'second line' }] },
    });
  });
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await configureAsr(panel, { provider: 'openai', apiKeys: { openai: 'sk-test' } });

  await ask(panel, { preset: 'Recap' }, 60_000);
  // 3:33 of audio fits in one 5-minute chunk, decoded to WAV.
  expect(uploads).toHaveLength(1);
  const body = uploads[0]!.toString('latin1');
  expect(body).toContain('RIFF');
  expect(body).toContain('WAVE');
  expect(body).toContain('verbose_json');
  expect(systemPrompt(requests)).toContain('[00:01] first line');
  expect(systemPrompt(requests)).toContain('[00:20] second line');
});

test('SiliconFlow: estimates times for text-only results', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  const requests = await mockLlm(context, 'A song. [00:20]');
  let calls = 0;
  await context.route('https://api.siliconflow.cn/v1/audio/transcriptions', (route) => {
    calls++;
    return route.fulfill({ json: { text: '第一句。第二句。' } });
  });
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await configureAsr(panel, { provider: 'siliconflow', apiKeys: { siliconflow: 'sk-test' } });

  await ask(panel, { preset: 'Recap' }, 60_000);
  expect(calls).toBe(4); // chunks of at most a minute
  const prompt = systemPrompt(requests);
  expect(prompt).toContain('times=\\"approximate');

  const times = (sentence: string) =>
    [...prompt.matchAll(new RegExp(`\\[(\\d\\d):(\\d\\d)\\] ${sentence}`, 'g'))].map((m) => Number(m[1]) * 60 + Number(m[2]));
  const starts = times('第一句');
  const ends = [...starts.slice(1), 213]; // the video is 3:33
  expect(starts[0]).toBe(0);
  for (const [i, start] of starts.entries()) {
    // Cut in the quietest moment of the last 15 s before the one-minute limit.
    expect(ends[i]! - start).toBeLessThanOrEqual(60);
    if (i < starts.length - 1) expect(ends[i]! - start).toBeGreaterThanOrEqual(44);
    // Each chunk's second sentence starts half-way through it.
    expect(Math.abs(times('第二句')[i]! - (start + ends[i]!) / 2)).toBeLessThanOrEqual(1);
  }
});

test('DashScope: sends AAC as base64 and reads SSE sentences', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  const requests = await mockLlm(context, 'A song. [00:20]');
  const bodies: any[] = [];
  await context.route('https://dashscope.aliyuncs.com/**', (route) => {
    bodies.push(route.request().postDataJSON());
    const event = (begin: number, end: number, text: string, sentenceEnd = true) =>
      `data:${JSON.stringify({ output: { sentence: { begin_time: begin, end_time: end, text, sentence_end: sentenceEnd } } })}\n\n`;
    return route.fulfill({
      contentType: 'text/event-stream',
      body: event(500, 3000, 'partial', false) + event(500, 3000, 'hello there') + event(12000, 15000, 'general kenobi'),
    });
  });
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await configureAsr(panel, { provider: 'dashscope', apiKeys: { dashscope: 'sk-test' } });

  await ask(panel, { preset: 'Recap' }, 60_000);
  expect(bodies).toHaveLength(1);
  expect(bodies[0].model).toBe('fun-asr-flash-2026-06-15');
  expect(bodies[0].parameters).toEqual({ format: 'aac', sample_rate: '48000' });
  expect(bodies[0].input.messages[0].content[0].input_audio.data).toMatch(/^data:audio\/aac;base64,\/[/+]/); // ADTS sync word
  const prompt = systemPrompt(requests);
  expect(prompt).toContain('[00:00] hello there');
  expect(prompt).toContain('[00:12] general kenobi');
  expect(prompt).not.toContain('partial');
});

test('transcribes with the provider from .env.local (real API)', async ({ context, extensionId }, testInfo) => {
  // bcut needs no key, but is opt-in too: its real service rate-limits by IP.
  test.skip(!env.asr.provider || (env.asr.provider !== 'bcut' && !env.asr.apiKey), 'Set E2E_ASR_* in .env.local to run');
  test.setTimeout(180_000);
  const requests = await mockLlm(context, 'A song. [00:20]');
  const { panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  const id = env.asr.provider;
  await configureAsr(panel, {
    provider: id,
    apiKeys: { [id]: env.asr.apiKey },
    models: env.asr.model ? { [id]: env.asr.model } : {},
    customBaseUrl: env.asr.baseUrl,
    dashscopeRegion: env.asr.dashscopeRegion,
    dashscopeWorkspace: env.asr.dashscopeWorkspace,
  });

  const answer = await ask(panel, { preset: 'Recap' }, 150_000);
  await expect(answer).toHaveAttribute('data-status', 'done');
  const prompt = systemPrompt(requests);
  await testInfo.attach('transcript.txt', {
    body: prompt.slice(prompt.indexOf('<transcript')).replace(/\\n/g, '\n'),
    contentType: 'text/plain',
  });
  expect(prompt.toLowerCase()).toContain('never gonna');
});

test('starts transcribing when the panel opens, if set to', async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  let uploads = 0;
  await context.route('https://api.openai.com/v1/audio/transcriptions', (route) => {
    uploads++;
    return route.fulfill({ json: { text: 'x', segments: [{ start: 0, end: 2, text: 'hello' }] } });
  });
  const { video, panel } = await openPanel(context, extensionId);
  await configure(panel, MOCK_LLM);
  await configureAsr(panel, { provider: 'openai', apiKeys: { openai: 'sk-test' }, trigger: 'open' });
  // Settings apply to the next video shown; switch away and back.
  await (await context.newPage()).goto('about:blank');
  await video.bringToFront();

  await expect.poll(() => uploads, { timeout: 60_000 }).toBe(1);
  await expect(panel.getByTestId('answer')).toHaveCount(0);
});
