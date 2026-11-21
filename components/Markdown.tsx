import { useMemo } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citations } from '@/lib/render/transcriptCheck';
import type { SearchSource } from '@/lib/search/client';
import { remarkCitations } from '@/lib/render/remark-citations';
import { remarkTimestamps } from '@/lib/render/remark-timestamps';
import { CitationChip } from './CitationChip';
import { TimestampChip } from './TimestampChip';

export function Markdown({
  text,
  citations,
  sources,
  onSeek,
}: {
  text: string;
  citations?: Citations;
  /** Web pages the text cites as `[n]`. */
  sources?: SearchSource[];
  onSeek?: (seconds: number) => void;
}) {
  const remarkPlugins = useMemo<Options['remarkPlugins']>(
    () => [remarkGfm, [remarkTimestamps, { citations }], [remarkCitations, { count: sources?.length ?? 0 }]],
    [citations, sources?.length],
  );
  const components = {
    h1: ({ children }) => <h1 className="mt-2 mb-3 text-[22px] leading-snug font-bold">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-7 mb-2 text-lg leading-snug font-bold">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-bold">{children}</h3>,
    // Models use single newlines as line breaks (a TOC chip above its summary, a quote above its translation).
    p: ({ children }) => <p className="my-3 whitespace-pre-line">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-2 border-fg-muted/60 pl-5 text-fg-muted [&>p]:my-1">
        {children}
      </blockquote>
    ),
    strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
        {children}
      </a>
    ),
    // Like DeepSeek's chat demo: rules between rows only, scrolling sideways when the panel is too narrow.
    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-max border-collapse text-sm leading-[22px]">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="max-w-60 min-w-20 border-b border-fg-muted/30 px-3 py-2 text-left font-semibold first:pl-0 last:pr-0">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="max-w-60 min-w-20 border-b border-border px-3 py-2 align-top first:pl-0 last:pr-0">{children}</td>
    ),
    code: ({ children }) => <code className="rounded bg-surface px-1 py-0.5 text-[0.9em]">{children}</code>,
    // A blockquote whose text isn't in the transcript: shown as plain prose, not as the speaker's words.
    'bd-paraphrase': ({ children }: { children?: React.ReactNode }) => (
      <div data-paraphrase className="my-3 [&>p]:my-1">
        {children}
      </div>
    ),
    'bd-timestamp': ({ seconds }: { seconds?: string }) => <TimestampChip seconds={Number(seconds)} onSeek={onSeek} />,
    'bd-cite': ({ n }: { n?: string }) => <CitationChip n={Number(n)} source={sources![Number(n) - 1]!} />,
  } as Components; // `bd-timestamp` comes from remarkTimestamps, `bd-cite` from remarkCitations

  return (
    <div className="text-[15px] leading-7 text-fg">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
