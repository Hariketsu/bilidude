import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SearchSource } from '@/lib/search/client';
import { IconButton } from './IconButton';
import { SiteIcons } from './SiteIcon';
import { SourceCard } from './SourceCard';

/** The pages a search found, over the whole panel like settings and history. */
export function SearchResults({ sources, onClose }: { sources: SearchSource[]; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-testid="search-results" className="absolute inset-0 z-10 flex flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3">
        <IconButton icon={ArrowLeft} label={t('common.back')} onClick={onClose} />
        <h1 className="text-[15px] font-semibold">{t('answer.searchResults')}</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-2 pb-6">
        {sources.map((source) => (
          <SourceCard key={source.url} source={source} className="rounded-xl p-3 transition-colors hover:bg-fill-hover" />
        ))}
      </div>
    </div>
  );
}

/** Under an answer: every page its searches found, opening the results. */
export function SourcesPill({ sources, onOpen }: { sources: SearchSource[]; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-testid="answer-sources"
      onClick={onOpen}
      className="mt-4 flex items-center gap-2 rounded-full border border-border bg-bg py-1 pr-2.5 pl-1 text-sm text-fg transition-colors hover:bg-fill-hover"
    >
      <SiteIcons pages={sources} />
      {t('answer.webPages', { count: sources.length })}
    </button>
  );
}
