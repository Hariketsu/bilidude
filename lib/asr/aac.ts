// Extracts AAC frames from Bilibili's DASH audio (fragmented MP4) as ADTS, a format
// that can be cut at any frame, sent as-is (`aac`) or decoded by Chrome.
// Box parsing follows BiliScript's asr/adts.ts (MIT): https://github.com/Edmund724/BiliScript

/** One AAC frame holds 1024 samples per channel. */
const SAMPLES_PER_FRAME = 1024;
const SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

export interface AacTrack {
  sampleRate: number;
  /** Each frame with its 7-byte ADTS header. */
  frames: Uint8Array[];
}

export interface AacChunk {
  index: number;
  startSec: number;
  durationSec: number;
  frames: Uint8Array[];
}

const readU32 = (u8: Uint8Array, p: number) => ((u8[p]! << 24) | (u8[p + 1]! << 16) | (u8[p + 2]! << 8) | u8[p + 3]!) >>> 0;
const readType = (u8: Uint8Array, p: number) => String.fromCharCode(u8[p]!, u8[p + 1]!, u8[p + 2]!, u8[p + 3]!);

/** Calls `visit` for each box in [start, end). */
function eachBox(u8: Uint8Array, start: number, end: number, visit: (type: string, at: number, size: number) => void) {
  for (let p = start; p + 8 <= end; ) {
    const size = readU32(u8, p);
    if (size < 8 || p + size > end) return;
    visit(readType(u8, p + 4), p, size);
    p += size;
  }
}

/** AAC profile / sample-rate index / channel config from moov's esds box. */
function findAudioConfig(u8: Uint8Array): { profile: number; freqIdx: number; channels: number } | null {
  // Containers on the way to esds; mp4a has 28 bytes of fields and stsd 8 before their children.
  const childOffset: Record<string, number> = { moov: 8, trak: 8, mdia: 8, minf: 8, stbl: 8, stsd: 16, mp4a: 36 };
  let result: ReturnType<typeof findAudioConfig> = null;
  const search = (start: number, end: number) =>
    eachBox(u8, start, end, (type, at, size) => {
      if (result) return;
      if (type === 'esds') {
        result = parseEsds(u8, at + 12, at + size); // after the full-box version/flags
      } else if (type in childOffset) {
        search(at + childOffset[type]!, at + size);
      }
    });
  search(0, u8.length);
  return result;
}

/** An MPEG-4 descriptor: 1-byte tag, then a size of up to four 7-bit groups. */
function readDescriptor(u8: Uint8Array, p: number) {
  const tag = u8[p++]!;
  let size = 0;
  for (let i = 0; i < 4; i++) {
    const byte = u8[p++]!;
    size = (size << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) break;
  }
  return { tag, start: p, end: p + size };
}

/** ES_Descriptor → DecoderConfigDescriptor → DecoderSpecificInfo (AudioSpecificConfig). */
function parseEsds(u8: Uint8Array, start: number, end: number) {
  const es = readDescriptor(u8, start);
  if (es.tag !== 0x03 || es.end > end) return null;
  const esFlags = u8[es.start + 2]!;
  let p = es.start + 3;
  if (esFlags & 0x80) p += 2; // dependsOn_ES_ID
  if (esFlags & 0x40) p += 1 + u8[p]!; // URL
  if (esFlags & 0x20) p += 2; // OCR_ES_ID
  const decoderConfig = readDescriptor(u8, p);
  if (decoderConfig.tag !== 0x04) return null;
  const specific = readDescriptor(u8, decoderConfig.start + 13); // objectType, streamType, buffer and bitrates
  if (specific.tag !== 0x05 || specific.end - specific.start < 2) return null;
  const b0 = u8[specific.start]!;
  const b1 = u8[specific.start + 1]!;
  return { profile: (b0 >> 3) - 1, freqIdx: ((b0 & 7) << 1) | (b1 >> 7), channels: (b1 >> 3) & 0xf };
}

/** Sample sizes listed by the trun boxes of one moof. */
function sampleSizes(u8: Uint8Array, moofAt: number, moofSize: number): number[] {
  const sizes: number[] = [];
  eachBox(u8, moofAt + 8, moofAt + moofSize, (type, trafAt, trafSize) => {
    if (type !== 'traf') return;
    eachBox(u8, trafAt + 8, trafAt + trafSize, (inner, at) => {
      if (inner !== 'trun') return;
      const flags = (u8[at + 9]! << 16) | (u8[at + 10]! << 8) | u8[at + 11]!;
      const count = readU32(u8, at + 12);
      let p = at + 16 + (flags & 0x1 ? 4 : 0) + (flags & 0x4 ? 4 : 0);
      for (let i = 0; i < count; i++) {
        if (flags & 0x100) p += 4; // duration
        if (!(flags & 0x200)) return; // sizes not listed per sample
        sizes.push(readU32(u8, p));
        p += 4;
        if (flags & 0x400) p += 4; // flags
        if (flags & 0x800) p += 4; // composition offset
      }
    });
  });
  return sizes;
}

export function extractAac(mp4: Uint8Array): AacTrack {
  const config = findAudioConfig(mp4) ?? { profile: 1, freqIdx: 3, channels: 2 }; // AAC-LC 48kHz stereo
  const { profile, freqIdx, channels } = config;
  const frames: Uint8Array[] = [];
  let pending: number[] = [];

  eachBox(mp4, 0, mp4.length, (type, at, size) => {
    if (type === 'moof') pending = sampleSizes(mp4, at, size);
    if (type !== 'mdat') return;
    let p = at + 8;
    for (const sampleSize of pending) {
      if (p + sampleSize > at + size) break;
      const length = sampleSize + 7;
      const frame = new Uint8Array(length);
      // ADTS header: MPEG-4, no CRC (ISO/IEC 13818-7).
      frame.set([
        0xff,
        0xf1,
        ((profile & 3) << 6) | ((freqIdx & 0xf) << 2) | ((channels >> 2) & 1),
        ((channels & 3) << 6) | ((length >> 11) & 3),
        (length >> 3) & 0xff,
        ((length & 7) << 5) | 0x1f,
        0xfc,
      ]);
      frame.set(mp4.subarray(p, p + sampleSize), 7);
      frames.push(frame);
      p += sampleSize;
    }
    pending = [];
  });

  if (frames.length === 0) throw new Error('No AAC audio found in the downloaded track');
  return { sampleRate: SAMPLE_RATES[freqIdx] ?? 48000, frames };
}

export function splitAac(track: AacTrack, chunkSeconds: number): AacChunk[] {
  const frameSeconds = SAMPLES_PER_FRAME / track.sampleRate;
  const perChunk = Math.max(1, Math.floor(chunkSeconds / frameSeconds));
  const chunks: AacChunk[] = [];
  for (let i = 0; i < track.frames.length; i += perChunk) {
    const frames = track.frames.slice(i, i + perChunk);
    chunks.push({ index: chunks.length, startSec: i * frameSeconds, durationSec: frames.length * frameSeconds, frames });
  }
  return chunks;
}

export function concatFrames(frames: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(frames.reduce((sum, f) => sum + f.length, 0));
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}
