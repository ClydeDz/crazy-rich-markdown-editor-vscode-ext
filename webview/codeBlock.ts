import { isNodeActive } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { EditorState, TextSelection, Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { icons } from './icons';
import { drawInto, isDrawable } from './diagrams';
import { highlighter, languageLabel, languageName } from './languages';
import { closeLanguagePicker, openLanguagePicker } from './languagePicker';
import { LineGroup, replaceSelectedLines } from './selectedLines';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    diagram: {
      /** Make the selected lines one diagram. It is a code block in the language `mermaid`. */
      setDiagram: () => ReturnType;
    };
  }
}

const TAB = '\t';

/**
 * Tab and Shift+Tab in a code block.
 * - Tab with a cursor or a selection inside one line: replaces the selection with a tab.
 * - Tab with a selection over several lines: puts a tab at the start of each line.
 * - Shift+Tab: takes one tab, or up to two spaces, from the start of each line that the selection touches.
 * It always handles the key, so the focus stays in the code.
 */
function indentCode(view: EditorView, outdent: boolean): boolean {
  const { state } = view;
  const { $from, $to, from, to } = state.selection;
  if ($from.parent.type.name !== 'codeBlock' || $to.parent !== $from.parent) {
    return false;
  }
  const blockStart = $from.start();
  const text = $from.parent.textContent;
  const lineStart = (offset: number): number => text.lastIndexOf('\n', offset - 1) + 1;
  const first = lineStart(from - blockStart);
  const tr = state.tr;
  const multiLine = text.slice(from - blockStart, to - blockStart).includes('\n');

  if (!outdent && !multiLine) {
    view.dispatch(tr.insertText(TAB, from, to).scrollIntoView());
    return true;
  }

  // The start of each line that the selection touches. A line that starts where the selection ends is not touched.
  const end = to - blockStart;
  const lines = [first];
  for (let at = text.indexOf('\n', first); at !== -1 && at + 1 < end; at = text.indexOf('\n', at + 1)) {
    lines.push(at + 1);
  }
  // The last line goes first, so that the places of the lines before it do not move.
  for (const start of [...lines].reverse()) {
    const place = blockStart + start;
    if (!outdent) {
      tr.insertText(TAB, place);
      continue;
    }
    const lead = text.slice(start).match(/^(?:\t| {1,2})/)?.[0].length ?? 0;
    if (lead) {
      tr.delete(place, place + lead);
    }
  }
  const selection = TextSelection.create(tr.doc, tr.mapping.map(from, -1), tr.mapping.map(to, 1));
  view.dispatch(tr.setSelection(selection).scrollIntoView());
  return true;
}

/** The longest run of backticks in the text. */
function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) {
    longest = Math.max(longest, run.length);
  }
  return longest;
}

/**
 * A code block with colors and a language picker.
 * The language is the text after the opening fence, for example ```ts.
 */
export const RichCodeBlock = CodeBlockLowlight.extend({
  // Tiptap binds the code block to Cmd+Alt+C, which VS Code uses for Copy Path of Active File. FormatKeymap binds the key of
  // FORMAT_KEYS instead. The other keys of the extension stay: Tab, Enter, Backspace and the arrows.
  addKeyboardShortcuts() {
    const { 'Mod-Alt-c': _tiptapKey, ...others } = this.parent?.() ?? {};
    return {
      ...others,
      // Tab types a tab in the code, and Shift+Tab takes one away. Without these keys, the browser moves the focus.
      Tab: () => this.editor.isActive(this.name) && indentCode(this.editor.view, false),
      'Shift-Tab': () => this.editor.isActive(this.name) && indentCode(this.editor.view, true),
    };
  },

  addCommands() {
    const parentCommands = this.parent?.();
    const makeBlock = (state: EditorState, attributes: Record<string, any> | undefined, group: LineGroup): ProseNode =>
      this.type.create(attributes, group.text ? state.schema.text(group.text) : undefined);
    const selectInside = (tr: Transaction, place: number, offset?: number): void => {
      const start = place + 1;
      const length = tr.doc.nodeAt(place)?.content.size ?? 0;
      // A cursor keeps its place in the line. A selection covers the new block.
      tr.setSelection(
        offset === undefined
          ? TextSelection.create(tr.doc, start, start + length)
          : TextSelection.create(tr.doc, start + Math.min(offset, length)),
      );
    };

    return {
      ...parentCommands,

      // All selected lines go in one code block. The default command makes one code block for each line.
      toggleCodeBlock:
        (attributes) =>
        (props) => {
          if (!isNodeActive(props.state, this.name)) {
            const replaced = replaceSelectedLines(props, 'source', (group) => makeBlock(props.state, attributes, group));
            if (replaced) {
              selectInside(props.tr, replaced.place, replaced.groups === 1 ? replaced.cursorOffset : undefined);
              return true;
            }
          }
          return parentCommands!.toggleCodeBlock!(attributes)(props);
        },

      setDiagram:
        () =>
        (props) => {
          const replaced = replaceSelectedLines(props, 'source', (group) =>
            makeBlock(props.state, { language: 'mermaid' }, group),
          );
          if (!replaced) {
            return false;
          }
          selectInside(props.tr, replaced.place);
          return true;
        },
    };
  },

  // A fence must be longer than any run of backticks in the code.
  renderMarkdown(node, h) {
    const language = node.attrs?.language || '';
    const code = node.content ? h.renderChildren(node.content) : '';
    const fence = '`'.repeat(Math.max(3, longestBacktickRun(code) + 1));
    return [`${fence}${language}`, code, fence].join('\n');
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;

      const dom = document.createElement('div');
      dom.className = 'rme-code';

      const header = document.createElement('div');
      header.className = 'rme-code-header';
      header.contentEditable = 'false';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rme-code-lang';
      button.title = 'Change the code language';
      button.setAttribute('aria-haspopup', 'dialog');
      // Keep the cursor in the code when the user clicks the button.
      button.addEventListener('mousedown', (event) => event.preventDefault());

      const label = document.createElement('span');
      const chevron = document.createElement('span');
      chevron.className = 'rme-code-chevron';
      chevron.innerHTML = icons.chevronDown;
      button.append(label, chevron);
      header.append(button);

      const pre = document.createElement('pre');
      const code = document.createElement('code');
      pre.append(code);

      // A block in the language `mermaid` or `math` also shows the picture that its text makes.
      const preview = document.createElement('div');
      preview.className = 'rme-code-preview';
      preview.contentEditable = 'false';
      preview.hidden = true;
      dom.append(header, pre, preview);

      let drawToken = 0;
      let drawTimer: number | undefined;
      let drawnKey = '';
      const refreshPreview = (): void => {
        const language = languageName(current.attrs.language).toLowerCase();
        if (!isDrawable(language)) {
          preview.hidden = true;
          preview.replaceChildren();
          drawnKey = '';
          return;
        }
        const key = `${language}\n${current.textContent}`;
        if (key === drawnKey) {
          return;
        }
        drawnKey = key;
        preview.hidden = false;
        window.clearTimeout(drawTimer);
        const token = ++drawToken;
        drawTimer = window.setTimeout(() => {
          void drawInto(preview, language, current.textContent, () => token === drawToken);
        }, 250);
      };

      const show = (): void => {
        const language = (current.attrs.language as string | null) ?? '';
        label.textContent = languageLabel(language);
        dom.dataset.language = language;
        dom.classList.toggle('has-language', language !== '');
        button.setAttribute('aria-label', `Code language: ${languageLabel(language)}`);
        refreshPreview();
      };
      show();

      button.addEventListener('click', () => {
        const pos = getPos();
        if (pos === undefined) {
          return;
        }
        openLanguagePicker({
          anchor: button,
          current: current.attrs.language,
          onSelect: (language) => {
            const at = getPos();
            if (at === undefined) {
              return;
            }
            editor.view.dispatch(
              editor.state.tr.setNodeMarkup(at, undefined, { ...current.attrs, language: language || null }),
            );
            editor.view.focus();
          },
          onClose: () => dom.classList.remove('is-picking'),
        });
        dom.classList.add('is-picking');
      });

      return {
        dom,
        contentDOM: code,
        update(updated) {
          if (updated.type !== current.type) {
            return false;
          }
          current = updated;
          show();
          return true;
        },
        stopEvent: (event) => header.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) => (mutation.type === 'selection' ? false : !code.contains(mutation.target)),
        destroy: () => {
          window.clearTimeout(drawTimer);
          drawToken++;
          closeLanguagePicker();
        },
      };
    };
  },
}).configure({
  lowlight: highlighter,
  defaultLanguage: null,
});
