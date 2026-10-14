export interface VideoRef {
  bvid: string;
  aid: number;
  cid: number;
  /** 1-based part number. */
  p: number;
  title: string;
  /** Title of the current part, for multi-part videos. */
  partTitle?: string;
  upName: string;
  desc: string;
  coverUrl: string;
  durationSec: number;
}

export interface TranscriptLine {
  from: number;
  to: number;
  text: string;
}

export interface Chapter {
  from: number;
  title: string;
}

export interface Transcript {
  source: 'cc' | 'ai';
  lang: string;
  lines: TranscriptLine[];
  /** Official chapters, or the author's timeline from the description. */
  chapters: Chapter[];
}

export type PresetId = 'recap' | 'toc' | 'quotes';

/** Progress shown above an answer while it is being produced. */
export type AnswerPhase = 'reading' | 'transcribing' | 'thinking' | 'writing';

export type Message =
  | { id: string; role: 'user'; video?: VideoRef; preset?: PresetId; text: string }
  | {
      id: string;
      role: 'assistant';
      text: string;
      status: 'streaming' | 'done' | 'aborted' | 'error';
      phase?: AnswerPhase;
      thoughtMs?: number;
      video: VideoRef;
    };
