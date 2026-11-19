import type { PhrasingContent, Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { CITATION_PATTERN } from './sources';

/** Turns `[3]` text into `<bd-cite n="3">` elements, for numbers up to `count` (the answer's sources). */
export function remarkCitations({ count }: { count: number }) {
  return (tree: Root) => {
    if (!count) return;
    visit(tree, 'text', (node, index, parent) => {
      // Timestamps are already elements; a citation never sits inside a link.
      if (!parent || index === undefined || node.data?.hName || parent.type === 'link') return;
      const parts: PhrasingContent[] = [];
      let last = 0;
      for (const match of node.value.matchAll(CITATION_PATTERN)) {
        const n = Number(match[1]);
        if (n < 1 || n > count) continue;
        const start = match.index!;
        if (start > last) parts.push({ type: 'text', value: node.value.slice(last, start) });
        last = start + match[0].length;
        parts.push({ type: 'text', value: match[0], data: { hName: 'bd-cite', hProperties: { n }, hChildren: [] } });
      }
      if (last === 0) return;
      if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
      parent.children.splice(index, 1, ...parts);
      return index + parts.length;
    });
  };
}
