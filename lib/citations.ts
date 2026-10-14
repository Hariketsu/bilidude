import type { Transcript } from './types';

/** How far past the video end a timestamp may point before it is dropped. */
const END_TOLERANCE_SECONDS = 1;
/** Transcript lines around a quote's timestamp searched for its text; quotes may run on past their start. */
const QUOTE_LINES_BEFORE = 2;
const QUOTE_LINES_AFTER = 4;

export interface Citations {
  /** Snaps a cited time to the start of its transcript line; null drops the citation. */
  resolveTime(seconds: number): number | null;
  /** Whether a quote cited at `seconds` appears verbatim around that point. */
  isVerbatim(quote: string, seconds: number): boolean;
}

/** Strips everything but letters and digits so punctuation and spacing differences don't matter. */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function lineIndexAt(transcript: Transcript, seconds: number): number {
  let index = -1;
  for (const [i, line] of transcript.lines.entries()) {
    if (line.from > seconds) break;
    index = i;
  }
  return index;
}

export function createCitations(transcript: Transcript, durationSec: number): Citations {
  const { lines } = transcript;
  return {
    resolveTime(seconds) {
      if (seconds > durationSec + END_TOLERANCE_SECONDS) return null;
      // Times before the first line still point at the start of the transcript.
      const index = Math.max(0, lineIndexAt(transcript, seconds));
      const line = lines[index];
      return line ? Math.floor(line.from) : null;
    },
    isVerbatim(quote, seconds) {
      const index = lineIndexAt(transcript, seconds);
      if (index < 0) return false;
      const window = normalize(
        lines
          .slice(Math.max(0, index - QUOTE_LINES_BEFORE), index + QUOTE_LINES_AFTER + 1)
          .map((line) => line.text)
          .join(''),
      );
      // An ellipsis marks omitted words; each remaining fragment must appear in order.
      let from = 0;
      for (const fragment of quote.split(/…|\.\.\./).map(normalize).filter(Boolean)) {
        const at = window.indexOf(fragment, from);
        if (at < 0) return false;
        from = at + fragment.length;
      }
      return from > 0;
    },
  };
}
