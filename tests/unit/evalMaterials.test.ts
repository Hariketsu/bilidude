import { describe, expect, it } from 'vitest';
import { toEvalMaterials } from '@/lib/export/evalMaterials';
import type { Transcript, VideoRef } from '@/lib/types';

const video = (bvid: string): VideoRef => ({
  bvid,
  aid: 1,
  cid: 2,
  p: 1,
  title: `Title ${bvid}`,
  upName: 'Uploader',
  desc: '00:00 Intro',
  coverUrl: '',
  durationSec: 3725,
});

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

describe('toEvalMaterials', () => {
  it('keeps the video and the transcript as the model receives them, without the download cues', () => {
    const { materials } = toEvalMaterials([video('BV1')], new Map([['BV1:2', transcript]]));
    const { cues: _, ...expected } = transcript;
    expect(materials).toEqual([{ video: video('BV1'), transcript: expected }]);
  });

  it('lists videos without a transcript instead of exporting them', () => {
    const { materials, missing } = toEvalMaterials(
      [video('BV1'), video('BV2')],
      new Map([
        ['BV1:2', transcript],
        ['BV2:2', null],
      ]),
    );
    expect(materials.map((m) => m.video.bvid)).toEqual(['BV1']);
    expect(missing.map((v) => v.bvid)).toEqual(['BV2']);
  });
});
