import type { Editor } from '@tiptap/core';
import { emojiFor } from './emoji';

export interface DocumentStats {
  /** Lines in the Markdown file. */
  lines: number;
  /** Words in the text of the document. */
  words: number;
  /** Characters in the text of the document, with spaces. A line break does not count. */
  characters: number;
  /** Characters in the text of the document, without spaces. */
  charactersWithoutSpaces: number;
}

const LINE_BREAK = /\r\n|\r|\n/g;
const WORD_PART = /[\p{L}\p{N}]/u;
/** Chinese, Japanese and Korean text has no spaces between words. Each of these letters counts as a word. */
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;

/** The number of lines in a file. A last line break does not start a new line. */
export function countLines(text: string): number {
  if (text === '') {
    return 0;
  }
  const breaks = text.match(LINE_BREAK)?.length ?? 0;
  return /[\r\n]$/.test(text) ? breaks : breaks + 1;
}

/**
 * The number of words. Spaces and line breaks separate words, and a word needs a letter or a digit.
 * So `e-mail` is one word, and a lone `-` or `—` is none.
 */
export function countWords(text: string): number {
  let words = 0;
  for (const token of text.split(/\s+/)) {
    if (!WORD_PART.test(token)) {
      continue;
    }
    const cjk = token.match(CJK)?.length ?? 0;
    const others = token
      .replace(CJK, ' ')
      .split(/\s+/)
      .filter((part) => WORD_PART.test(part)).length;
    words += cjk + others;
  }
  return words;
}

/** The number of characters. An emoji or a letter with an accent counts as one. A line break does not count. */
export function countCharacters(text: string, options: { spaces: boolean } = { spaces: true }): number {
  let count = 0;
  for (const char of text) {
    if (char === '\n' || char === '\r' || (!options.spaces && /\s/.test(char))) {
      continue;
    }
    count++;
  }
  return count;
}

/** The text that a reader sees in the document. Blocks are separated by a line break. */
export function proseText(editor: Editor): string {
  const { doc } = editor.state;
  return doc.textBetween(0, doc.content.size, '\n', (leaf) => {
    switch (leaf.type.name) {
      case 'hardBreak':
        return '\n';
      case 'emoji':
        return emojiFor(String(leaf.attrs.name)) ?? '';
      default:
        return '';
    }
  });
}

/** `file` is the text of the Markdown file. `prose` is the text that the reader sees. */
export function documentStats(file: string, prose: string): DocumentStats {
  return {
    lines: countLines(file),
    words: countWords(prose),
    characters: countCharacters(prose),
    charactersWithoutSpaces: countCharacters(prose, { spaces: false }),
  };
}

/** A person who changed the file, with the newest commit of that person. */
export interface FileAuthor {
  name: string;
  /** The time of the commit, in milliseconds since 1970. */
  date: number;
  subject: string;
}

/** What the host knows about the file. */
export interface FileInfo {
  /** When the file was last saved to disk, in milliseconds since 1970. */
  modified?: number;
  /** The people who changed the file in the last Git commits, newest first. */
  authors?: FileAuthor[];
}

/** The bar names this many authors. It shows the number of the others as `+2`. */
export const SHOWN_AUTHORS = 3;
const SUBJECT_LENGTH = 80;

export interface StatsBarOptions {
  /** Runs when the user clicks the settings button at the end of the bar. */
  onOpenSettings?: () => void;
  /** Runs when the user clicks the shortcuts button, next to the settings button. */
  onOpenShortcuts?: () => void;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** A gear in a 16 by 16 box. The hole in the middle needs the `evenodd` fill rule. */
const GEAR_PATH =
  'M13.45 6.69L15.14 7.04L15.14 8.96L13.45 9.31L12.77 10.93L13.72 12.37L12.37 13.72L10.93 12.77L9.31 13.45L8.96 15.14L7.04 15.14L6.69 13.45L5.07 12.77L3.63 13.72L2.28 12.37L3.23 10.93L2.55 9.31L0.86 8.96L0.86 7.04L2.55 6.69L3.23 5.07L2.28 3.63L3.63 2.28L5.07 3.23L6.69 2.55L7.04 0.86L8.96 0.86L9.31 2.55L10.93 3.23L12.37 2.28L13.72 3.63L12.77 5.07ZM10.3 8a2.3 2.3 0 1 0 -4.6 0a2.3 2.3 0 1 0 4.6 0Z';
/** The keys of a keyboard in a 16 by 16 box: two rows of four keys and a space bar. */
const KEYS_PATH =
  'M3.5 6h1.2v1.2H3.5zM5.9 6h1.2v1.2H5.9zM8.3 6h1.2v1.2H8.3zM10.7 6h1.2v1.2h-1.2zM3.5 8.2h1.2v1.2H3.5zM5.9 8.2h1.2v1.2H5.9zM8.3 8.2h1.2v1.2H8.3zM10.7 8.2h1.2v1.2h-1.2zM4.6 10.4h6.8v1H4.6z';

/** A part of an icon: the name of the SVG element and its attributes. */
type IconPart = [element: string, attributes: Record<string, string>];

const GEAR: IconPart[] = [['path', { d: GEAR_PATH, 'fill-rule': 'evenodd' }]];
const KEYBOARD: IconPart[] = [
  ['rect', { x: '1', y: '3.5', width: '14', height: '9', rx: '1.5', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2' }],
  ['path', { d: KEYS_PATH }],
];

const SETTINGS_LABEL = 'Open the extension settings';
const SHORTCUTS_LABEL = 'Show the keyboard shortcuts';

export interface StatsBar {
  update(stats: DocumentStats): void;
  updateFile(info: FileInfo): void;
  /** Show the bar. It stays hidden while the user has it turned off. */
  show(): void;
  /** Turn the bar on or off (the setting `crazyRichMarkdown.showInfoBar`). */
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
}

/** Show the numbers in a bar. The bar stays empty and hidden until `show` runs. */
export function createStatsBar(element: HTMLElement, options: StatsBarOptions = {}): StatsBar {
  const format = new Intl.NumberFormat();
  const dayAndTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const fullDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'medium' });
  const count = (value: number, one: string, many: string): string =>
    `${format.format(value)} ${value === 1 ? one : many}`;

  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', 'Document statistics');

  const make = (name: string, hidden = false): HTMLSpanElement => {
    const item = document.createElement('span');
    item.className = 'rme-stat';
    item.dataset.stat = name;
    item.hidden = hidden;
    return item;
  };
  // The facts about the file come first. They are missing until the host sends them, and when the file has none.
  const authors = make('authors', true);
  const modified = make('modified', true);
  const lines = make('lines');
  const words = make('words');
  const characters = make('characters');

  // The buttons come last. The user opens the shortcuts or the settings of the extension here, without a search.
  const makeButton = (action: string, text: string, label: string, icon: IconPart[], onClick: (() => void) | undefined): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rme-stats-button';
    button.dataset.action = action;
    button.title = label;
    button.setAttribute('aria-label', label);
    const picture = document.createElementNS(SVG_NAMESPACE, 'svg');
    picture.setAttribute('viewBox', '0 0 16 16');
    picture.setAttribute('aria-hidden', 'true');
    picture.setAttribute('focusable', 'false');
    for (const [name, attributes] of icon) {
      const part = document.createElementNS(SVG_NAMESPACE, name);
      for (const [key, value] of Object.entries(attributes)) {
        part.setAttribute(key, value);
      }
      picture.append(part);
    }
    const words = document.createElement('span');
    words.className = 'rme-stats-button-label';
    words.textContent = text;
    button.append(picture, words);
    button.addEventListener('click', () => onClick?.());
    return button;
  };
  const shortcuts = makeButton('shortcuts', 'Shortcuts', SHORTCUTS_LABEL, KEYBOARD, options.onOpenShortcuts);
  shortcuts.setAttribute('aria-haspopup', 'dialog');
  const settings = makeButton('settings', 'Settings', SETTINGS_LABEL, GEAR, options.onOpenSettings);

  element.replaceChildren(authors, modified, lines, words, characters, shortcuts, settings);

  let enabled = true;
  let ready = false;
  const sync = (): void => {
    element.hidden = !(enabled && ready);
    // A page without the bar does not keep room for it above a heading that a link scrolls to.
    element.ownerDocument.documentElement.classList.toggle('rme-no-bar', !enabled);
  };

  let shownFile = '';
  let shown = '';
  return {
    setEnabled(value) {
      enabled = value;
      sync();
    },
    isEnabled: () => enabled,
    updateFile(info) {
      const list = info.authors ?? [];
      const key = JSON.stringify([info.modified, list]);
      if (key === shownFile) {
        return;
      }
      shownFile = key;

      const hasTime = typeof info.modified === 'number' && Number.isFinite(info.modified);
      modified.hidden = !hasTime;
      if (hasTime) {
        modified.dataset.value = String(info.modified);
        modified.textContent = `Modified ${dayAndTime.format(info.modified)}`;
        modified.title = `The file was last saved to disk on ${fullDate.format(info.modified)}.`;
      } else {
        delete modified.dataset.value;
        modified.textContent = '';
        modified.title = '';
      }

      authors.hidden = list.length === 0;
      if (list.length > 0) {
        const names = list.slice(0, SHOWN_AUTHORS).map((author) => author.name);
        const others = list.length - names.length;
        authors.dataset.value = String(list.length);
        authors.textContent = `Edited by ${names.join(', ')}${others > 0 ? ` +${others}` : ''}`;
        authors.title = [
          'The people who changed this file in the last Git commits, newest first:',
          ...list.map((author) => {
            const subject = author.subject.length > SUBJECT_LENGTH ? `${author.subject.slice(0, SUBJECT_LENGTH - 1)}…` : author.subject;
            return `${author.name}, ${dayAndTime.format(author.date)}${subject ? `: ${subject}` : ''}`;
          }),
        ].join('\n');
      } else {
        delete authors.dataset.value;
        authors.textContent = '';
        authors.title = '';
      }
    },
    update(stats) {
      const key = JSON.stringify(stats);
      if (key === shown) {
        return;
      }
      shown = key;
      lines.dataset.value = String(stats.lines);
      lines.textContent = count(stats.lines, 'line', 'lines');
      lines.title = 'Lines in the Markdown file';
      words.dataset.value = String(stats.words);
      words.textContent = count(stats.words, 'word', 'words');
      words.title = 'Words in the text. The front matter does not count.';
      characters.dataset.value = String(stats.characters);
      characters.textContent = count(stats.characters, 'character', 'characters');
      characters.title = `Characters in the text, with spaces. Without spaces: ${format.format(stats.charactersWithoutSpaces)}.`;
    },
    show() {
      ready = true;
      sync();
    },
  };
}
