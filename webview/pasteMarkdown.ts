import { Extension } from '@tiptap/core';
import type { Editor, JSONContent } from '@tiptap/core';
import { DOMParser, Slice } from '@tiptap/pm/model';
import type { Schema } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';

/** A language that says a block holds Markdown source: a fence in a file, or a code block on the clipboard. */
export function isMarkdownLanguage(language: unknown): boolean {
  return language === 'markdown' || language === 'md';
}

/** Kinds of node that hold their own raw text, where a paste of Markdown source does not fit. */
const RAW_TEXT_NODES = new Set(['codeBlock', 'mdxBlock', 'tableCell']);

/** True when the selection sits in a box that holds raw text, so the paste must stay text. */
function holdsRawText(view: EditorView): boolean {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const type = $from.node(depth).type;
    if (type.spec.code === true || RAW_TEXT_NODES.has(type.name)) {
      return true;
    }
  }
  return false;
}

/**
 * The Markdown source of a pasted HTML snippet, when the snippet is one code block of Markdown.
 * The language sits on the `pre` or on the `code`. Any other HTML gives `null`, so pasted rich
 * text and a code block of another language keep the paste they have today.
 */
export function pastedMarkdownCode(html: string, schema: Schema): string | null {
  const body = new window.DOMParser().parseFromString(html, 'text/html').body;
  // The parse rules of the blocks read their own whitespace, as they do in a paste of HTML.
  const slice = DOMParser.fromSchema(schema).parseSlice(body);
  // The snippet can carry blank lines around the one block that holds the text.
  const blocks = slice.content.content.filter((node) =>
    node.isText ? Boolean(node.text?.trim()) : !(node.type.name === 'paragraph' && node.content.size === 0),
  );
  if (blocks.length !== 1) {
    return null;
  }
  const [only] = blocks;
  if (only.type.name !== 'codeBlock' || !isMarkdownLanguage(only.attrs.language)) {
    return null;
  }
  return only.textContent;
}

/**
 * The slice of a paste of Markdown. One paragraph joins the line at the cursor, and blocks of
 * their own land beside it, as a fragment of pasted HTML does, so a heading never turns into
 * text of the line. Markdown that holds no block gives `null`: the paste is then left to the
 * editor, which would otherwise take the text at the cursor away.
 */
export function markdownSlice(parsed: JSONContent, schema: Schema): Slice | null {
  const content = schema.nodeFromJSON(parsed).content;
  if (content.size === 0) {
    return null;
  }
  const joinsLine = content.childCount === 1 && content.child(0).type.name === 'paragraph';
  const open = joinsLine ? 1 : 0;
  return new Slice(content, open, open);
}

/**
 * Read a paste as Markdown source, so the editor shows it formatted: `# big reveal` lands as a
 * heading and a badge lands as a picture. A paste of anything else is left to the editor: files,
 * rich text, a code block of another language, and a box that holds raw text.
 * It returns true when this paste took the paste.
 */
export function pasteMarkdown(editor: Editor, view: EditorView, event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  // A paste of files belongs to the media handler, which runs after this one.
  if (!data || data.files.length > 0) {
    return false;
  }
  const target = event.target;
  if (target instanceof window.HTMLTextAreaElement || target instanceof window.HTMLInputElement) {
    return false;
  }
  if (holdsRawText(view)) {
    return false;
  }

  const html = data.getData('text/html');
  const markdown = html ? pastedMarkdownCode(html, view.state.schema) : data.getData('text/plain');
  if (!markdown || !markdown.trim()) {
    return false;
  }

  const manager = editor.markdown;
  if (!manager) {
    return false;
  }
  const slice = markdownSlice(manager.parse(markdown), view.state.schema);
  if (!slice) {
    return false;
  }
  event.preventDefault();
  view.dispatch(view.state.tr.replaceSelection(slice));
  return true;
}

/** Paste Markdown source as Markdown. The editor shows the pasted text formatted at once. */
export function createPasteMarkdown(): Extension {
  return Extension.create({
    name: 'rmePasteMarkdown',
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          key: new PluginKey('rmePasteMarkdown'),
          props: {
            handlePaste: (view, event) => pasteMarkdown(editor, view, event),
          },
        }),
      ];
    },
  });
}
