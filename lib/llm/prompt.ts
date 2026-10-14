import { formatTimestamp } from '../timestamp';
import type { PresetId, Transcript, VideoRef } from '../types';

const SOURCE_LABEL: Record<Transcript['source'], string> = {
  cc: 'uploaded subtitles',
  ai: 'Bilibili auto-generated subtitles',
};

/**
 * Instructions plus the whole video. Stays identical for every turn of a session,
 * so providers can serve it from the prompt cache.
 */
export function buildSystemPrompt(video: VideoRef, transcript: Transcript, outputLanguage: string): string {
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
- Quote with a Markdown blockquote. The quoted words must be copied verbatim from the transcript, in the original language, inside quotation marks, followed by the timestamp of the line they start on.
- When the video's language differs from ${outputLanguage}, add the translation on the next line of the same blockquote.
- Example:
  > “原话照抄” [03:05]
  > Translation of the quote

# Format
Markdown with headings and short paragraphs. No tables. No preamble or closing remarks.

# The video
<video>
Title: ${video.title}${video.partTitle ? `\nPart: P${video.p} ${video.partTitle}` : ''}
Uploader: ${video.upName}
Duration: ${formatTimestamp(video.durationSec)}${video.desc ? `\nDescription:\n${video.desc}` : ''}${chapters ? `\nChapters:\n${chapters}` : ''}
</video>

<transcript source="${SOURCE_LABEL[transcript.source]}" language="${transcript.lang}">
${lines}
</transcript>`;
}

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
- Each: a numbered level-2 heading (\`## 1. Short headline\`) summarizing the quote's point, then the quote as a blockquote following the quote rules. You may join consecutive transcript lines into one quote.`,
};

/** What the model receives for a user turn; presets expand to their instructions. */
export function buildUserPrompt(text: string, preset?: PresetId, playbackSeconds?: number): string {
  const parts = [preset && PRESET_PROMPTS[preset], text].filter(Boolean);
  if (playbackSeconds !== undefined) {
    parts.push(`[Current playback position: ${formatTimestamp(playbackSeconds)}. Use it when I refer to "now", "this part" or "what was just said".]`);
  }
  return parts.join('\n\n');
}

/** Rough token count: CJK characters ≈ 1 token each, other text ≈ 4 characters per token. */
export function estimateTokens(text: string): number {
  const cjk = text.match(/[　-鿿가-힯＀-￯]/g)?.length ?? 0;
  return cjk + Math.ceil((text.length - cjk) / 4);
}
