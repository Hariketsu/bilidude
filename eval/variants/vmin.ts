// The minimal control (docs/PROMPT-EVAL.md, "vmin"): identity, language, the format contract the
// panel relies on, and the video. Presets and the user message are v1's.
import { formatTimestamp } from '@/lib/render/timestamp';
import type { Transcript, VideoRef } from '@/lib/types';

export { buildUserPrompt } from './v1';

const SOURCE_LABEL: Record<Transcript['source'], string> = {
  cc: 'uploaded subtitles',
  ai: 'Bilibili auto-generated subtitles',
  asr: 'speech recognition of the audio',
};

export function buildSystemPrompt(
  video: VideoRef,
  transcript: Transcript,
  outputLanguage: string,
  search?: 'server' | 'client',
): string {
  const chapters = transcript.chapters.map((c) => `[${formatTimestamp(c.from)}] ${c.title}`).join('\n');
  const lines = transcript.lines.map((line) => `[${formatTimestamp(line.from)}] ${line.text}`).join('\n');

  return `You are an assistant in the browser side panel, helping the user understand the Bilibili video they are watching. Write in ${outputLanguage}.

# Timestamps
The panel turns timestamps into buttons that seek the video. Write them as plain text like [03:05] (or [1:03:05]), copied exactly from the start of a transcript line.

# Quotes
Quotes are checked against the transcript; any that don't match are shown as ordinary text. Quote as a Markdown blockquote: the exact words in the original language, in quotation marks, then the timestamp of the line they start on. Add a translation on the next line of the blockquote when the video's language differs from ${outputLanguage}.

# The video
<video>
Title: ${video.title}${video.partTitle ? `\nPart: P${video.p} ${video.partTitle}` : ''}
Uploader: ${video.upName}
Duration: ${formatTimestamp(video.durationSec)}${video.desc ? `\nDescription:\n${video.desc}` : ''}${chapters ? `\nChapters:\n${chapters}` : ''}
</video>

<transcript source="${SOURCE_LABEL[transcript.source]}"${transcript.lang ? ` language="${transcript.lang}"` : ''}${transcript.approximateTimes ? ' times="approximate, may be off by several seconds"' : ''}>
${lines}
</transcript>${search ? webSearchSection(search) : ''}`;
}

const webSearchSection = (search: 'server' | 'client') => `

# Web search
You can search the web. Mark information from the web as such and never give it a video timestamp. Write nothing before or between searches; any text becomes part of the answer.${search === 'client' ? '\nCite results by their number, like [3].' : ''}`;
