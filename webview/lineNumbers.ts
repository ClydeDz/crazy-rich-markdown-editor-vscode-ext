import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { splitFrontMatter } from './frontMatter';
import { countLines } from './stats';

/** A block at the top of the document, with the Markdown that writes it. */
export interface MarkdownBlock {
  /** Where the block starts in the document. */
  pos: number;
  /** The Markdown of the block. It is empty for an empty paragraph. */
  text: string;
}

/** A line inside a block, such as an item of a list or a row of a table. */
export interface MarkdownLine {
  /** Where the line starts in the document. */
  pos: number;
  /** The words that the line begins with. The file writes them with the Markdown around them. */
  text: string;
}

/** A block at the top of the document, with the lines inside it that start a line of the file. */
export interface MarkdownSection {
  /** Where the block starts in the document. */
  pos: number;
  /** The Markdown of the block, as `topLevelBlocks` gives it. */
  text: string;
  /** The places inside the block where a line of the file starts one: an item, a row, a line of text. */
  lines: MarkdownLine[];
}

/** One number of the page: a line of the file, and where that line starts in the document. */
export interface LineNumber {
  /** Where the line starts in the document. */
  pos: number;
  /** The line of the file, counting from 1. */
  line: number;
  /** The last line of the block that holds it. It is the same as `line` for a line inside a block. */
  lastLine: number;
  /** True when the number belongs to a block at the top of the document, not to a line inside one. */
  block: boolean;
}

/** The lines of the file that one block covers. */
export interface BlockLines {
  /** Where the block starts in the document. */
  pos: number;
  /** The first line of the block in the file, counting from 1. */
  line: number;
  /** The last line of the block in the file, counting from 1. */
  lastLine: number;
}

/** The body of the file and the line of the file where it starts. */
export interface SourcePosition {
  /** The Markdown of the body, as the file has it. */
  body: string;
  /** The line where the body starts, counting from 1. The front matter comes before it. */
  firstLine: number;
}

export interface LineNumbersOptions {
  /** Read the file as the host last sent it or as the page last wrote it. */
  source: () => SourcePosition;
}

export interface LineNumbers {
  /** Show or hide the numbers (the setting `crazyRichMarkdown.showLineNumbers`). */
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Read the document and the file again, and move the numbers. */
  refresh(): void;
  /** Take the numbers out of the page. */
  destroy(): void;
}

/**
 * The body of a file and the line where it starts. The front matter comes first, so the numbers of the body count
 * from the line after it. `text` is the whole file, with `\n` line endings.
 */
export function sourcePosition(text: string): SourcePosition {
  const { body } = splitFrontMatter(text);
  return { body, firstLine: countLines(text.slice(0, text.length - body.length)) + 1 };
}

/** The Markdown of every block at the top of the document, in the order of the file. */
export function topLevelBlocks(editor: Editor): MarkdownBlock[] {
  const manager = editor.markdown;
  const blocks: MarkdownBlock[] = [];
  if (!manager) {
    return blocks;
  }
  editor.state.doc.forEach((node: ProseNode, offset: number) => {
    let text = '';
    try {
      text = manager.serialize({ type: 'doc', content: [node.toJSON() as JSONContent] });
    } catch {
      // A block that the serializer cannot write gives no line number. The blocks after it still get one.
      text = '';
    }
    blocks.push({ pos: offset, text });
  });
  return blocks;
}

/** A line as the page compares it: the spaces that Markdown ignores are gone. */
function compareLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

/**
 * The words of a line, without the markdown around them. The marker of a list item is not a word: the number of an
 * ordered item and the box of a task would otherwise stay in front of the words of the line.
 */
function compareWords(line: string): string {
  return line
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The words of a leaf node that the file writes: a picture shows its alt text, a formula its source. */
function leafWords(node: ProseNode): string {
  const alt: unknown = node.attrs.alt;
  if (typeof alt === 'string' && alt !== '') {
    return alt;
  }
  return node.textContent;
}

/**
 * The words of the first line of a node. A line break ends the first line, and a nested block does not add its
 * words, so an item of a list gives the words of its own first line and not of the items inside it.
 */
function firstLine(node: ProseNode): string {
  let text = '';
  let stop = false;
  node.descendants((child: ProseNode) => {
    if (stop) {
      return false;
    }
    if (child.type.name === 'hardBreak') {
      stop = true;
      return false;
    }
    if (child.isText) {
      const value = child.text ?? '';
      const at = value.indexOf('\n');
      if (at < 0) {
        text += value;
        return true;
      }
      text += value.slice(0, at);
      stop = true;
      return false;
    }
    if (child.isLeaf) {
      text += ` ${leafWords(child)} `;
      return false;
    }
    return true;
  });
  return text;
}

/** The words of a row of a table, one cell after the other. */
function rowWords(row: ProseNode): string {
  const words: string[] = [];
  row.forEach((cell: ProseNode) => words.push(firstLine(cell)));
  return words.join(' ');
}

/**
 * The lines that a block of text shows, with the place in the document where each one starts. A line break in the
 * text and a `<br>` both end a line, and a line that a picture fills has the alt text of the picture as its words.
 */
function visualLines(node: ProseNode, pos: number): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let start = pos + 1;
  let text = '';
  let filled = false;
  const end = (): void => {
    if (filled) {
      lines.push({ pos: start, text });
    }
    text = '';
    filled = false;
  };
  node.forEach((child: ProseNode, offset: number) => {
    const at = pos + 1 + offset;
    if (child.type.name === 'hardBreak') {
      end();
      start = at + child.nodeSize;
      return;
    }
    if (child.isText) {
      const value = child.text ?? '';
      let from = 0;
      for (;;) {
        const at2 = value.indexOf('\n', from);
        if (at2 < 0) {
          break;
        }
        if (at2 > from) {
          text += value.slice(from, at2);
          filled = true;
        }
        end();
        start = at + at2 + 1;
        from = at2 + 1;
      }
      if (from < value.length) {
        text += value.slice(from);
        filled = true;
      }
      return;
    }
    const words = leafWords(child);
    if (words !== '') {
      text += ` ${words} `;
      filled = true;
    }
  });
  end();
  return lines;
}

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);
const ITEM_TYPES = new Set(['listItem', 'taskItem']);
/** The blocks whose lines the page numbers one by one: a line of code is a line of the code, not of the page. */
const OPAQUE_TYPES = new Set(['codeBlock', 'mathBlock', 'mermaid', 'imageBlock']);
/**
 * The blocks that write a line of their own above the lines of their children. An alert writes its title on the
 * first line and its body under it, so the body is not on the line that the block has.
 */
const HEADED_TYPES = new Set(['alert']);

/**
 * The places inside a node where a line of the file starts one.
 *
 * `covered` says that the first line of the node already has a number, which the block or the item around it gave.
 * The first line of a list is the line of its first item, and the first line of a table is its first row.
 */
function collectLines(node: ProseNode, pos: number, covered: boolean, out: MarkdownLine[]): void {
  const name = node.type.name;
  if (LIST_TYPES.has(name)) {
    let first = covered;
    node.forEach((item: ProseNode, offset: number) => {
      const at = pos + 1 + offset;
      if (ITEM_TYPES.has(item.type.name)) {
        if (!first) {
          const inner = item.firstChild;
          out.push({ pos: at, text: inner ? firstLine(inner) : '' });
        }
        collectChildren(item, at, true, out);
      } else {
        collectLines(item, at, false, out);
      }
      first = false;
    });
    return;
  }
  if (name === 'table') {
    let first = covered;
    node.forEach((row: ProseNode, offset: number) => {
      const at = pos + 1 + offset;
      if (!first) {
        out.push({ pos: at, text: rowWords(row) });
      }
      first = false;
    });
    return;
  }
  if (OPAQUE_TYPES.has(name)) {
    return;
  }
  if (node.isTextblock) {
    visualLines(node, pos).forEach((line, index) => {
      if (index === 0 && covered) {
        return;
      }
      out.push(line);
    });
    return;
  }
  collectChildren(node, pos, HEADED_TYPES.has(name) ? false : covered, out);
}

/** The lines of the children of a node. The first child takes the line that the node has, when it has one. */
function collectChildren(node: ProseNode, pos: number, covered: boolean, out: MarkdownLine[]): void {
  node.forEach((child: ProseNode, offset: number, index: number) => {
    collectLines(child, pos + 1 + offset, index === 0 && covered, out);
  });
}

/** The blocks at the top of the document, each with the lines inside it that start a line of the file. */
export function documentSections(editor: Editor): MarkdownSection[] {
  const blocks = topLevelBlocks(editor);
  const sections: MarkdownSection[] = [];
  editor.state.doc.forEach((node: ProseNode, offset: number) => {
    const lines: MarkdownLine[] = [];
    collectLines(node, offset, true, lines);
    sections.push({ pos: offset, text: blocks[sections.length]?.text ?? '', lines });
  });
  return sections;
}

/** The lines of a block, without the empty lines at its start and at its end. */
function contentLines(text: string): string[] {
  const lines = text.split('\n').map(compareLine);
  while (lines.length > 0 && lines[0] === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

/** Where `lines` sit in `source` at or after `from`, or -1 when they are nowhere after that line. */
function findLines(source: string[], from: number, lines: string[]): number {
  for (let start = from; start + lines.length <= source.length; start++) {
    let i = 0;
    while (i < lines.length && source[start + i] === lines[i]) {
      i++;
    }
    if (i === lines.length) {
      return start;
    }
  }
  return -1;
}

/** The first line at or after `from` that has text. */
function nextContentLine(source: string[], from: number): number {
  let line = Math.max(from, 0);
  while (line < source.length && source[line] === '') {
    line++;
  }
  return line;
}

/**
 * The lines that each block covers, counted in the file.
 *
 * `source` is the body of the file, without the front matter, and `firstLine` is the line of the file where the
 * body starts. The Markdown of a block is looked up in the file, so a file that the user wrote keeps its own
 * line numbers, also when the editor writes the same block in another way. A block that fills several lines,
 * such as a code block or a table, gives its first line and its last line.
 *
 * An empty paragraph gives no line. The result follows the file: a block that cannot be found takes the next
 * line that has text.
 */
export function blockLineNumbers(blocks: MarkdownBlock[], source: string, firstLine = 1): BlockLines[] {
  const sourceLines = source.split('\n').map(compareLine);
  const starts: { pos: number; line: number }[] = [];
  let cursor = 0;

  for (const block of blocks) {
    const lines = contentLines(block.text);
    if (lines.length === 0) {
      continue;
    }
    let start = findLines(sourceLines, cursor, lines);
    if (start === -1) {
      // The file and the editor write this block in different ways: a table pads its cells, and a list with a
      // blank line between two items is written without that line. The block starts on the next line with
      // text. The file may be shorter than the block, so the next block looks for its own line from there.
      start = nextContentLine(sourceLines, cursor);
    }
    starts.push({ pos: block.pos, line: start });
    cursor = start + lines.length;
  }

  const result: BlockLines[] = [];
  let previous = -1;
  for (let i = 0; i < starts.length; i++) {
    const { pos, line } = starts[i];
    // A block that a later block also covers gets no number of its own: two numbers on one line would lie.
    if (line <= previous) {
      continue;
    }
    previous = line;
    const next = i + 1 < starts.length ? starts[i + 1].line : sourceLines.length;
    let end = next - 1;
    while (end > line && sourceLines[end] === '') {
      end--;
    }
    result.push({ pos, line: firstLine + line, lastLine: firstLine + Math.max(end, line) });
  }
  return result;
}

/**
 * The first line between `from` and `to` that begins with the words of `line`, or -1.
 * The file writes the words of the page inside its Markdown, so only the start of the line can be compared. A
 * word or two is not enough to know the line, and a line that the user wrapped in the file is shorter than the
 * words of the page, so the two are compared for as long as the shorter one goes.
 */
function findWords(lines: string[], from: number, to: number, line: string): number {
  const words = compareWords(line);
  if (words === '') {
    return -1;
  }
  const size = Math.min(words.length, 60);
  for (let at = Math.max(from, 0); at <= to && at < lines.length; at++) {
    const text = lines[at];
    if (text === '') {
      continue;
    }
    if (text.length >= size ? text.startsWith(words.slice(0, size)) : text.length >= 12 && words.startsWith(text)) {
      return at;
    }
  }
  return -1;
}

/**
 * The numbers of the page, in the order of the file: one for each block at the top of the document, and one for
 * each line inside a block that the page shows on a line of its own, such as an item of a list, a row of a table,
 * or a line of text with a picture on it.
 *
 * The lines inside a block are looked up between the lines of their block, in the order of the file. A line that
 * the file does not have gives no number, and it does not move the lines after it.
 */
export function lineNumbers(sections: MarkdownSection[], source: string, firstLine = 1): LineNumber[] {
  const blocks: MarkdownBlock[] = sections.map(({ pos, text }) => ({ pos, text }));
  const fileLines = source.split('\n').map(compareWords);
  const result: LineNumber[] = [];

  for (const block of blockLineNumbers(blocks, source, firstLine)) {
    result.push({ pos: block.pos, line: block.line, lastLine: block.lastLine, block: true });
    const section = sections.find((entry) => entry.pos === block.pos);
    if (section === undefined || section.lines.length === 0) {
      continue;
    }
    // The number of the block holds its first line, so the lines inside it look for their own line after it.
    const first = block.line - firstLine + 1;
    const last = block.lastLine - firstLine;
    let cursor = first;
    for (const line of section.lines) {
      const at = findWords(fileLines, cursor, last, line.text);
      if (at < 0) {
        continue;
      }
      cursor = at + 1;
      result.push({ pos: line.pos, line: at + firstLine, lastLine: at + firstLine, block: false });
    }
  }
  return result;
}

/**
 * The numbers at the left of the page, one for each line of the file that the page shows on a line of its own.
 * A number sits at the top of its line, where the line is on the screen.
 */
export function createLineNumbers(editor: Editor, options: LineNumbersOptions): LineNumbers {
  const host = editor.view.dom.parentElement;
  const box = document.createElement('div');
  box.className = 'rme-line-numbers';
  // The numbers repeat the lines that the page shows. A screen reader reads the text, not the numbers.
  box.setAttribute('aria-hidden', 'true');
  box.hidden = true;
  host?.append(box);

  let enabled = false;
  let frame = 0;
  const numbers: { element: HTMLElement; pos: number }[] = [];

  /** The top of the line that starts at `pos`, or undefined when the page cannot say where it is. */
  const lineTop = (pos: number): number | undefined => {
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement) {
      return dom.getBoundingClientRect().top;
    }
    // A line inside a block of text has no node of its own. The caret at its start knows where the line is.
    try {
      return editor.view.coordsAtPos(pos).top;
    } catch {
      return undefined;
    }
  };

  const place = (): void => {
    frame = 0;
    if (!host || !enabled) {
      return;
    }
    const base = host.getBoundingClientRect().top;
    for (const { element, pos } of numbers) {
      const top = lineTop(pos);
      if (top === undefined) {
        element.hidden = true;
        continue;
      }
      element.hidden = false;
      element.style.top = `${top - base}px`;
    }
  };

  // A picture that loads, or a diagram that the page draws, moves the lines under it.
  const schedulePlace = (): void => {
    if (frame === 0) {
      frame = requestAnimationFrame(place);
    }
  };

  const clear = (): void => {
    numbers.length = 0;
    box.replaceChildren();
  };

  const refresh = (): void => {
    if (!enabled) {
      return;
    }
    const { body, firstLine } = options.source();
    clear();
    for (const entry of lineNumbers(documentSections(editor), body, firstLine)) {
      const element = document.createElement('div');
      element.className = 'rme-line-number';
      element.textContent = String(entry.line);
      element.title = entry.lastLine > entry.line ? `Lines ${entry.line} to ${entry.lastLine}` : `Line ${entry.line}`;
      box.append(element);
      numbers.push({ element, pos: entry.pos });
    }
    place();
    schedulePlace();
  };

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedulePlace) : undefined;
  observer?.observe(editor.view.dom);
  const onResize = (): void => schedulePlace();
  window.addEventListener('resize', onResize);

  return {
    setEnabled(value) {
      if (value === enabled) {
        return;
      }
      enabled = value;
      box.hidden = !value;
      document.documentElement.classList.toggle('rme-has-line-numbers', value);
      if (value) {
        refresh();
      } else {
        clear();
      }
    },
    isEnabled: () => enabled,
    refresh,
    destroy() {
      cancelAnimationFrame(frame);
      frame = 0;
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      document.documentElement.classList.remove('rme-has-line-numbers');
      enabled = false;
      clear();
      box.remove();
    },
  };
}
