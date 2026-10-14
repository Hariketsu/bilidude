import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkTimestamps } from '@/lib/remark-timestamps';
import { TimestampChip } from './TimestampChip';

export function Markdown({ text, onSeek }: { text: string; onSeek?: (seconds: number) => void }) {
  const components = {
    h1: ({ children }) => <h1 className="mt-2 mb-3 text-[22px] leading-snug font-bold">{children}</h1>,
    h2: ({ children }) => <h2 className="mt-7 mb-2 text-lg leading-snug font-bold">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-6 mb-2 text-base font-bold">{children}</h3>,
    p: ({ children }) => <p className="my-3">{children}</p>,
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
    code: ({ children }) => <code className="rounded bg-surface px-1 py-0.5 text-[0.9em]">{children}</code>,
    'bd-timestamp': ({ seconds }: { seconds?: string }) => <TimestampChip seconds={Number(seconds)} onSeek={onSeek} />,
  } as Components; // `bd-timestamp` comes from remarkTimestamps

  return (
    <div className="text-[15px] leading-7 text-fg">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkTimestamps]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
