import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchStep } from '@/lib/llm/search';

/** The web searches behind an answer: each query, then the pages it found as links. */
export function SearchSteps({ searches }: { searches: SearchStep[] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 text-[15px]">
      {searches.map((step) => {
        const query = step.queries.join(' · ');
        return (
          <div key={step.id} data-testid="search-step" className="space-y-2">
            <div className={`flex items-center gap-2 font-medium text-fg-muted ${step.status === 'running' ? 'shimmer-text' : ''}`}>
              <Globe className="size-[18px] shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 truncate">{t(`answer.search.${step.status}`, { query })}</span>
            </div>
            {step.sources.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 pl-7">
                {step.sources.map((source) => (
                  <li key={source.url} className="max-w-full">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      title={source.siteName ? `${source.siteName} · ${source.url}` : source.url}
                      className="block max-w-56 truncate rounded-full bg-surface-raised px-2.5 py-1 text-sm text-fg-muted hover:text-fg"
                    >
                      {source.title || source.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
