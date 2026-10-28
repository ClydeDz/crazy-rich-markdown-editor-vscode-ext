import { InputRule, Node } from '@tiptap/core';
import katex from 'katex';
import { NodeSelection } from '@tiptap/pm/state';
import { replaceSelectedLines } from './selectedLines';
export { looksLikeMath } from './markdownText';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    math: {
      /** Insert a block with a math expression and open it for editing. */
      insertMathBlock: (tex?: string) => ReturnType;
      /** Make the selected lines one math block. Their text is the TeX. The block opens for editing. */
      setMathBlock: () => ReturnType;
    };
  }
}

export interface RenderedMath {
  html: string;
  error?: string;
}

/** Draw TeX with KaTeX. A TeX error gives the message and no HTML. */
export function renderMath(tex: string, display: boolean): RenderedMath {
  try {
    return {
      html: katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: 'ignore', trust: false }),
    };
  } catch (error) {
    return { html: '', error: error instanceof Error ? error.message : String(error) };
  }
}

// GitHub writes math as $x$ or $`x`$ inside a line, and as $$ ... $$ or a `math` code block.
// An opening dollar needs a character that is not a space after it. A closing dollar needs one before it,
// and no digit after it. This is the rule that GitHub and Pandoc use, so "$5 and $6" is not math.
const INLINE_DOLLAR = /^\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/;
const INLINE_BACKTICK = /^\$`([^`\n]+?)`\$/;
const BLOCK_MULTI_LINE = /^\$\$[ \t]*\n([\s\S]*?)\n[ \t]*\$\$[ \t]*(?:\n|$)/;
const BLOCK_ONE_LINE = /^\$\$(?!\$)([^\n]+?)\$\$[ \t]*(?:\n|$)/;

function autosize(area: HTMLTextAreaElement): void {
  area.style.height = 'auto';
  if (area.scrollHeight > 0) {
    area.style.height = `${area.scrollHeight}px`;
  }
}

/** An expression inside a line, such as $E = mc^2$. Click it to edit the TeX. */
export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { tex: { default: '' }, backtick: { default: false } };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-math-inline]',
        getAttrs: (el) => ({ tex: (el as HTMLElement).getAttribute('data-tex') ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['span', { class: 'rme-math', 'data-math-inline': '', 'data-tex': node.attrs.tex }, `$${node.attrs.tex}$`];
  },

  markdownTokenName: 'mathInline',

  markdownTokenizer: {
    name: 'mathInline',
    level: 'inline',
    start(src: string) {
      return src.indexOf('$');
    },
    tokenize(src: string): any {
      const backtick = INLINE_BACKTICK.exec(src);
      if (backtick) {
        return { type: 'mathInline', raw: backtick[0], tex: backtick[1], backtick: true };
      }
      if (src.startsWith('$$')) {
        return undefined;
      }
      const dollar = INLINE_DOLLAR.exec(src);
      return dollar ? { type: 'mathInline', raw: dollar[0], tex: dollar[1], backtick: false } : undefined;
    },
  } as any,

  parseMarkdown(token: any, helpers: any) {
    return helpers.createNode('mathInline', { tex: token.tex, backtick: Boolean(token.backtick) });
  },

  renderMarkdown(node) {
    const tex = String(node.attrs?.tex ?? '');
    return node.attrs?.backtick ? `$\`${tex}\`$` : `$${tex}$`;
  },

  addInputRules() {
    return [
      new InputRule({
        // The closing dollar of $...$ that the user types.
        find: /\$([^\s$](?:[^$]*[^\s$])?)\$$/,
        handler: ({ state, range, match }) => {
          const before = range.from > 0 ? state.doc.textBetween(range.from - 1, range.from) : '';
          if (/[\p{L}\p{N}\\]/u.test(before)) {
            return null;
          }
          const code = state.schema.marks.code;
          if (code && state.doc.rangeHasMark(range.from, range.to, code)) {
            return null;
          }
          state.tr.replaceWith(range.from, range.to, this.type.create({ tex: match[1], backtick: false }));
          return undefined;
        },
      }),
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      let editing = false;

      const dom = document.createElement('span');
      dom.className = 'rme-math';
      dom.contentEditable = 'false';

      const view = document.createElement('span');
      view.className = 'rme-math-view';
      const input = document.createElement('input');
      input.className = 'rme-math-input';
      input.type = 'text';
      input.spellcheck = false;
      input.hidden = true;
      input.setAttribute('aria-label', 'TeX');
      dom.append(view, input);

      const show = (): void => {
        const tex = String(current.attrs.tex ?? '');
        const { html, error } = renderMath(tex, false);
        dom.classList.toggle('is-error', Boolean(error));
        dom.title = error ?? '';
        if (error) {
          view.textContent = `$${tex}$`;
        } else {
          view.innerHTML = html;
        }
      };
      show();

      const commit = (): void => {
        const pos = getPos();
        if (pos === undefined) {
          return;
        }
        const tex = input.value.trim();
        if (tex === '') {
          editor.view.dispatch(editor.state.tr.delete(pos, pos + current.nodeSize));
        } else if (tex !== current.attrs.tex) {
          editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, tex }));
        }
      };

      const leave = (): void => {
        const pos = getPos();
        if (pos !== undefined) {
          editor
            .chain()
            .focus()
            .setTextSelection(pos + current.nodeSize)
            .run();
        }
      };

      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          leave();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          input.value = String(current.attrs.tex ?? '');
          leave();
        }
      });
      input.addEventListener('input', () => {
        input.size = Math.max(4, input.value.length + 1);
      });
      input.addEventListener('blur', () => {
        if (editing) {
          commit();
        }
      });

      return {
        dom,
        stopEvent: (event) => event.target === input,
        ignoreMutation: () => true,
        update(updated) {
          if (updated.type !== current.type) {
            return false;
          }
          current = updated;
          if (!editing) {
            show();
          }
          return true;
        },
        selectNode() {
          editing = true;
          dom.classList.add('is-editing');
          view.hidden = true;
          input.hidden = false;
          input.value = String(current.attrs.tex ?? '');
          input.size = Math.max(4, input.value.length + 1);
          requestAnimationFrame(() => {
            input.focus();
            input.select();
          });
        },
        deselectNode() {
          editing = false;
          dom.classList.remove('is-editing');
          input.hidden = true;
          view.hidden = false;
          show();
        },
        destroy() {
          editing = false;
        },
      };
    };
  },
});

/** A block with a math expression, written $$ ... $$. Click it to edit the TeX. */
export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { tex: { default: '' }, oneLine: { default: false } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-math-block]',
        getAttrs: (el) => ({ tex: (el as HTMLElement).getAttribute('data-tex') ?? '' }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'div',
      { class: 'rme-math-block', 'data-math-block': '', 'data-tex': node.attrs.tex },
      `$$${node.attrs.tex}$$`,
    ];
  },

  markdownTokenName: 'mathBlock',

  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block',
    start(src: string) {
      return src.search(/^\$\$/m);
    },
    tokenize(src: string): any {
      const multi = BLOCK_MULTI_LINE.exec(src);
      if (multi) {
        return { type: 'mathBlock', raw: multi[0], tex: multi[1], oneLine: false };
      }
      const one = BLOCK_ONE_LINE.exec(src);
      return one ? { type: 'mathBlock', raw: one[0], tex: one[1].trim(), oneLine: true } : undefined;
    },
  } as any,

  parseMarkdown(token: any, helpers: any) {
    return helpers.createNode('mathBlock', { tex: token.tex, oneLine: Boolean(token.oneLine) });
  },

  renderMarkdown(node) {
    const tex = String(node.attrs?.tex ?? '');
    return node.attrs?.oneLine ? `$$${tex}$$` : `$$\n${tex}\n$$`;
  },

  addCommands() {
    return {
      insertMathBlock:
        (tex = 'x^2 + y^2 = z^2') =>
        ({ state, dispatch, tr }) => {
          if (!dispatch) {
            return true;
          }
          tr.replaceSelectionWith(state.schema.nodes.mathBlock.create({ tex, oneLine: false }));
          // Select the new block. It opens for editing. The block is the last one with this TeX before the cursor.
          let blockPos = -1;
          tr.doc.descendants((child, pos) => {
            if (child.type.name === 'mathBlock' && child.attrs.tex === tex && pos <= tr.selection.from) {
              blockPos = pos;
            }
          });
          if (blockPos >= 0) {
            tr.setSelection(NodeSelection.create(tr.doc, blockPos));
          }
          dispatch(tr.scrollIntoView());
          return true;
        },

      setMathBlock: () => (props) => {
        const { state, tr } = props;
        const replaced = replaceSelectedLines(props, 'tex', (group) =>
          state.schema.nodes.mathBlock.create({ tex: group.text, oneLine: false }),
        );
        if (!replaced) {
          return false;
        }
        tr.setSelection(NodeSelection.create(tr.doc, replaced.place)).scrollIntoView();
        return true;
      },
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;
      let editing = false;

      const dom = document.createElement('div');
      dom.className = 'rme-math-block';
      dom.contentEditable = 'false';

      const view = document.createElement('div');
      view.className = 'rme-math-view';
      const area = document.createElement('textarea');
      area.className = 'rme-math-input';
      area.spellcheck = false;
      area.rows = 1;
      area.hidden = true;
      area.setAttribute('aria-label', 'TeX');
      dom.append(view, area);

      const show = (): void => {
        const tex = String(current.attrs.tex ?? '');
        const { html, error } = renderMath(tex, true);
        dom.classList.toggle('is-error', Boolean(error));
        if (error) {
          view.textContent = error;
        } else {
          view.innerHTML = html;
        }
      };
      show();

      const commit = (): void => {
        const pos = getPos();
        if (pos === undefined) {
          return;
        }
        const tex = area.value.replace(/^\n+|\s+$/g, '');
        if (tex !== current.attrs.tex) {
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, tex, oneLine: false }),
          );
        }
      };

      area.addEventListener('input', () => autosize(area));
      area.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
          // Type a tab. Without this, the key moves the focus out of the formula.
          event.preventDefault();
          event.stopPropagation();
          area.setRangeText('\t', area.selectionStart, area.selectionEnd, 'end');
          autosize(area);
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          area.value = String(current.attrs.tex ?? '');
          const pos = getPos();
          if (pos !== undefined) {
            editor
              .chain()
              .focus()
              .setTextSelection(pos + current.nodeSize)
              .run();
          }
        }
      });
      area.addEventListener('blur', () => {
        if (editing) {
          commit();
        }
      });

      return {
        dom,
        stopEvent: (event) => event.target === area,
        ignoreMutation: () => true,
        update(updated) {
          if (updated.type !== current.type) {
            return false;
          }
          current = updated;
          if (!editing) {
            show();
          }
          return true;
        },
        selectNode() {
          editing = true;
          dom.classList.add('is-editing');
          area.hidden = false;
          area.value = String(current.attrs.tex ?? '');
          requestAnimationFrame(() => {
            autosize(area);
            area.focus();
          });
        },
        deselectNode() {
          editing = false;
          dom.classList.remove('is-editing');
          area.hidden = true;
          show();
        },
        destroy() {
          editing = false;
        },
      };
    };
  },
});
