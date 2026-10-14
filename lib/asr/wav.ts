import { concatFrames } from './aac';

const TARGET_RATE = 16_000;
/** Chrome fails to decode long ADTS streams; ~40s pieces decode reliably (see BiliScript). */
const FRAMES_PER_DECODE = 2000;

/** Decodes ADTS frames to 16kHz mono and encodes them as 16-bit PCM WAV. */
export async function aacToWav(frames: Uint8Array[]): Promise<Blob> {
  const pieces: Float32Array[] = [];
  for (let i = 0; i < frames.length; i += FRAMES_PER_DECODE) {
    const bytes = concatFrames(frames.slice(i, i + FRAMES_PER_DECODE));
    // An OfflineAudioContext decodes straight to its own sample rate.
    const buffer = await new OfflineAudioContext(1, 1, TARGET_RATE).decodeAudioData(bytes.buffer as ArrayBuffer);
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const channel = buffer.getChannelData(c);
      for (let s = 0; s < channel.length; s++) mono[s]! += channel[s]! / buffer.numberOfChannels;
    }
    pieces.push(mono);
  }
  return encodeWav(pieces, TARGET_RATE);
}

function encodeWav(pieces: Float32Array[], sampleRate: number): Blob {
  const samples = pieces.reduce((sum, p) => sum + p.length, 0);
  const view = new DataView(new ArrayBuffer(44 + samples * 2));
  const ascii = (offset: number, text: string) => [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  let offset = 44;
  for (const piece of pieces) {
    for (const sample of piece) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
