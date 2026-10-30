import { Editor, Extension } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { Alert } from './alert';
import { BlockHandle } from './blockHandle';
import { MdxBlock, MdxInline } from './mdx';
import { FormatKeymap, KeymapStarterKit } from './keymap';
import { RichCodeBlock } from './codeBlock';
import { ColorSwatches } from './colorSwatches';
import { Emoji, createEmojiMenu } from './emoji';
import { FootnoteDefinition, FootnoteNumbers, FootnoteRef } from './footnotes';
import { SubscriptMark, SuperscriptMark, UnderlineMark } from './htmlMarks';
import { patchEntities } from './entities';
import { HtmlInline, patchInlineHtml } from './inlineHtml';
import { SeparateBulletList, SeparateOrderedList, patchEmptyListItems } from './lists';
import { MathBlock, MathInline } from './math';
import { createVideo, patchVideoParagraphs } from './media';
import { escapeMarkdownText, tidyMarkdown } from './markdownText';
import { HtmlBlock, LinkDefinition } from './rawBlocks';

export interface CreateEditorOptions {
  element: HTMLElement;
  /** Markdown that the editor shows first. */
  markdown: string;
  /** Map the `src` of an image or video to a URL that the webview can load. */
  resolveImageSrc?: (src: string) => string;
  /** Extra extensions, for example the floating toolbar. */
  extensions?: Extension[] | any[];
  placeholder?: string;
  /** The file is MDX. The editor then keeps `import`, `export`, JSX and `{expressions}` blocks as they are. */
  mdx?: boolean;
}

const REMOTE_SRC = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/** Build a function that turns a relative image path into a webview URL. */
export function createImageResolver(baseUri: string): (src: string) => string {
  const base = baseUri.endsWith('/') ? baseUri : `${baseUri}/`;
  return (src: string) => {
    if (!src || REMOTE_SRC.test(src)) {
      return src;
    }
    try {
      return new URL(src, base).toString();
    } catch {
      return src;
    }
  };
}

/**
 * The Markdown node for an image keeps the original `src`.
 * Only the node view rewrites it, so the file never gets a webview URL.
 */
function createImageExtension(resolve: (src: string) => string) {
  return Image.extend({
    addNodeView() {
      return ({ node, getPos, editor }) => {
        let current = node;

        const dom = document.createElement('span');
        dom.className = 'rme-image';
        dom.contentEditable = 'false';

        const img = document.createElement('img');
        dom.append(img);

        const apply = (attrs: Record<string, unknown>): void => {
          img.src = resolve(String(attrs.src ?? ''));
          img.alt = String(attrs.alt ?? '');
          const title = String(attrs.title ?? '');
          if (title) {
            img.title = title;
          } else {
            img.removeAttribute('title');
          }
        };
        apply(node.attrs);

        return {
          dom,
          ignoreMutation: () => true,
          update(updated) {
            if (updated.type !== current.type) {
              return false;
            }
            current = updated;
            apply(updated.attrs);
            return true;
          },
        };
      };
    },
  }).configure({ inline: true });
}

const BARE_URL_END = /[^\s<>.,:;!?'")\]*_~]$/;

/**
 * A link whose text is its address is written as a bare address. GitHub makes it a link.
 * Every other link keeps the form `[text](address "title")`.
 */
const RichLink = Link.extend({
  renderMarkdown(node, h, context) {
    const href = String(node.attrs?.href ?? '');
    const title = String(node.attrs?.title ?? '');
    // The serializer renders the link text later. `rendered` is a placeholder for it.
    const rendered = h.renderChildren(node);
    const text = typeof context?.meta?.markText === 'string' ? context.meta.markText : '';

    if (!title && text === href && /^https?:\/\/[^\s<>]+$/i.test(href)) {
      return BARE_URL_END.test(href) ? rendered : `<${rendered}>`;
    }
    if (!title && text.startsWith('www.') && href === `http://${text}` && BARE_URL_END.test(text)) {
      return rendered;
    }
    if (!title && href === `mailto:${text}` && /^[^\s@<>()[\]]+@[^\s@<>()[\]]+\.[A-Za-z]{2,}$/.test(text)) {
      return rendered;
    }
    return title ? `[${rendered}](${href} "${title}")` : `[${rendered}](${href})`;
  },
});

/**
 * Replace the text escaping of the Markdown serializer.
 * The built-in escaping turns `&`, `<` and `_` into `&amp;`, `&lt;` and `\\_` everywhere.
 * The replacement escapes a character only when Markdown would read it as syntax.
 */
function patchMarkdownEscaping(editor: Editor): void {
  const manager = editor.markdown as any;
  if (!manager || typeof manager.encodeTextForMarkdown !== 'function') {
    return;
  }
  manager.encodeTextForMarkdown = (text: string, node: any, parentNode: any): string => {
    const codeTypes: Set<string> | undefined = manager.codeTypes;
    const inCodeBlock = parentNode?.type != null && codeTypes?.has(parentNode.type);
    const hasCodeMark = (node.marks ?? []).some((mark: any) =>
      codeTypes?.has(typeof mark === 'string' ? mark : mark.type),
    );
    if (inCodeBlock || hasCodeMark) {
      return text;
    }
    const siblings: any[] | undefined = Array.isArray(parentNode?.content) ? parentNode.content : undefined;
    const index = siblings ? siblings.indexOf(node) : -1;
    const lineStart = index <= 0 || siblings?.[index - 1]?.type === 'hardBreak';
    return escapeMarkdownText(text, lineStart);
  };
}

/** Read the document as Markdown with a single blank line between blocks. */
export function getMarkdown(editor: Editor): string {
  return tidyMarkdown(editor.getMarkdown()).replace(/^\n+/, '').replace(/\n+$/, '');
}

export interface SetMarkdownOptions {
  /** Let the user undo this change. It is off for the first load. */
  undoable?: boolean;
  /** Tell the listeners of the `update` event. */
  emitUpdate?: boolean;
}

/** Replace the document with new Markdown. */
export function setMarkdown(editor: Editor, markdown: string, options: SetMarkdownOptions = {}): void {
  const { undoable = true, emitUpdate = false } = options;
  editor
    .chain()
    .setMeta('addToHistory', undoable)
    .setContent(tidyMarkdown(markdown), { contentType: 'markdown', emitUpdate })
    .run();
}

export function createEditor(options: CreateEditorOptions): Editor {
  const resolve = options.resolveImageSrc ?? ((src: string) => src);

  // The editor starts empty. The Markdown parser needs its changes before it reads the text.
  const editor = new Editor({
    element: options.element,
    content: '',
    contentType: 'markdown',
    // The stats bar stays at the top of the page. Scroll the cursor out from under it.
    editorProps: {
      scrollThreshold: { top: 36, right: 0, bottom: 0, left: 0 },
      scrollMargin: { top: 36, right: 5, bottom: 5, left: 5 },
    },
    extensions: [
      FormatKeymap,
      KeymapStarterKit.configure({
        // These come from the files in this folder.
        codeBlock: false,
        underline: false,
        link: false,
        bulletList: false,
        orderedList: false,
      }),
      SeparateBulletList,
      SeparateOrderedList,
      RichLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
      }),
      Markdown,
      UnderlineMark,
      SubscriptMark,
      SuperscriptMark,
      BlockHandle,
      RichCodeBlock,
      Alert,
      FootnoteRef,
      FootnoteDefinition,
      FootnoteNumbers,
      Emoji,
      MathInline,
      MathBlock,
      createEmojiMenu(),
      ColorSwatches,
      ...(options.mdx ? [MdxBlock, MdxInline] : []),
      HtmlBlock,
      HtmlInline,
      LinkDefinition,
      createVideo(resolve),
      createImageExtension(resolve),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: options.placeholder ?? 'Start writing, or type / for commands',
      }),
      ...(options.extensions ?? []),
    ],
  });

  patchMarkdownEscaping(editor);
  patchInlineHtml(editor);
  patchEntities(editor);
  patchVideoParagraphs(editor);
  patchEmptyListItems(editor);
  setMarkdown(editor, options.markdown, { undoable: false });
  return editor;
}
