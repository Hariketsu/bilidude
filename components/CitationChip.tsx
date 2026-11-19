import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SearchSource } from '@/lib/llm/search';
import { SourceCard } from './SourceCard';

const ENTER_DELAY = 300;
const LEAVE_DELAY = 100;
const GAP = 6;
const MARGIN = 12;

/** `[3]` in an answer: a small numbered tag; hovering previews the page, clicking opens it. */
export function CitationChip({ n, source }: { n: number; source: SearchSource }) {
  const anchor = useRef<HTMLAnchorElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<number>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>();

  const schedule = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), delay);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Below the tag, or above it when there is no room; as wide as the panel allows.
  useLayoutEffect(() => {
    if (!open) return setPosition(undefined);
    const rect = anchor.current!.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 2 * MARGIN);
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, MARGIN), window.innerWidth - width - MARGIN);
    const height = card.current?.offsetHeight ?? 0;
    const below = rect.bottom + GAP;
    const top = below + height > window.innerHeight - MARGIN ? Math.max(MARGIN, rect.top - GAP - height) : below;
    setPosition({ top, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    return () => window.removeEventListener('scroll', close, true);
  }, [open]);

  return (
    <>
      <a
        ref={anchor}
        href={source.url}
        target="_blank"
        rel="noreferrer"
        data-citation={n}
        aria-label={source.title}
        onMouseEnter={() => schedule(true, ENTER_DELAY)}
        onMouseLeave={() => schedule(false, LEAVE_DELAY)}
        className="relative -top-[5px] mx-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-[6px_6px_6px_0] bg-surface-raised px-1 font-mono text-[9px] leading-none font-medium text-fg-muted tabular-nums shadow-[inset_0_0_0_0.5px_var(--bd-hairline)] transition-colors select-none hover:bg-fill-hover hover:text-fg [&+&]:ml-0"
      >
        {n}
      </a>
      {open &&
        createPortal(
          <div
            ref={card}
            data-testid="citation-card"
            style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
            onMouseEnter={() => window.clearTimeout(timer.current)}
            onMouseLeave={() => schedule(false, LEAVE_DELAY)}
            className="fixed z-50 rounded-xl border border-border bg-surface p-4 shadow-lg"
          >
            <SourceCard source={source} />
          </div>,
          document.body,
        )}
    </>
  );
}
