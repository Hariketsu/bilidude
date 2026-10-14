/** Simplified bilibili TV glyph. */
export function BiliIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M7 3.5 9.5 6M17 3.5 14.5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="2.5" y="6" width="19" height="14" rx="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 11.5v2M16 11.5v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
