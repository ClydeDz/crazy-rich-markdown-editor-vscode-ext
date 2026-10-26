import type { Editor } from '@tiptap/core';
import { BulletList, OrderedList } from '@tiptap/extension-list';

/*
 * In Markdown a change of the marker starts a new list: "- a", then "* b" is two lists.
 * The editor writes the marker `-` for a bullet list and `1.` for a numbered list.
 * Two lists of one kind that follow each other would read back as one list. So the second list gets another marker.
 * A single list, which is the usual case, always has the usual marker.
 * A numbered list works the same way with `1.` and `1)`.
 */

const BULLETS = ['-', '*', '+'];
/** The marker that a list got, by list node. The next list reads it. */
const chosen = new WeakMap<object, number>();

function nextIndex(previous: any, type: string, count: number): number {
  const before = previous && previous.type === type ? chosen.get(previous) : undefined;
  return before === undefined ? 0 : (before + 1) % count;
}

export const SeparateBulletList = BulletList.extend({
  renderMarkdown(node, h, ctx) {
    const text: string = (this as any).parent?.(node, h, ctx) ?? '';
    const index = nextIndex((ctx as any)?.previousNode, 'bulletList', BULLETS.length);
    chosen.set(node, index);
    return index === 0 ? text : text.replace(/^- /gm, `${BULLETS[index]} `);
  },
});

const originalOrderedTokenizer = (OrderedList as any).config.markdownTokenizer;

/** The first line that starts a numbered item with another delimiter than the first item. A new list starts there. */
function delimiterChange(source: string): number {
  const lines = source.split('\n');
  const first = /^(?:\d+|[a-zA-Z]+)([.)])[ \t]/.exec(lines[0]);
  if (!first) {
    return source.length;
  }
  let offset = lines[0].length + 1;
  for (const line of lines.slice(1)) {
    const item = /^(?:\d+|[a-zA-Z]+)([.)])[ \t]/.exec(line);
    if (item && item[1] !== first[1]) {
      return offset;
    }
    offset += line.length + 1;
  }
  return source.length;
}

export const SeparateOrderedList = OrderedList.extend({
  // The reader of the editor does not tell `1.` from `1)`. This one ends a list when the delimiter changes.
  markdownTokenizer: {
    ...originalOrderedTokenizer,
    tokenize(src: string, tokens: unknown, lexer: unknown) {
      return originalOrderedTokenizer.tokenize(src.slice(0, delimiterChange(src)), tokens, lexer);
    },
  },

  renderMarkdown(node, h, ctx) {
    const text: string = (this as any).parent?.(node, h, ctx) ?? '';
    const index = nextIndex((ctx as any)?.previousNode, 'orderedList', 2);
    chosen.set(node, index);
    // The second list of two that follow each other uses `1)` and not `1.`.
    return index === 0 ? text : text.replace(/^(\d+|[a-zA-Z]+)\. /gm, '$1) ');
  },
});

/** Give every list item without content an empty paragraph. */
function fillEmptyItems(node: any): any {
  if (node && Array.isArray(node.content)) {
    node.content.forEach(fillEmptyItems);
  }
  if (node && (node.type === 'listItem' || node.type === 'taskItem') && (!node.content || node.content.length === 0)) {
    node.content = [{ type: 'paragraph' }];
  }
  return node;
}

/**
 * A list item that has no text, for example a line with only `1.`, reads as an item without a paragraph.
 * That is not a valid item, and it would disappear when the editor writes the file.
 * This change gives such an item an empty paragraph. Call it before the editor reads Markdown.
 */
export function patchEmptyListItems(editor: Editor): void {
  const manager = editor.markdown as any;
  if (!manager || typeof manager.parse !== 'function') {
    return;
  }
  const original = manager.parse.bind(manager);
  manager.parse = (markdown: string, ...rest: unknown[]) => fillEmptyItems(original(markdown, ...rest));
}
