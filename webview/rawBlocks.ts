import { Node } from '@tiptap/core';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { highlightInto } from './highlightDom';
import { fillHtmlPreview } from './htmlPreview';

export interface RawBlockOptions {
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
  /** Text above the page copy when the block is selected, for example `HTML output`. */
  outputLabel?: string;
  /** Text above the text box when the block is selected, for example `HTML code`. */
  codeLabel?: string;
  /** A short name for a block whose page copy shows nothing and that stays one line until it is selected. */
  collapsedLabel?: (raw: string) => string | undefined;
  /** A tokenizer that finds the block in the Markdown. Without it, the node keeps a token that the Markdown parser makes. */
  tokenizer?: {
    name: string;
    level: 'block' | 'inline';
    start: (src: string) => number;
    tokenize: (src: string) => { type: string; raw: string; text: string } | undefined;
  };
  /** Show the text as the page shows it. The text box then opens when the block is selected. */
  render?: boolean;
}

export interface RawBlockOptionsForEditor {
  /** Map the address of an image or a video to one that the page can load. */
  resolveSrc: (src: string) => string;
}

/**
 * A block that the rich editor cannot show as rich text.
 * It keeps the original Markdown text and writes it back without a change.
 * The user can edit the text in a small text box.
 */
export function createRawBlock({
  name,
  tokenName,
  label,
  placeholder,
  language,
  outputLabel,
  codeLabel,
  collapsedLabel,
  tokenizer,
  render,
}: RawBlockOptions) {
  const labelOf = (raw: string): string => (typeof label === 'function' ? label(raw) : label);
  return Node.create<RawBlockOptionsForEditor>({
    name,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addOptions() {
      return { resolveSrc: (src: string) => src };
    },

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
      const { resolveSrc } = this.options;
      return ({ node, getPos, editor }) => {
        let current = node;

        const dom = document.createElement('div');
        dom.className = 'rme-raw';
        dom.classList.toggle('has-colors', Boolean(language));
        dom.contentEditable = 'false';

        const labelElement = document.createElement('span');
        labelElement.className = 'rme-raw-label';
        labelElement.textContent = labelOf(String(node.attrs.raw ?? ''));

        // The page shows the text itself. The text box opens when the block is selected, so it can be changed.
        const preview = render ? document.createElement('div') : undefined;

        // Put the cursor outside the selected block, so that its text box closes and the page shows the block again.
        const closeTextBox = (): void => {
          const view = editor.view;
          const { selection } = view.state;
          if (!(selection instanceof NodeSelection)) {
            return;
          }
          const { from, to } = selection;
          // The text before the block, then the text after it. A block alone in the file has neither.
          let next = Selection.near(view.state.doc.resolve(from), -1);
          if (next instanceof NodeSelection) {
            next = Selection.near(view.state.doc.resolve(to), 1);
          }
          view.dispatch(view.state.tr.setSelection(next));
        };

        // The summary of a details element opens and closes it. The page does it, so that it works the same in every
        // page, and the click does not select the block and open its text box.
        const onPreviewClick = (event: Event): void => {
          const summary = event.target instanceof Element ? event.target.closest('summary') : null;
          const owner = summary?.parentElement;
          if (summary && owner?.tagName === 'DETAILS') {
            event.preventDefault();
            owner.toggleAttribute('open', !owner.hasAttribute('open'));
          }
          // The click belongs to the page, and it closes the text box of a selected block with one click.
          closeTextBox();
        };
        if (preview) {
          preview.className = 'rme-raw-preview';
          preview.addEventListener('click', onPreviewClick);
        }
        // A click on the HTML that the page draws belongs to the page: it selects text or toggles a details element.
        // It must not select the block and open its text box.
        const inPreview = (target: EventTarget | null): boolean =>
          preview !== undefined && target instanceof Element && preview.contains(target);

        // A block whose page copy shows nothing, such as an HTML comment, stays one line until it is selected.
        const hiddenElement = document.createElement('span');
        hiddenElement.className = 'rme-raw-hidden';

        const divider = document.createElement('div');
        divider.className = 'rme-raw-divider';

        const codeLabelElement = document.createElement('span');
        codeLabelElement.className = 'rme-raw-code-label';

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
          area.setAttribute('aria-label', labelOf(raw));
          if (colors && language) {
            highlightInto(colors, language, raw);
          }
          let shown = false;
          if (preview) {
            // The copy in the page is made again, and the user should keep the details elements that they opened.
            const opened = [...preview.querySelectorAll('details')].map((element) => element.hasAttribute('open'));
            shown = fillHtmlPreview(preview, raw, { resolveSrc });
            [...preview.querySelectorAll('details')].forEach((element, index) => {
              // The first copy has no state of the user. The file then says which elements are open.
              if (index < opened.length && opened[index] !== element.hasAttribute('open')) {
                element.toggleAttribute('open', opened[index]);
              }
            });
            preview.hidden = !shown;
            dom.classList.toggle('has-preview', shown);
          }
          // A comment shows nothing in the page. It stays one line, and the text box opens when it is selected.
          const collapsed = !shown && collapsedLabel?.(raw) !== undefined;
          labelElement.textContent = shown && outputLabel ? outputLabel : labelOf(raw);
          codeLabelElement.textContent = codeLabel ?? labelOf(raw);
          hiddenElement.textContent = collapsed ? (collapsedLabel?.(raw) ?? '') : '';
          dom.classList.toggle('is-collapsed', collapsed);
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
        dom.append(labelElement, hiddenElement);
        if (preview) {
          dom.append(preview);
        }
        dom.append(divider, codeLabelElement, field);
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
          stopEvent: (event) => event.target === area || inPreview(event.target),
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

/**
 * Elements whose blank lines belong to the element: the page draws one element, and a cut at a blank line would draw
 * it in pieces. A wrapper such as `<div>` stays out, because the Markdown after its blank lines is still text of the
 * page.
 */
const WHOLE_ELEMENTS = new Set(['details', 'dl', 'table']);

/**
 * The whole element at the start of `src`, with the elements inside it, or undefined when the tag is not one of
 * `WHOLE_ELEMENTS` or has no end tag. The Markdown parser ends an HTML block at a blank line, which would cut the
 * element off from its content.
 */
function wholeElement(src: string): string | undefined {
  const start = /^ {0,3}<([a-z][\w-]*)\b/i.exec(src);
  const tag = start?.[1]?.toLowerCase();
  if (!tag || !WHOLE_ELEMENTS.has(tag)) {
    return undefined;
  }
  let depth = 0;
  for (const found of src.matchAll(new RegExp(`</?${tag}\\b`, 'gi'))) {
    if (found[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        // The match stops at the name of the tag. The element ends at the next `>`.
        const end = src.indexOf('>', (found.index ?? 0) + found[0].length);
        return end >= 0 ? src.slice(0, end + 1) : undefined;
      }
    } else {
      depth += 1;
    }
  }
  return undefined;
}

/**
 * Block-level elements of the GFM spec that the Markdown parser does not know. Without this, the parser keeps the tag
 * as inline HTML in a paragraph, and the lines after it become text of that paragraph.
 */
const UNKNOWN_BLOCK_TAGS = /^ {0,3}<\/?(?:source)(?=[\s/>]|$)/i;

/** The lines of an HTML block of a block-level element. The GFM spec ends it at a blank line. */
function linesUntilBlank(src: string): string {
  const blank = /\n[ \t]*\n/.exec(src);
  return (blank ? src.slice(0, blank.index) : src).replace(/\s+$/, '');
}

/** HTML blocks such as `<details>`, `<div>` and `<!-- comments -->`. */
export const HtmlBlock = createRawBlock({
  name: 'htmlBlock',
  tokenName: 'html',
  label: 'HTML',
  outputLabel: 'HTML output',
  codeLabel: 'HTML code',
  language: 'html',
  render: true,
  // A comment shows nothing in the page, so it stays one line until the user opens it.
  collapsedLabel: (raw) => (/^\s*<!--[\s\S]*-->\s*$/.test(raw) ? 'HTML comment' : undefined),
  tokenizer: {
    name: 'htmlBlockStart',
    level: 'block',
    // The block starts a line, never in the middle of a paragraph.
    start: () => -1,
    tokenize: (src: string) => {
      const raw = wholeElement(src) ?? (UNKNOWN_BLOCK_TAGS.test(src) ? linesUntilBlank(src) : undefined);
      return raw ? { type: 'html', raw, text: raw } : undefined;
    },
  },
});

/** Link reference definitions such as `[docs]: https://example.com`. */
export const LinkDefinition = createRawBlock({
  name: 'linkDefinition',
  tokenName: 'def',
  label: 'Link definition',
});
