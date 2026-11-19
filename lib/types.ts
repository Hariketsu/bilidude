import type { AssistantMessage as PiAssistantMessage, Message as PiMessage } from '@earendil-works/pi-ai';
import type { SearchSource, SearchStep } from './llm/search';
import type { AsrProgress } from './asr/transcribe';

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
  /** Uploaded subtitles, Bilibili's AI subtitles, or our own speech recognition. */
  source: 'cc' | 'ai' | 'asr';
  lang: string;
  lines: TranscriptLine[];
  /**
   * The original subtitle lines (or recognized sentences), unmerged, for subtitle downloads.
   * Missing from transcripts cached before downloads existed.
   */
  cues?: TranscriptLine[];
  /** Official chapters, or the author's timeline from the description. */
  chapters: Chapter[];
  /** Line times were estimated (the ASR provider returned text without timestamps). */
  approximateTimes?: boolean;
}

export type PresetId = 'recap' | 'toc' | 'quotes';

/** Progress shown above an answer while it is being produced. */
export type AnswerPhase = 'reading' | 'transcribing' | 'thinking' | 'writing';

export type UserMessage = {
  id: string;
  role: 'user';
  /** Attached to the first message of a session. */
  video?: VideoRef;
  preset?: PresetId;
  text: string;
  /** Exactly what the model received for this turn (preset instructions, playback position). */
  prompt: string;
};

export type AssistantMessage = {
  id: string;
  role: 'assistant';
  video: VideoRef;
  status: 'streaming' | 'done' | 'aborted' | 'error';
  phase?: AnswerPhase;
  /** While transcribing a video without subtitles. */
  asrProgress?: AsrProgress;
  text: string;
  thinking?: string;
  thoughtMs?: number;
  error?: string;
  /** The original error behind a friendly `error`, shown on request. */
  errorDetail?: string;
  /** Web searches made while answering, in order. */
  searches?: SearchStep[];
  /** Pages the answer cites (DeepSeek's server-side search). */
  sources?: SearchSource[];
  /** The provider's messages for this answer (assistant turns and tool results), replayed as history in later turns. */
  llmMessages?: PiMessage[];
  /** Sessions before 0.4.0 stored the single assistant message here. */
  llm?: PiAssistantMessage;
};

export type Message = UserMessage | AssistantMessage;

/** Whether a video has subtitles, will have its audio transcribed, or can't be asked about. */
export type SubtitleAvailability = 'ready' | 'transcribe' | 'off';

/** A video's subtitles as its attachment card shows them; `undefined` while still checking. */
export type SubtitleStatus = SubtitleAvailability | { progress: AsrProgress } | undefined;
