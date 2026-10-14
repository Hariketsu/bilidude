import type { PhrasingContent, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { parseTimestamp, TIMESTAMP_PATTERN } from './timestamp';

/** Turns `[03:05]` text into `<bd-timestamp seconds="185">` elements. */
export function remarkTimestamps() {
  return (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index === undefined) return;

      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const match of node.value.matchAll(TIMESTAMP_PATTERN)) {
        const start = match.index!;
        if (start > last) parts.push({ type: 'text', value: node.value.slice(last, start) });
        parts.push({
          type: 'text',
          value: match[0],
          data: {
            hName: 'bd-timestamp',
            hProperties: { seconds: parseTimestamp(match[1], match[2]!, match[3]!) },
            hChildren: [],
          },
        });
        last = start + match[0].length;
      }
      if (parts.length === 0) return;
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });

      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
