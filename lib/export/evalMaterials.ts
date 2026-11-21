import type { Transcript, VideoRef } from '../types';

/** What the prompt is built from: the video and its merged transcript (see docs/PROMPT-EVAL.md). */
export interface EvalMaterial {
  video: VideoRef;
  transcript: Omit<Transcript, 'cues'>;
}

/** `transcripts` as from `loadTranscripts`, keyed `bvid:cid`. Each video with its transcript; videos without one (not transcribed yet) are listed in `missing`. */
export function toEvalMaterials(videos: VideoRef[], transcripts: Map<string, Transcript | null>) {
  const materials: EvalMaterial[] = [];
  const missing: VideoRef[] = [];
  for (const video of videos) {
    const transcript = transcripts.get(`${video.bvid}:${video.cid}`);
    if (!transcript) {
      missing.push(video);
      continue;
    }
    // Cues are the unmerged lines kept for subtitle downloads; the model never sees them.
    const { cues: _, ...rest } = transcript;
    materials.push({ video, transcript: rest });
  }
  return { materials, missing };
}
