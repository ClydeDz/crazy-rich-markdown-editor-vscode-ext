import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { REPLACE_KEY } from './shortcuts';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

interface Match {
  from: number;
  to: number;
}

interface FindState {
  query: string;
  caseSensitive: boolean;
  matches: Match[];
  activeIndex: number;
}

interface FindUpdate {
  query?: string;
  caseSensitive?: boolean;
  activeIndex?: number;
}

export const FIND_SHORTCUT_EVENT = 'rme-find-shortcut';

const findKey = new PluginKey<FindState>('rmeFindReplace');

function findMatches(doc: ProseMirrorNode, query: string, caseSensitive: boolean): Match[] {
  if (!query) {
    return [];
  }
  const wanted = caseSensitive ? query : query.toLocaleLowerCase();
  const matches: Match[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }
    const text = caseSensitive ? node.text : node.text.toLocaleLowerCase();
    let offset = 0;
    while ((offset = text.indexOf(wanted, offset)) >= 0) {
      matches.push({ from: pos + offset, to: pos + offset + query.length });
      offset += query.length;
    }
  });
  return matches;
}

function clampIndex(index: number, length: number): number {
  return length === 0 ? 0 : ((index % length) + length) % length;
}

function updateFindState(editor: Editor, update: FindUpdate): void {
  const current = findKey.getState(editor.state);
  if (!current) {
    return;
  }
  const query = update.query ?? current.query;
  const caseSensitive = update.caseSensitive ?? current.caseSensitive;
  const matches = findMatches(editor.state.doc, query, caseSensitive);
  const activeIndex = clampIndex(update.activeIndex ?? current.activeIndex, matches.length);
  editor.view.dispatch(editor.state.tr.setMeta(findKey, { query, caseSensitive, activeIndex } satisfies FindUpdate));
}

function selectMatch(editor: Editor, index: number): void {
  const state = findKey.getState(editor.state);
  if (!state || state.matches.length === 0) {
    return;
  }
  const activeIndex = clampIndex(index, state.matches.length);
  const match = state.matches[activeIndex];
  editor.view.dispatch(
    editor.state.tr
      .setSelection(TextSelection.create(editor.state.doc, match.from, match.to))
      .setMeta(findKey, { activeIndex } satisfies FindUpdate)
      .scrollIntoView(),
  );
}

function replaceActive(editor: Editor, replacement: string): void {
  const state = findKey.getState(editor.state);
  const match = state?.matches[state.activeIndex];
  if (!state || !match) {
    return;
  }
  const transaction = editor.state.tr.insertText(replacement, match.from, match.to);
  transaction.setMeta(findKey, { activeIndex: state.activeIndex } satisfies FindUpdate);
  editor.view.dispatch(transaction);
}

function replaceAll(editor: Editor, replacement: string): void {
  const state = findKey.getState(editor.state);
  if (!state || state.matches.length === 0) {
    return;
  }
  const transaction = editor.state.tr;
  for (const match of [...state.matches].reverse()) {
    transaction.insertText(replacement, match.from, match.to);
  }
  transaction.setMeta(findKey, { activeIndex: 0 } satisfies FindUpdate);
  editor.view.dispatch(transaction);
}

export const FindReplace = Extension.create({
  name: 'rmeFindReplace',
  addKeyboardShortcuts() {
    const request = (mode: 'find' | 'replace') => {
      window.dispatchEvent(new CustomEvent(FIND_SHORTCUT_EVENT, { detail: mode }));
      return true;
    };
    return {
      'Mod-f': () => request('find'),
      [REPLACE_KEY]: () => request('replace'),
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ query: '', caseSensitive: false, matches: [], activeIndex: 0 }),
          apply(transaction, previous) {
            const update = transaction.getMeta(findKey) as FindUpdate | undefined;
            if (!update && !transaction.docChanged) {
              return previous;
            }
            const query = update?.query ?? previous.query;
            const caseSensitive = update?.caseSensitive ?? previous.caseSensitive;
            const matches = findMatches(transaction.doc, query, caseSensitive);
            return {
              query,
              caseSensitive,
              matches,
              activeIndex: clampIndex(update?.activeIndex ?? previous.activeIndex, matches.length),
            };
          },
        },
        props: {
          decorations(state) {
            const current = findKey.getState(state);
            if (!current) {
              return DecorationSet.empty;
            }
            return DecorationSet.create(
              state.doc,
              current.matches.map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class: index === current.activeIndex ? 'rme-find-match rme-find-match-active' : 'rme-find-match',
                }),
              ),
            );
          },
        },
      }),
    ];
  },
});

export interface FindReplaceBar {
  destroy(): void;
}

/** Create the find and replace bar. Matches are limited to editable text in the Markdown body. */
export function createFindReplaceBar(editor: Editor): FindReplaceBar {
  const bar = document.createElement('section');
  bar.className = 'rme-find-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'search');
  bar.setAttribute('aria-label', 'Find and replace');

  const findInput = document.createElement('input');
  findInput.className = 'rme-find-input';
  findInput.type = 'search';
  findInput.placeholder = 'Find';
  findInput.setAttribute('aria-label', 'Find');

  const replaceInput = document.createElement('input');
  replaceInput.className = 'rme-find-input rme-replace-input';
  replaceInput.type = 'text';
  replaceInput.placeholder = 'Replace';
  replaceInput.setAttribute('aria-label', 'Replace');

  const count = document.createElement('span');
  count.className = 'rme-find-count';
  count.setAttribute('aria-live', 'polite');

  const makeButton = (label: string, title: string, action: () => void): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rme-find-button';
    button.textContent = label;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', action);
    return button;
  };

  const caseButton = makeButton('Aa', 'Match case', () => {
    const state = findKey.getState(editor.state);
    updateFindState(editor, { caseSensitive: !state?.caseSensitive, activeIndex: 0 });
  });
  caseButton.setAttribute('aria-pressed', 'false');
  caseButton.dataset.action = 'case';

  const previous = makeButton('↑', 'Previous match', () => {
    const state = findKey.getState(editor.state);
    if (state) selectMatch(editor, state.activeIndex - 1);
  });
  previous.dataset.action = 'previous';
  const next = makeButton('↓', 'Next match', () => {
    const state = findKey.getState(editor.state);
    if (state) selectMatch(editor, state.activeIndex + 1);
  });
  next.dataset.action = 'next';
  const replace = makeButton('Replace', 'Replace current match', () => replaceActive(editor, replaceInput.value));
  replace.dataset.action = 'replace';
  const replaceEvery = makeButton('All', 'Replace all matches', () => replaceAll(editor, replaceInput.value));
  replaceEvery.dataset.action = 'replace-all';
  const close = makeButton('×', 'Close find and replace', () => closeBar());
  close.dataset.action = 'close';

  const findRow = document.createElement('div');
  findRow.className = 'rme-find-row';
  findRow.append(findInput, count, caseButton, previous, next, close);
  const replaceRow = document.createElement('div');
  replaceRow.className = 'rme-find-row rme-replace-row';
  replaceRow.append(replaceInput, replace, replaceEvery);
  bar.append(findRow, replaceRow);
  document.body.append(bar);

  let replaceShown = false;
  const render = (): void => {
    const state = findKey.getState(editor.state);
    if (!state) {
      return;
    }
    count.textContent =
      state.matches.length === 0 ? 'No results' : `${state.activeIndex + 1} of ${state.matches.length}`;
    caseButton.setAttribute('aria-pressed', String(state.caseSensitive));
    bar.classList.toggle('has-replace', replaceShown);
  };

  const openBar = (mode: 'find' | 'replace'): void => {
    replaceShown = mode === 'replace' || replaceShown;
    const state = findKey.getState(editor.state);
    if (state?.query === '') {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        const selected = editor.state.doc.textBetween(from, to, '\n');
        if (selected && !selected.includes('\n')) {
          findInput.value = selected;
          updateFindState(editor, { query: selected, activeIndex: 0 });
        }
      }
    }
    bar.hidden = false;
    render();
    (mode === 'replace' ? replaceInput : findInput).focus();
    if (mode === 'find') {
      findInput.select();
    }
  };

  function closeBar(): void {
    bar.hidden = true;
    editor.commands.focus();
  }

  const onShortcut = (event: Event): void => {
    const mode = (event as CustomEvent<'find' | 'replace'>).detail;
    if (mode === 'find' || mode === 'replace') {
      openBar(mode);
    }
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!bar.hidden && event.key === 'Escape' && event.target instanceof Node && bar.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
      closeBar();
      return;
    }
    if (event.shiftKey) {
      return;
    }
    const key = event.key.toLowerCase();
    const isMac = /Mac/.test(navigator.platform);
    if (isMac ? !event.metaKey : !(event.metaKey || event.ctrlKey) || event.altKey) {
      return;
    }
    const mode =
      key === 'f' && (isMac ? event.metaKey && event.altKey : (event.metaKey || event.ctrlKey) && !event.altKey)
        ? isMac && event.altKey
          ? 'replace'
          : 'find'
        : key === 'h' && !isMac && event.ctrlKey && !event.altKey
          ? 'replace'
          : undefined;
    if (!mode) return;
    event.preventDefault();
    event.stopPropagation();
    openBar(mode);
  };

  findInput.addEventListener('input', () => updateFindState(editor, { query: findInput.value, activeIndex: 0 }));
  findInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const state = findKey.getState(editor.state);
      if (state) selectMatch(editor, state.activeIndex + (event.shiftKey ? -1 : 1));
    }
  });
  editor.on('transaction', render);
  window.addEventListener(FIND_SHORTCUT_EVENT, onShortcut);
  window.addEventListener('keydown', onKeyDown, true);
  render();

  return {
    destroy() {
      editor.off('transaction', render);
      window.removeEventListener(FIND_SHORTCUT_EVENT, onShortcut);
      window.removeEventListener('keydown', onKeyDown, true);
      bar.remove();
    },
  };
}
