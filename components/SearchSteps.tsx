import { ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchSource, SearchStep } from '@/lib/llm/search';
import type { CitedSource } from '@/lib/sources';

/** The web searches behind an answer, as one line ("Read 13 web pages"); each query and its pages unfold underneath. */
export function SearchSteps({ searches }: { searches: SearchStep[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const running = searches.find((step) => step.status === 'running');
  const pages = uniquePages(searches.flatMap((step) => step.sources));
  const label = running
    ? t('answer.search.running', { query: running.queries.join(' · ') })
    : pages.length
      ? t('answer.search.read', { count: pages.length })
      : t('answer.search.failed', { query: searches.flatMap((step) => step.queries).join(' · ') });

  return (
    <div data-testid="search-step" className="text-[15px]">
      <button
        type="button"
        disabled={!pages.length}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`group flex max-w-full min-w-0 items-center gap-2 text-left font-medium text-fg-muted enabled:hover:text-fg ${running ? 'shimmer-text' : ''}`}
      >
        <Search className="size-[18px] shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 truncate">{label}</span>
        {pages.length > 0 && <SiteIcons pages={pages} />}
        {pages.length > 0 && <ChevronRight className={`size-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />}
      </button>
      {open && (
        <div className="mt-2 space-y-3 border-l-2 border-border pl-4">
          {searches.map((step) => (
            <div key={step.id} className="space-y-1">
              <div className="truncate text-sm text-fg-muted">{step.queries.map((q) => `“${q}”`).join(' ')}</div>
              <ul>
                {step.sources.map((source, i) => (
                  <li key={`${source.url}-${i}`}>
                    <SourceRow source={source} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The pages an answer cites, folded into a pill under it; unfolded, they keep the numbers used in the text. */
export function AnswerSources({ cited }: { cited: CitedSource[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="answer-sources" className="mt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full border border-border py-1.5 pr-3.5 pl-2 text-sm text-fg-muted transition-colors hover:bg-fill-hover hover:text-fg"
      >
        <SiteIcons pages={cited.map(({ source }) => source)} />
        {t('answer.webPages', { count: cited.length })}
      </button>
      {open && (
        <ol className="mt-2">
          {cited.map(({ n, source }) => (
            <li key={n} className="flex items-center gap-1">
              <span className="w-5 shrink-0 text-right text-xs text-fg-muted tabular-nums">{n}</span>
              <SourceRow source={source} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** `[3]` in an answer: a small numbered chip that opens the page. */
export function CitationChip({ n, source }: { n: number; source: SearchSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      data-citation={n}
      title={[source.siteName, source.title].filter(Boolean).join(' · ')}
      className="mx-px inline-flex h-4 min-w-4 -translate-y-1 items-center justify-center rounded bg-surface-raised px-1 align-baseline text-[10px] leading-none text-fg-muted tabular-nums transition-colors hover:bg-fill-hover hover:text-fg"
    >
      {n}
    </a>
  );
}

function SourceRow({ source }: { source: SearchSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={source.url}
      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-fill-hover"
    >
      <SiteIcon source={source} />
      <span className="min-w-0 truncate text-fg">{source.title || source.url}</span>
      <span className="shrink-0 text-xs text-fg-muted">{source.siteName ?? hostOf(source.url)}</span>
    </a>
  );
}

/** Up to four site icons, overlapping. */
function SiteIcons({ pages }: { pages: SearchSource[] }) {
  const sites = uniqueBy(pages, (page) => page.siteIcon ?? hostOf(page.url)).slice(0, 4);
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {sites.map((page) => (
        <SiteIcon key={page.url} source={page} stacked />
      ))}
    </span>
  );
}

/**
 * The site's icon, or its initial on a colour picked from the host when there is none or it
 * fails to load (DeepSeek has icons for big sites only).
 */
function SiteIcon({ source, stacked }: { source: SearchSource; stacked?: boolean }) {
  const [broken, setBroken] = useState(false);
  const frame = `shrink-0 rounded-full ${stacked ? 'size-5 ring-2 ring-bg' : 'size-4'}`;
  if (source.siteIcon && !broken) {
    return <img src={source.siteIcon} alt="" loading="lazy" onError={() => setBroken(true)} className={`${frame} bg-white object-cover`} />;
  }
  const host = hostOf(source.url);
  const hue = [...host].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 0);
  return (
    <span
      style={{ backgroundColor: `hsl(${hue} 45% 55%)` }}
      className={`${frame} flex items-center justify-center font-semibold text-white ${stacked ? 'text-[10px]' : 'text-[9px]'}`}
    >
      {(source.siteName || host).charAt(0).toUpperCase()}
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(key(item)) && !!seen.add(key(item)));
}

const uniquePages = (pages: SearchSource[]) => uniqueBy(pages, (page) => page.url);
