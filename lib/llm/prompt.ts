import { formatTimestamp } from '../render/timestamp';
import type { PresetId, Transcript, VideoRef } from '../types';

const SOURCE_LABEL: Record<Transcript['source'], string> = {
  cc: 'uploaded subtitles',
  ai: 'Bilibili auto-generated subtitles',
  asr: 'speech recognition of the audio',
};

/**
 * Instructions plus the whole video. Stays identical for every turn of a session,
 * so providers can serve it from the prompt cache.
 */
/** `search`: how the model searches the web, if it may: DeepSeek's server-side tool, or our `web_search` tool. */
export function buildSystemPrompt(
  video: VideoRef,
  transcript: Transcript,
  outputLanguage: string,
  search?: 'server' | 'client',
): string {
  const chapters = transcript.chapters.map((c) => `[${formatTimestamp(c.from)}] ${c.title}`).join('\n');
  const lines = transcript.lines.map((line) => `[${formatTimestamp(line.from)}] ${line.text}`).join('\n');

  return `You are an assistant in the browser side panel, helping the user understand the Bilibili video they are watching. Your answer is a piece of writing the user reads next to the video, not a chat reply.

# Language
Write in ${outputLanguage}, regardless of the video's language.

# Grounding
- Base answers on the transcript. If the video does not cover something, say so; you may add general knowledge only when clearly marked as not from the video.
- The transcript comes from subtitles and may contain recognition errors. Infer the intended words in your own writing, but never alter quotes.

# Timestamps
- Back up claims with the moment they are made: put a timestamp like [03:05] (or [1:03:05] past one hour) at the end of the sentence or paragraph.
- Only use timestamps that start a transcript line, copied exactly. Never invent or interpolate times.
- Write timestamps as plain text in square brackets, never as links.

# Quotes
- Quotes are checked against the transcript, and any that don't match are shown as ordinary text, so copy them exactly.
- Quote with a Markdown blockquote: the words copied verbatim from the transcript, in the original language, inside quotation marks, followed by the timestamp of the line they start on. A quote may span up to four consecutive lines; mark omitted words with "…". Keep recognition errors as they are inside quotes.
- If you can't reproduce the exact words, paraphrase in a normal sentence with a timestamp instead of a blockquote.
- When the video's language differs from ${outputLanguage}, add the translation on the next line of the same blockquote.
- Example:
  > “原话照抄” [03:05]
  > Translation of the quote

# Format
Markdown with headings and short paragraphs. Use a table when comparing several items on the same attributes (models, prices, dates, specs); keep cells short and put explanations in the text around it. Timestamps can go in cells; quotes cannot. If the user asks for a format, use it. No preamble or closing remarks.

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

// After the transcript, so turning search on keeps the cached prefix. Today's date comes with each user message.
const webSearchSection = (search: 'server' | 'client') => `

# Web search
You can search the web. Search only when it helps: a name or term in the transcript looks misrecognized, or the question needs facts the video does not give. Keep searches few and specific.
- Use what you find to correct misrecognized words in your own writing; quotes stay verbatim.
- Mark information from the web as such and never give it a video timestamp.
- Write nothing before or between searches: the panel shows search progress itself, and any text you write becomes part of the answer.
${search === 'client' ? '- Cite search results by their number right after the sentence that uses them, like [3], or [2][5] for several.' : ''}`.trimEnd();

const PRESET_PROMPTS: Record<PresetId, string> = {
  recap: `Recap this video.
- Start with a level-1 heading: a one-sentence takeaway of the whole video, followed by a line with the timestamp where it is introduced.
- Then 3–6 numbered level-2 sections (\`## 1. Topic\`) following the video's order. Each has 1–3 short paragraphs explaining the point, every paragraph ending with a timestamp.
- Include 1–3 verbatim quotes in total, where the speaker's own words matter.`,
  toc: `Write a table of contents for this video.
- Start with a level-1 heading meaning "Table of contents".
- Then numbered level-2 chapters (\`## 1. Chapter title\`). Under each: a line with only the chapter's start timestamp, then 1–2 sentences on what it covers.
- If the uploader or Bilibili provides chapters, follow their division and titles (translated if needed).
- Cover the whole video; the last chapter should start within its final quarter.`,
  quotes: `Pick the 5–8 most insightful or memorable quotes from this video, in the video's order.
- Each: a numbered level-2 heading (\`## 1. Short headline\`) summarizing the quote's point, then the quote as a blockquote following the quote rules. You may join up to four consecutive transcript lines into one quote.`,
};

/**
 * What the model receives for a user turn; presets expand to their instructions. Today's date
 * goes here rather than in the system prompt, which must stay the same for the prompt cache;
 * without it, models assume their training year.
 */
export function buildUserPrompt(text: string, preset?: PresetId, playbackSeconds?: number): string {
  const parts = [preset && PRESET_PROMPTS[preset], text].filter(Boolean);
  // Local date; sv formats as YYYY-MM-DD.
  const today = `Today: ${new Date().toLocaleDateString('sv')}.`;
  parts.push(
    playbackSeconds === undefined
      ? `[${today}]`
      : `[${today} Current playback position: ${formatTimestamp(playbackSeconds)}. Use it when I refer to "now", "this part" or "what was just said".]`,
  );
  return parts.join('\n\n');
}

/** Rough token count: CJK characters ≈ 1 token each, other text ≈ 4 characters per token. */
export function estimateTokens(text: string): number {
  const cjk = text.match(/[　-鿿가-힯＀-￯]/g)?.length ?? 0;
  return cjk + Math.ceil((text.length - cjk) / 4);
}
