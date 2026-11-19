import { Link } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { SearchSource } from '@/lib/llm/search';

/**
 * The site's icon: a grey placeholder while it loads, a link icon when there is none or it
 * fails (DeepSeek only has icons for big sites).
 */
export function SiteIcon({ src, className = 'size-4' }: { src?: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>(src ? 'loading' : 'failed');
  return (
    <span className={`relative inline-flex shrink-0 overflow-hidden rounded-full bg-surface-raised ${className}`}>
      {state === 'failed' ? (
        <Link className="m-auto size-[60%] text-fg-muted" strokeWidth={2} />
      ) : (
        <img
          src={src}
          alt=""
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={`size-full object-cover transition-opacity ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </span>
  );
}

/** Up to four site icons, overlapping; `lead` goes first (the video, in a collapsed timeline). */
export function SiteIcons({ pages, lead }: { pages: SearchSource[]; lead?: ReactNode }) {
  const icons = pages.filter((p, i) => pages.findIndex((q) => (q.siteIcon ?? q.url) === (p.siteIcon ?? p.url)) === i);
  const ring = 'ring-[1.5px] ring-bg';
  return (
    <span className="inline-flex shrink-0 -space-x-1">
      {lead && <span className={`inline-flex size-4 rounded-full ${ring}`}>{lead}</span>}
      {icons.slice(0, lead ? 3 : 4).map((page) => (
        <SiteIcon key={page.url} src={page.siteIcon} className={`size-4 ${ring}`} />
      ))}
    </span>
  );
}
