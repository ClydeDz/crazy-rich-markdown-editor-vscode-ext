import { Node } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { createRawBlock } from './rawBlocks';

/*
 * MDX is Markdown with three extra kinds of block:
 *   - `import` and `export` lines (JavaScript),
 *   - JSX, such as `<Callout type="warning">...</Callout>` or `<Chart data={data} />`,
 *   - an expression in braces on its own, such as `{/* a comment *\/}`.
 * The editor cannot draw a component, so it keeps each of these blocks as the exact text and shows it as colored code.
 * A save writes the same text back. The scanner below finds where such a block starts and ends.
 * It follows the rules of MDX: the block must start at the start of a line, and nothing may follow it on its last line.
 */

export type MdxKind = 'esm' | 'jsx' | 'expression';

export interface MdxMatch {
  kind: MdxKind;
  /** The text that the block takes, from the start of `src` to the end of its last line (with the line break). */
  raw: string;
}

const CLOSER: Record<string, string> = { '(': ')', '[': ']', '{': '}' };

/** Tags that have no closing tag in HTML. In JSX they are written `<br />`, but the editor also accepts `<br>`. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** The end of a string that starts at `start` with a quote. A string stops at the end of its line, so an apostrophe in text is not a string. */
function skipString(src: string, start: number): number {
  const quote = src[start];
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === '\\') {
      i++;
    } else if (src[i] === quote) {
      return i + 1;
    } else if (src[i] === '\n') {
      return start + 1;
    }
  }
  return start + 1;
}

/** The end of a template literal that starts at `start`. A `${ }` inside it can hold code. It gives -1 when the literal does not end. */
function skipTemplate(src: string, start: number): number {
  for (let i = start + 1; i < src.length; i++) {
    if (src[i] === '\\') {
      i++;
    } else if (src[i] === '`') {
      return i + 1;
    } else if (src[i] === '$' && src[i + 1] === '{') {
      const end = skipGroup(src, i + 1);
      if (end < 0) {
        return -1;
      }
      i = end - 1;
    }
  }
  return -1;
}

/**
 * The end of the group of brackets that starts at `start`, with its matching closer. It reads over strings, templates and comments.
 * It gives -1 when the brackets do not match or the text ends first.
 */
function skipGroup(src: string, start: number): number {
  const stack: string[] = [];
  let i = start;
  while (i < src.length) {
    const char = src[i];
    if (CLOSER[char]) {
      stack.push(CLOSER[char]);
      i++;
    } else if (char === ')' || char === ']' || char === '}') {
      if (stack.pop() !== char) {
        return -1;
      }
      i++;
      if (stack.length === 0) {
        return i;
      }
    } else if (char === '"' || char === "'") {
      i = skipString(src, i);
    } else if (char === '`') {
      i = skipTemplate(src, i);
      if (i < 0) {
        return -1;
      }
    } else if (char === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i);
      i = end < 0 ? src.length : end;
    } else if (char === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) {
        return -1;
      }
      i = end + 2;
    } else {
      i++;
    }
  }
  return -1;
}

interface Tag {
  end: number;
  closing: boolean;
  selfClosing: boolean;
}

/** Read the JSX tag that starts at `start` (a `<`). It gives `undefined` when the text is not a tag. */
function readTag(src: string, start: number): Tag | undefined {
  if (src[start + 1] === '/') {
    const end = src.indexOf('>', start);
    return end < 0 ? undefined : { end: end + 1, closing: true, selfClosing: false };
  }
  if (src[start + 1] === '>') {
    return { end: start + 2, closing: false, selfClosing: false };
  }
  const name = /^[A-Za-z_$][\w$.:-]*/.exec(src.slice(start + 1, start + 200))?.[0];
  if (!name) {
    return undefined;
  }
  let i = start + 1 + name.length;
  while (i < src.length) {
    const char = src[i];
    if (char === '>') {
      return { end: i + 1, closing: false, selfClosing: VOID_TAGS.has(name) };
    }
    if (char === '/' && src[i + 1] === '>') {
      return { end: i + 2, closing: false, selfClosing: true };
    }
    if (char === '{') {
      const end = skipGroup(src, i);
      if (end < 0) {
        return undefined;
      }
      i = end;
    } else if (char === '"' || char === "'") {
      // A JSX attribute string has no escapes and may span lines.
      const end = src.indexOf(char, i + 1);
      if (end < 0) {
        return undefined;
      }
      i = end + 1;
    } else {
      i++;
    }
  }
  return undefined;
}

/** The end of one JSX element that starts at `start`, with all its children. It gives -1 when the tags do not match. */
function skipElement(src: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const char = src[i];
    if (char === '<') {
      if (src.startsWith('<!--', i)) {
        const end = src.indexOf('-->', i + 4);
        if (end < 0) {
          return -1;
        }
        i = end + 3;
        continue;
      }
      const tag = readTag(src, i);
      if (!tag) {
        return -1;
      }
      i = tag.end;
      if (tag.closing) {
        depth--;
      } else if (!tag.selfClosing) {
        depth++;
      }
      if (depth === 0) {
        return i;
      }
      if (depth < 0) {
        return -1;
      }
    } else if (char === '{') {
      const end = skipGroup(src, i);
      if (end < 0) {
        return -1;
      }
      i = end;
    } else if (char === '`') {
      // Code in the text of a component (`<div>` in backticks, or a fenced block) is text, not a tag.
      const run = /^`+/.exec(src.slice(i))![0];
      const end = src.indexOf(run, i + run.length);
      i = end < 0 ? i + run.length : end + run.length;
    } else {
      i++;
    }
  }
  return -1;
}

const lineEnd = (src: string, from: number): number => {
  const end = src.indexOf('\n', from);
  return end < 0 ? src.length : end;
};

/** `end` is the end of an element or an expression. The rest of its line must be empty. It gives the start of the next line, or -1. */
function endOfLine(src: string, end: number): number {
  const rest = src.slice(end, lineEnd(src, end));
  if (rest.trim() !== '') {
    return -1;
  }
  return Math.min(src.length, lineEnd(src, end) + 1);
}

const JSX_START = /^<(?:[A-Z]|>)/;

/** One or more elements and expressions that follow each other without an empty line between them. */
function scanFlow(src: string): number {
  let i = 0;
  let last = -1;
  while (i < src.length) {
    const char = src[i];
    let end: number;
    if (char === '{') {
      end = skipGroup(src, i);
    } else if (char === '<' && JSX_START.test(src.slice(i, i + 2))) {
      end = skipElement(src, i);
    } else {
      break;
    }
    const next = end < 0 ? -1 : endOfLine(src, end);
    if (next < 0) {
      break;
    }
    last = next;
    i = next;
  }
  return last;
}

const ESM_START = /^(?:import|export)(?=[\s{*'"])/;

/**
 * The lines of an import or an export. A block ends at an empty line, as in MDX. It also ends when the next line is not
 * indented and does not start another `import` or `export`, so a heading right under the imports is not part of them.
 */
function scanEsm(src: string): number {
  let i = 0;
  while (i < src.length) {
    const char = src[i];
    if (CLOSER[char]) {
      const end = skipGroup(src, i);
      if (end < 0) {
        return -1;
      }
      i = end;
    } else if (char === '"' || char === "'") {
      i = skipString(src, i);
    } else if (char === '`') {
      i = skipTemplate(src, i);
      if (i < 0) {
        return -1;
      }
    } else if (char === '/' && src[i + 1] === '/') {
      i = lineEnd(src, i);
    } else if (char === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) {
        return -1;
      }
      i = end + 2;
    } else if (char === '\n') {
      const next = i + 1;
      const line = src.slice(next, lineEnd(src, next));
      const continues = line.trim() !== '' && (/^[ \t]/.test(line) || ESM_START.test(line));
      if (!continues) {
        return next;
      }
      i = next;
    } else {
      i++;
    }
  }
  return src.length;
}

/**
 * Find an MDX block at the start of `src`. It gives `undefined` when `src` starts with ordinary Markdown,
 * or when the block is not complete (an open tag with no closing tag), so the Markdown parser reads it as it did before.
 */
export function scanMdxBlock(src: string): MdxMatch | undefined {
  const kinds: [MdxKind, number][] = [];
  if (ESM_START.test(src)) {
    kinds.push(['esm', scanEsm(src)]);
  } else if (src[0] === '{' || JSX_START.test(src.slice(0, 2))) {
    kinds.push([src[0] === '{' ? 'expression' : 'jsx', scanFlow(src)]);
  }
  for (const [kind, end] of kinds) {
    if (end > 0) {
      return { kind, raw: src.slice(0, end) };
    }
  }
  return undefined;
}

/**
 * The title that every MDX block shows above its text. The editor does not try to tell an import from a component
 * from an expression: all of them are code that the user writes, and the project draws them outside of the editor.
 */
export const MDX_LABEL = 'MDX code';

/** A block of MDX that the editor keeps as it is. Add it to the editor only for an `.mdx` file. */
export const MdxBlock = createRawBlock({
  name: 'mdxBlock',
  tokenName: 'mdxBlock',
  label: MDX_LABEL,
  placeholder: 'Write MDX here, for example <Counter />',
  language: 'jsx',
  tokenizer: {
    name: 'mdxBlock',
    level: 'block',
    // The block starts a line, never in the middle of a paragraph.
    start: () => -1,
    tokenize: (src) => {
      const match = scanMdxBlock(src);
      return match ? { type: 'mdxBlock', raw: match.raw, text: match.raw } : undefined;
    },
  },
});

/** The expression in braces that starts `src`, for example `{props.name}`. It gives `undefined` when `src` does not start with a complete one. */
export function scanMdxExpression(src: string): string | undefined {
  if (src[0] !== '{') {
    return undefined;
  }
  const end = skipGroup(src, 0);
  return end > 0 ? src.slice(0, end) : undefined;
}

/**
 * An expression in braces inside a line of text, such as `{props.name}` or `{/* note *\/}`.
 * The editor shows it as a small piece of code, and writes it back without a change.
 */
export const MdxInline = Node.create({
  name: 'mdxInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { raw: { default: '' } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-mdx-inline]',
        getAttrs: (element) => ({ raw: (element as HTMLElement).getAttribute('data-raw') ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['span', { 'data-mdx-inline': '', 'data-raw': node.attrs.raw }, node.attrs.raw];
  },

  markdownTokenName: 'mdxInline',

  markdownTokenizer: {
    name: 'mdxInline',
    level: 'inline',
    start: (src: string) => src.indexOf('{'),
    tokenize: (src: string) => {
      const raw = scanMdxExpression(src);
      return raw ? { type: 'mdxInline', raw, text: raw } : undefined;
    },
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode('mdxInline', { raw: String(token.raw ?? '') });
  },

  renderMarkdown(node) {
    return String(node.attrs?.raw ?? '');
  },

  addNodeView() {
    return ({ node }) => {
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'rme-html-inline';
      dom.contentEditable = 'false';
      dom.title = 'MDX expression in the text. The editor keeps it as it is.';
      dom.textContent = String(node.attrs.raw ?? '');
      return {
        dom,
        update(updated) {
          if (updated.type !== current.type) {
            return false;
          }
          current = updated;
          dom.textContent = String(updated.attrs.raw ?? '');
          return true;
        },
      };
    };
  },
});

/**
 * Put the cursor in the text box of the empty MDX block that the slash menu just added.
 * The block exists after the command ran, and its text box exists after the page drew it, so the focus waits for a frame.
 */
export function focusEmptyMdxBlock(editor: Editor): void {
  let place: number | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'mdxBlock' && !String(node.attrs.raw ?? '').trim()) {
      place = pos;
    }
  });
  if (place === undefined) {
    return;
  }
  const at = place;
  requestAnimationFrame(() => {
    const dom = editor.view.nodeDOM(at);
    (dom instanceof HTMLElement ? dom.querySelector('textarea') : null)?.focus();
  });
}
