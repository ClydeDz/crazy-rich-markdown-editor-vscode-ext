import { Node } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { fillHtmlPreview } from './htmlPreview';

export interface HtmlInlineOptions {
  /** Map the address of an image or a video to one that the page can load. */
  resolveSrc: (src: string) => string;
}

/**
 * HTML inside a line of text, such as `<kbd>Ctrl</kbd>`, `<a name="top"></a>` or `<!-- note -->`.
 * The editor shows the HTML as the page shows it, and keeps the HTML as its own text in the document,
 * so it writes the HTML back without a change.
 */
export const HtmlInline = Node.create<HtmlInlineOptions>({
  name: 'htmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { resolveSrc: (src: string) => src };
  },

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
    const { resolveSrc } = this.options;
    return ({ node }) => {
      let current = node;
      const dom = document.createElement('span');
      dom.className = 'rme-html-inline';
      dom.contentEditable = 'false';
      const preview = document.createElement('span');
      preview.className = 'rme-html-inline-preview';
      const show = (raw: string): void => {
        // A line break keeps the new line that follows it in the file, but the page must not draw it a second time.
        const shown = fillHtmlPreview(preview, raw.endsWith('\n') ? raw.slice(0, -1) : raw, { resolveSrc });
        dom.replaceChildren(shown ? preview : document.createTextNode(raw));
        dom.classList.toggle('is-rendered', shown);
        dom.classList.toggle('is-comment', !shown && raw.startsWith('<!--'));
        if (shown) {
          dom.removeAttribute('title');
        } else {
          dom.title = 'HTML in the text. The editor keeps it as it is.';
        }
      };
      show(String(node.attrs.raw ?? ''));
      return {
        dom,
        // The page of the HTML is not the text of the file. A picture that loads must not count as an edit.
        ignoreMutation: () => true,
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
 * This change keeps every tag as it is, including `<br>`, so that the file gets the text back as written.
 * Call this before the editor reads Markdown.
 */
export function patchInlineHtml(editor: Editor): void {
  const manager = editor.markdown as any;
  if (!manager || typeof manager.parseHTMLToken !== 'function') {
    return;
  }
  // A line break tag that ends a line is followed by a new line in the text. The new line stays in the tag, so the
  // page draws one break and the file gets the tag and its new line back as they were written.
  const readTokens = manager.parseInlineTokens.bind(manager);
  manager.parseInlineTokens = (tokens: any[]) => {
    const next = tokens.map((token) => ({ ...token }));
    next.forEach((token, index) => {
      if (index === 0 || token.type !== 'text' || typeof token.text !== 'string') {
        return;
      }
      const before = next[index - 1];
      if (!token.text.startsWith('\n') || before.type !== 'html') {
        return;
      }
      if (!LINE_BREAK.test(String(before.raw ?? '').trim())) {
        return;
      }
      before.raw = `${String(before.raw ?? '')}\n`;
      if (typeof before.text === 'string') {
        before.text = `${before.text}\n`;
      }
      token.text = token.text.slice(1);
    });
    return readTokens(next);
  };

  const original = manager.parseHTMLToken.bind(manager);
  manager.parseHTMLToken = (token: any) => {
    if (token.block) {
      return original(token);
    }
    const raw = String(token.raw ?? token.text ?? '');
    if (!raw.trim()) {
      return original(token);
    }
    return { type: 'htmlInline', attrs: { raw } };
  };
}
