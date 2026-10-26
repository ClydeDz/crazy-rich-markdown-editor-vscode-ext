import type { CommandProps } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import type { Selection, Transaction } from '@tiptap/pm/state';

/** The blocks that hold lines of text. A selection of these blocks can become one code block, math block or diagram. */
const LINE_BLOCKS = new Set(['paragraph', 'heading', 'codeBlock']);

/**
 * What a block gives for a piece of text:
 * - `source`: the text as it is, for a code block or a diagram.
 * - `tex`: the same, but a formula inside the line gives only its TeX, for a math block.
 */
export type LineFormat = 'source' | 'tex';

export interface LineGroup {
  /** Where the first block starts. */
  from: number;
  /** Where the last block ends. */
  to: number;
  /** The text of each block. */
  lines: string[];
  /** The text of all blocks, one block on each line. A blank line at the start or at the end is cut off. */
  text: string;
}

const INLINE_SOURCE: Record<string, (attrs: Record<string, any>, format: LineFormat) => string> = {
  mathInline: (attrs, format) => {
    const tex = String(attrs.tex ?? '');
    if (format === 'tex') {
      return tex;
    }
    return attrs.backtick ? `$\`${tex}\`$` : `$${tex}$`;
  },
  emoji: (attrs) => `:${attrs.name ?? ''}:`,
  footnoteRef: (attrs) => `[^${attrs.id ?? ''}]`,
  htmlInline: (attrs) => String(attrs.raw ?? ''),
};

/** The text of one block. A line break is a new line, and the nodes that are not text give the Markdown that made them. */
function blockText(block: ProseNode, format: LineFormat): string {
  let text = '';
  block.forEach((child) => {
    if (child.isText) {
      text += child.text;
    } else if (child.type.name === 'hardBreak') {
      text += '\n';
    } else {
      text += INLINE_SOURCE[child.type.name]?.(child.attrs, format) ?? '';
    }
  });
  return text;
}

function trimBlankEdges(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');
}

/**
 * The lines that the selection touches. Blocks that sit next to each other in the same place make one group.
 * A table, a list or a quote between two paragraphs splits the groups, and so does a change of place:
 * the paragraphs of one list item are a group, and the paragraphs of the next list item are another one.
 * A cursor without a selection gives the block that holds it. A table gives no lines.
 */
export function selectedLineGroups(source: { doc: ProseNode; selection: Selection }, format: LineFormat): LineGroup[] {
  const { from, to } = source.selection;
  const groups: LineGroup[] = [];
  source.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'table') {
      // A cell cannot hold a code block in Markdown, so the lines of a table stay as they are.
      return false;
    }
    if (!LINE_BLOCKS.has(node.type.name)) {
      // A list item or a quote holds the blocks that can be lines.
      return true;
    }
    const line = blockText(node, format);
    const last = groups[groups.length - 1];
    if (last && last.to === pos) {
      last.to = pos + node.nodeSize;
      last.lines.push(line);
    } else {
      groups.push({ from: pos, to: pos + node.nodeSize, lines: [line], text: '' });
    }
    return false;
  });
  for (const group of groups) {
    group.text = trimBlankEdges(group.lines.join('\n'));
  }
  return groups;
}

/**
 * Replace each group with a new block. A group whose place does not allow the block stays as it is,
 * for example the first paragraph of a list item, which cannot be a code block.
 * It gives the place of the first new block, or `undefined` when no group could change.
 */
function replaceLineGroups(
  tr: Transaction,
  groups: LineGroup[],
  makeBlock: (group: LineGroup) => ProseNode,
): number | undefined {
  let first: number | undefined;
  // The last group goes first, so that the places of the groups before it do not move.
  for (const group of [...groups].reverse()) {
    const block = makeBlock(group);
    const $from = tr.doc.resolve(group.from);
    const $to = tr.doc.resolve(group.to);
    if (!$from.parent.canReplaceWith($from.index(), $to.index(), block.type)) {
      continue;
    }
    tr.replaceWith(group.from, group.to, block);
    first = group.from;
  }
  return first;
}

export interface ReplacedLines {
  /** Where the first new block starts. */
  place: number;
  /** The number of groups that the selection had. */
  groups: number;
  /** Where the cursor was in the first block, counted from the start of its text. `undefined` when text was selected. */
  cursorOffset?: number;
}

/**
 * Turn the selected lines into new blocks, one block for each group of lines. It changes the transaction of the command.
 * Lines in a list item cannot become a code block or a math block. When nothing can change, the command takes the lines
 * out of their list first, as the default command of a code block does, and tries again.
 * The lines then sit in a place that takes any block, so the second try works.
 * It gives `undefined` when there are no lines to change, and leaves the document as it is.
 */
export function replaceSelectedLines(
  props: CommandProps,
  format: LineFormat,
  makeBlock: (group: LineGroup) => ProseNode,
): ReplacedLines | undefined {
  const { tr } = props;
  // The transaction is always current. `props.state` keeps the document from the start of the command.
  const attempt = (): ReplacedLines | undefined => {
    const groups = selectedLineGroups(tr, format);
    const { empty, from } = tr.selection;
    const place = replaceLineGroups(tr, groups, makeBlock);
    if (place === undefined) {
      return undefined;
    }
    return { place, groups: groups.length, cursorOffset: empty ? from - (groups[0].from + 1) : undefined };
  };
  const first = attempt();
  if (first || selectedLineGroups(tr, format).length === 0) {
    return first;
  }
  return props.commands.clearNodes() ? attempt() : undefined;
}
