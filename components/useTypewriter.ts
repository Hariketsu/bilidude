import { useEffect, useRef, useState } from 'react';

/** Slowest reveal pace, in characters per frame (≈60 per second). */
const MIN_CHARS_PER_FRAME = 1;
/** A backlog is worked off over about this many frames, so the text never lags far behind. */
const CATCH_UP_FRAMES = 30;

/**
 * The part of `text` to show while it streams in. Providers deliver text in bursts
 * (DeepSeek writes a whole answer in under two seconds after thinking), so it is
 * revealed at a steady pace that speeds up when far behind. Text that is already
 * complete when first rendered, like a restored conversation, shows at once.
 */
export function useTypewriter(text: string, streaming: boolean): string {
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const lengthRef = useRef(text.length);
  lengthRef.current = text.length;

  useEffect(() => {
    if (shown >= text.length) return;
    const frame = requestAnimationFrame(() =>
      setShown((n) => Math.min(lengthRef.current, n + Math.max(MIN_CHARS_PER_FRAME, Math.ceil((lengthRef.current - n) / CATCH_UP_FRAMES)))),
    );
    return () => cancelAnimationFrame(frame);
  }, [shown, text.length]);

  let end = Math.min(shown, text.length);
  // Don't split a surrogate pair (emoji and rare CJK characters).
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? '')) end++;
  return end >= text.length ? text : text.slice(0, end);
}
