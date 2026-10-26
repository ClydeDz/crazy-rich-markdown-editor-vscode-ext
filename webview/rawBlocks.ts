import { Node } from '@tiptap/core';
import { highlightInto } from './highlightDom';

interface RawBlockOptions {
  /** Name of the node in the document schema. */
  name: string;
  /** Name of the Markdown token that the node keeps. */
  tokenName: string;
  /** Text above the block, so the user knows what it is. A function reads it from the text of the block. */
  label: string | ((raw: string) => string);
  /** Text that the empty text box shows. */
  placeholder?: string;
  /** A language of the code highlighter. The text of the block then has its colors. */
  language?: string;
  /** A tokenizer that finds the block in the Markdown. Without it, the node keeps a token that the Markdown parser makes. */
  tokenizer?: {
    name: string;
    level: 'block' | 'inline';
    start: (src: string) => number;
    tokenize: (src: string) => { type: string; raw: string; text: string } | undefined;
  };
}

/**
 * A block that the rich editor cannot show as rich text.
 * It keeps the original Markdown text and writes it back without a change.
 * The user can edit the text in a small text box.
 */
export function createRawBlock({ name, tokenName, label, placeholder, language, tokenizer }: RawBlockOptions) {
  const labelOf = (raw: string): string => (typeof label === 'function' ? label(raw) : label);
  return Node.create({
    name,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return { raw: { default: '' } };
    },

    parseHTML() {
      return [
        {
          tag: `div[data-raw-block="${name}"]`,
          getAttrs: (element) => ({ raw: (element as HTMLElement).getAttribute('data-raw') ?? '' }),
        },
      ];
    },

    renderHTML({ node }) {
      return ['div', { 'data-raw-block': name, 'data-raw': node.attrs.raw }, node.attrs.raw];
    },

    markdownTokenName: tokenName,
    ...(tokenizer ? { markdownTokenizer: tokenizer } : {}),

    parseMarkdown(token, helpers) {
      // An empty result tells the Markdown parser to use its own rules for the token.
      if (tokenName === 'html' && token.block === false) {
        return [];
      }
      const raw = String(token.raw ?? token.text ?? '').replace(/\s+$/, '');
      if (!raw.trim()) {
        return [];
      }
      return helpers.createNode(name, { raw });
    },

    renderMarkdown(node) {
      return String(node.attrs?.raw ?? '');
    },

    addNodeView() {
      return ({ node, getPos, editor }) => {
        let current = node;

        const dom = document.createElement('div');
        dom.className = 'rme-raw';
        dom.classList.toggle('has-colors', Boolean(language));
        dom.contentEditable = 'false';

        const labelElement = document.createElement('span');
        labelElement.className = 'rme-raw-label';
        labelElement.textContent = labelOf(String(node.attrs.raw ?? ''));

        const field = document.createElement('div');
        field.className = 'rme-raw-field';
        const area = document.createElement('textarea');
        area.className = 'rme-raw-input';
        area.spellcheck = false;
        area.rows = 1;
        if (placeholder) {
          area.placeholder = placeholder;
        }
        area.setAttribute('aria-label', labelOf(String(node.attrs.raw ?? '')));

        // A hidden text box reports a height of zero. Keep the automatic height then.
        const autosize = (): void => {
          area.style.height = 'auto';
          if (area.scrollHeight > 0) {
            area.style.height = `${area.scrollHeight}px`;
          }
        };

        // With a language, a colored copy of the text sits behind the text box, and the text box has clear text.
        let colors: HTMLElement | undefined;
        if (language) {
          const pre = document.createElement('pre');
          pre.className = 'rme-raw-colors';
          pre.setAttribute('aria-hidden', 'true');
          colors = document.createElement('code');
          pre.append(colors);
          field.append(pre);
          area.classList.add('has-colors');
        }

        const show = (raw: string): void => {
          if (area.value !== raw) {
            area.value = raw;
          }
          labelElement.textContent = labelOf(raw);
          area.setAttribute('aria-label', labelOf(raw));
          if (colors && language) {
            highlightInto(colors, language, raw);
          }
          autosize();
        };
        show(String(node.attrs.raw ?? ''));

        area.addEventListener('input', () => {
          const pos = getPos();
          if (pos === undefined) {
            return;
          }
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { raw: area.value }));
          autosize();
        });

        field.append(area);
        dom.append(labelElement, field);
        // The block is not in the page yet. Measure it again each time its width changes.
        let lastWidth = 0;
        const observer =
          typeof ResizeObserver === 'undefined'
            ? undefined
            : new ResizeObserver(() => {
                if (area.clientWidth !== lastWidth) {
                  lastWidth = area.clientWidth;
                  autosize();
                }
              });
        observer?.observe(area);

        return {
          dom,
          stopEvent: (event) => event.target === area,
          ignoreMutation: () => true,
          update(updated) {
            if (updated.type !== current.type) {
              return false;
            }
            current = updated;
            show(String(updated.attrs.raw ?? ''));
            return true;
          },
          selectNode() {
            dom.classList.add('is-selected');
            // The text box needs its real width before it can measure its height.
            requestAnimationFrame(autosize);
          },
          deselectNode() {
            dom.classList.remove('is-selected');
          },
          destroy() {
            observer?.disconnect();
          },
        };
      };
    },
  });
}

/** HTML blocks such as `<details>`, `<div>` and `<!-- comments -->`. */
export const HtmlBlock = createRawBlock({ name: 'htmlBlock', tokenName: 'html', label: 'HTML' });

/** Link reference definitions such as `[docs]: https://example.com`. */
export const LinkDefinition = createRawBlock({
  name: 'linkDefinition',
  tokenName: 'def',
  label: 'Link definition',
});
