// Matches `[03:05]` / `[1:03:05]` as written by the model (see docs/DESIGN.md §9).
export const TIMESTAMP_PATTERN = /\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]/g;

// An unclosed timestamp at the end of a streaming chunk, e.g. `[03:0`.
const PARTIAL_TIMESTAMP_TAIL = /\[[\d:]{0,7}$/;

export function parseTimestamp(hours: string | undefined, minutes: string, seconds: string): number {
  return Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
}

/** `65` → `01:05`, `3725` → `1:02:05`. */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Hides a half-streamed timestamp so it never flashes as raw text. */
export function trimPartialTimestamp(text: string): string {
  return text.replace(PARTIAL_TIMESTAMP_TAIL, '');
}
