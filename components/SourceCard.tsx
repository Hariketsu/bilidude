import type { SearchSource } from '@/lib/search/client';
import { SiteIcon } from './SiteIcon';

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** YYYY/MM/DD in local time; anything unparsable is left out. */
function formatDate(value?: string): string | undefined {
  const date = value ? new Date(value) : undefined;
  if (!date || Number.isNaN(date.getTime())) return;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** A search result: site, date, title and snippet, linking to the page. */
export function SourceCard({ source, className = '' }: { source: SearchSource; className?: string }) {
  const date = formatDate(source.publishedAt);
  return (
    <a href={source.url} target="_blank" rel="noreferrer" data-testid="source-card" className={`block ${className}`}>
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg-muted">
        <SiteIcon src={source.siteIcon} className="size-[18px]" />
        <span className="truncate">{source.siteName || hostOf(source.url)}</span>
        {date && (
          <>
            <span className="mx-0.5 h-3 w-px shrink-0 bg-fg-muted/40" />
            <span className="shrink-0 tabular-nums">{date}</span>
          </>
        )}
      </div>
      <div className="mt-1.5 line-clamp-2 text-sm leading-[22px] font-medium text-fg">{source.title}</div>
      {source.snippet && <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-fg-muted">{source.snippet}</div>}
    </a>
  );
}
