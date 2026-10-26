import { Node } from '@tiptap/core';
import type { Editor } from '@tiptap/core';

/**
 * HTML inside a line of text, such as `<kbd>Ctrl</kbd>`, `<a name="top"></a>` or `<!-- note -->`.
 * The editor cannot show it as rich text. It keeps the HTML and writes it back without a change.
 */
export const HtmlInline = Node.create({
  name: 'htmlInline',
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
        tag: 'span[data-html-inline]',
        getAttrs: (element) => ({ raw: (element as HTMLElement).getAttribute('data-raw') ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['span', { 'data-html-inline': '', 'data-raw': node.attrs.raw }, node.attrs.raw];
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
      dom.title = 'HTML in the text. The editor keeps it as it is.';
      const show = (raw: string): void => {
        dom.textContent = raw;
        dom.classList.toggle('is-comment', raw.startsWith('<!--'));
      };
      show(String(node.attrs.raw ?? ''));
      return {
        dom,
        update(updated) {
          if (updated.type !== current.type) {
            return false;
          }
          current = updated;
          show(String(updated.attrs.raw ?? ''));
          return true;
        },
      };
    };
  },
});

const LINE_BREAK = /^<br\s*\/?>$/i;

/**
 * Change how the Markdown parser reads HTML inside a line.
 * The built-in parser changes HTML tags into formatting, and it drops tags that it does not know.
 * This change keeps every tag as it is, except `<br>`, which is a line break.
 * Call this before the editor reads Markdown.
 */
export function patchInlineHtml(editor: Editor): void {
  const manager = editor.markdown as any;
  if (!manager || typeof manager.parseHTMLToken !== 'function') {
    return;
  }
  // A line break tag that ends a line is followed by a new line in the text. The new line must not make a second break.
  const readTokens = manager.parseInlineTokens.bind(manager);
  manager.parseInlineTokens = (tokens: any[]) =>
    readTokens(
      tokens.map((token, index) => {
        const before = tokens[index - 1];
        return index > 0 &&
          token.type === 'text' &&
          typeof token.text === 'string' &&
          token.text.startsWith('\n') &&
          before.type === 'html' &&
          LINE_BREAK.test(String(before.raw ?? '').trim())
          ? { ...token, text: token.text.slice(1) }
          : token;
      }),
    );

  const original = manager.parseHTMLToken.bind(manager);
  manager.parseHTMLToken = (token: any) => {
    if (token.block) {
      return original(token);
    }
    const raw = String(token.raw ?? token.text ?? '');
    if (!raw.trim() || LINE_BREAK.test(raw.trim())) {
      return original(token);
    }
    return { type: 'htmlInline', attrs: { raw } };
  };
}
