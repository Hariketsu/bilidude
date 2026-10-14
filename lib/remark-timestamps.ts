import type { Blockquote, PhrasingContent, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { visit } from 'unist-util-visit';
import type { Citations } from './citations';
import { parseTimestamp, TIMESTAMP_PATTERN } from './timestamp';

const QUOTED_TEXT = /[“"「『]([^”"」』]+)[”"」』]/;

/**
 * Turns `[03:05]` text into `<bd-timestamp seconds="185">` elements. With `citations`,
 * times are snapped to transcript lines (or dropped) and blockquotes whose text is
 * not found in the transcript are rendered as ordinary paragraphs.
 */
export function remarkTimestamps({ citations }: { citations?: Citations } = {}) {
  return (tree: Root) => {
    if (citations) {
      visit(tree, 'blockquote', (node: Blockquote) => {
        const text = toString(node);
        const time = [...text.matchAll(TIMESTAMP_PATTERN)][0];
        if (!time) return; // Still streaming, or no citation to check against.
        const quote = text.slice(0, time.index).match(QUOTED_TEXT)?.[1] ?? text.slice(0, time.index);
        const seconds = parseTimestamp(time[1], time[2]!, time[3]!);
        if (!citations.isVerbatim(quote, seconds)) {
          node.data = { ...node.data, hName: 'bd-paraphrase' };
        }
      });
    }

    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return;

      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const match of node.value.matchAll(TIMESTAMP_PATTERN)) {
        const start = match.index!;
        if (start > last) parts.push({ type: 'text', value: node.value.slice(last, start) });
        last = start + match[0].length;

        const cited = parseTimestamp(match[1], match[2]!, match[3]!);
        const seconds = citations ? citations.resolveTime(cited) : cited;
        if (seconds === null) continue;
        parts.push({
          type: 'text',
          value: match[0],
          data: { hName: 'bd-timestamp', hProperties: { seconds }, hChildren: [] },
        });
      }
      if (last === 0) return;
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });

      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
