import { ChevronRight, Globe } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchSource, SearchStep } from '@/lib/llm/search';

/** The web searches behind an answer: each query, with the pages it found folded underneath. */
export function SearchSteps({ searches }: { searches: SearchStep[] }) {
  return (
    <div className="space-y-3 text-[15px]">
      {searches.map((step) => (
        <SearchStepRow key={step.id} step={step} />
      ))}
    </div>
  );
}

function SearchStepRow({ step }: { step: SearchStep }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const query = step.queries.join(' · ');
  const count = step.sources.length;
  return (
    <div data-testid="search-step" className="space-y-2">
      <button
        type="button"
        disabled={count === 0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex w-full min-w-0 items-center gap-2 text-left font-medium text-fg-muted enabled:hover:text-fg ${step.status === 'running' ? 'shimmer-text' : ''}`}
      >
        <Globe className="size-[18px] shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 truncate">{t(`answer.search.${step.status}`, { query })}</span>
        {count > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-sm font-normal">
            {t('answer.search.results', { count })}
            <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
          </span>
        )}
      </button>
      {open && (
        <ul className="flex flex-wrap gap-1.5 pl-7">
          {step.sources.map((source) => (
            <li key={source.url} className="max-w-full">
              <SourceLink source={source} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The pages an answer cites, listed after it. */
export function AnswerSources({ sources }: { sources: SearchSource[] }) {
  const { t } = useTranslation();
  return (
    <div data-testid="answer-sources" className="mt-4">
      <div className="mb-2 text-sm font-medium text-fg-muted">{t('answer.sources')}</div>
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <li key={source.url} className="max-w-full">
            <SourceLink source={source} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceLink({ source }: { source: SearchSource }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={source.siteName ? `${source.siteName} · ${source.url}` : source.url}
      className="block max-w-56 truncate rounded-full bg-surface-raised px-2.5 py-1 text-sm text-fg-muted hover:text-fg"
    >
      {source.title || source.url}
    </a>
  );
}
