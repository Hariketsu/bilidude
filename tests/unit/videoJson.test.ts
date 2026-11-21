import { describe, expect, it } from 'vitest';
import { toVideoJson } from '@/lib/export/videoJson';
import type { Transcript, VideoRef } from '@/lib/types';

const video: VideoRef = {
  bvid: 'BV1',
  aid: 1,
  cid: 2,
  p: 1,
  title: 'Title',
  upName: 'Uploader',
  desc: '00:00 Intro',
  coverUrl: '',
  durationSec: 3725,
};

const transcript: Transcript = {
  source: 'asr',
  lang: 'zh',
  lines: [{ from: 0, to: 12, text: 'merged line' }],
  cues: [
    { from: 0, to: 5, text: 'merged' },
    { from: 5, to: 12, text: 'line' },
  ],
  chapters: [{ from: 0, title: 'Intro' }],
  approximateTimes: true,
};

describe('toVideoJson', () => {
  it('holds the video and the transcript as the model receives them, without the download cues', () => {
    const { cues: _, ...expected } = transcript;
    expect(JSON.parse(toVideoJson(video, transcript))).toEqual({ video, transcript: expected });
  });
});
