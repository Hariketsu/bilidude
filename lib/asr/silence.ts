// Picks where to cut the audio for speech recognition: in a pause rather than mid-word.
// Measured on real videos (docs/DESIGN.md §6), talks almost always have a clear pause
// within the search window; with background music the quietest moment is usually still
// a gap between sentences.

import { concatFrames, SAMPLES_PER_FRAME, type AacTrack } from './aac';

const RATE = 16_000;
/** Loudness is measured in 20 ms steps… */
const STEP_SAMPLES = RATE / 50;
/** …averaged over 300 ms, about the shortest pause between sentences. */
const PAUSE_STEPS = 15;
/** How far before a chunk's length limit to look for a pause. */
const MAX_SEARCH_SECONDS = 30;
/** A decoded slice starts and ends with codec priming that reads as silence; skip it. */
const EDGE_STEPS = 13;

/**
 * Frame indices where each chunk after the first begins. Chunks never exceed
 * `chunkSeconds` (a provider limit): each cut is the quietest moment within the
 * last stretch before that limit.
 */
export async function planCuts(track: AacTrack, chunkSeconds: number): Promise<number[]> {
  const frameSeconds = SAMPLES_PER_FRAME / track.sampleRate;
  const perChunk = Math.max(1, Math.floor(chunkSeconds / frameSeconds));
  // A quarter of the chunk at most, so every chunk still moves well forward.
  const searchFrames = Math.floor(Math.min(MAX_SEARCH_SECONDS, chunkSeconds / 4) / frameSeconds);
  const cuts: number[] = [];
  for (let start = 0; start + perChunk < track.frames.length; ) {
    const limit = start + perChunk;
    const from = limit - searchFrames;
    const cut = from + (await quietestFrame(track.frames.slice(from, limit), frameSeconds));
    cuts.push(cut);
    start = cut;
  }
  return cuts;
}

/** Offset (in AAC frames) of the middle of the quietest 300 ms in `frames`; its end if it can't be decoded. */
async function quietestFrame(frames: Uint8Array[], frameSeconds: number): Promise<number> {
  let buffer: AudioBuffer;
  try {
    buffer = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(concatFrames(frames).buffer as ArrayBuffer);
  } catch {
    return frames.length;
  }
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const steps = Math.floor(buffer.length / STEP_SAMPLES);
  const energy = new Float64Array(steps);
  for (let i = 0; i < steps; i++) {
    let sum = 0;
    for (const channel of channels) {
      for (let s = i * STEP_SAMPLES; s < (i + 1) * STEP_SAMPLES; s++) sum += channel[s]! * channel[s]!;
    }
    energy[i] = sum;
  }

  let best = -1;
  let bestEnergy = Infinity;
  let window = 0;
  for (let i = 0; i < steps; i++) {
    window += energy[i]!;
    if (i >= PAUSE_STEPS) window -= energy[i - PAUSE_STEPS]!;
    const start = i - PAUSE_STEPS + 1;
    if (start < EDGE_STEPS || i >= steps - EDGE_STEPS) continue;
    if (window < bestEnergy) {
      bestEnergy = window;
      best = start;
    }
  }
  if (best < 0) return frames.length;
  const seconds = (best + PAUSE_STEPS / 2) * (STEP_SAMPLES / RATE);
  return Math.min(frames.length, Math.max(1, Math.round(seconds / frameSeconds)));
}
