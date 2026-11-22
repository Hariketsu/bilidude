import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/llm/prompt';
import type { Transcript, VideoRef } from '@/lib/types';

const video: VideoRef = { bvid: 'BV1', aid: 1, cid: 1, p: 1, title: 'T', upName: 'U', desc: '', coverUrl: '', durationSec: 60 };
const transcript: Transcript = { source: 'cc', lang: 'zh', lines: [{ from: 0, to: 5, text: '你好' }], chapters: [] };

afterEach(() => vi.useRealTimers());

describe('buildSystemPrompt', () => {
  it('stays the same from day to day, so the transcript keeps hitting the prompt cache', () => {
    vi.useFakeTimers({ now: new Date('2026-11-20T10:00:00') });
    const today = buildSystemPrompt(video, transcript, 'English', 'server');
    vi.setSystemTime(new Date('2026-11-21T10:00:00'));
    expect(buildSystemPrompt(video, transcript, 'English', 'server')).toBe(today);
  });

  it('puts the web search rules after the transcript, so toggling search keeps the cached part before it', () => {
    const plain = buildSystemPrompt(video, transcript, 'English');
    const searchOff = buildSystemPrompt(video, transcript, 'English', 'off');
    const withClient = buildSystemPrompt(video, transcript, 'English', 'client');
    const withServer = buildSystemPrompt(video, transcript, 'English', 'server');
    for (const variant of [searchOff, withClient, withServer]) {
      expect(variant.startsWith(plain)).toBe(true);
      expect(variant.indexOf('# Web search')).toBeGreaterThan(variant.indexOf('</transcript>'));
    }
    expect(searchOff).toContain('globe button');
    expect(withClient).toContain('like [3]');
    expect(withServer).toContain('do not write [n]');
  });
});

describe('buildUserPrompt', () => {
  it("carries today's date with the playback position", () => {
    vi.useFakeTimers({ now: new Date('2026-11-20T10:00:00') });
    expect(buildUserPrompt('Is it out yet?', undefined, 65)).toBe(
      'Is it out yet?\n\n[Today: 2026-11-20. Current playback position: 01:05. Use it when I refer to "now", "this part" or "what was just said".]',
    );
    expect(buildUserPrompt('Hi')).toBe('Hi\n\n[Today: 2026-11-20.]');
  });
});
