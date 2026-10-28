// Every keyboard shortcut of the editor.
//
// This file has no imports, so a test in VS Code can load it. It is the one place for the keys of the text formatting:
//   - toolbar.ts shows them on the buttons,
//   - keymap.ts binds them to the commands,
//   - shortcutsModal.ts lists them in the shortcuts window.
//
// How the keys were chosen. The user must be able to guess them, and they must not take a key that the user needs in VS Code.
//   - A key that other rich text editors use stays, when VS Code has no binding for it that can run while a webview has the focus.
//   - VS Code uses some keys for commands of the whole window: Save As, Settings, Run Build Task. The editor does not take those.
//     It uses the same letter with the Alt key instead (Strikethrough, Quote, Subscript). Code block was Cmd+Alt+C, which VS Code
//     uses for Copy Path of Active File. It is now Cmd+Alt+E: the block form of Inline code, which is Cmd+E.
//   - Bold, Italic, Underline, Inline code, Link, Undo and Redo keep the usual key, although VS Code uses that key for a command of
//     its own (for example Cmd+B hides the side bar). The editor handles these keys only while the text has the focus.
//     Everywhere else in VS Code they still work. The tests list these keys, so a new overlap needs a decision.

/** Key names in the form of Tiptap and ProseMirror. `Mod` is the Command key on macOS and the Ctrl key elsewhere. */
export const FORMAT_KEYS = {
  bold: 'Mod-b',
  italic: 'Mod-i',
  underline: 'Mod-u',
  strike: 'Mod-Alt-x',
  code: 'Mod-e',
  link: 'Mod-k',
  superscript: 'Mod-.',
  subscript: 'Mod-Alt-,',
  h1: 'Mod-Alt-1',
  h2: 'Mod-Alt-2',
  h3: 'Mod-Alt-3',
  bulletList: 'Mod-Shift-8',
  orderedList: 'Mod-Shift-7',
  taskList: 'Mod-Shift-9',
  blockquote: 'Mod-Alt-q',
  codeBlock: 'Mod-Alt-e',
} as const;

/** One line of the shortcut list. */
export interface ShortcutItem {
  label: string;
  /**
   * The ways to do it. Each way is a key name such as `Mod-Shift-z`, and the window shows it as key caps.
   * The window writes "or" between two ways.
   */
  keys: string[];
  /** A short remark under the label, for example when the shortcut needs a selection. */
  note?: string;
}

export interface ShortcutGroup {
  title: string;
  items: ShortcutItem[];
}

const format = (label: string, key: string, note?: string): ShortcutItem => ({ label, keys: [key], note });

/** The shortcuts of the toolbar buttons. The label of each line is the title of its button. */
const TEXT: ShortcutItem[] = [
  format('Bold', FORMAT_KEYS.bold),
  format('Italic', FORMAT_KEYS.italic),
  format('Underline', FORMAT_KEYS.underline),
  format('Strikethrough', FORMAT_KEYS.strike),
  format('Inline code', FORMAT_KEYS.code),
  format('Link', FORMAT_KEYS.link, 'Select text first'),
  format('Superscript', FORMAT_KEYS.superscript),
  format('Subscript', FORMAT_KEYS.subscript, 'Without Alt, the key opens VS Code Settings'),
];

const HEADINGS: ShortcutItem[] = [
  format('Heading 1', FORMAT_KEYS.h1),
  format('Heading 2', FORMAT_KEYS.h2),
  format('Heading 3', FORMAT_KEYS.h3),
];

const LISTS: ShortcutItem[] = [
  format('Bulleted list', FORMAT_KEYS.bulletList),
  format('Numbered list', FORMAT_KEYS.orderedList),
  format('Task list', FORMAT_KEYS.taskList),
];

const BLOCKS: ShortcutItem[] = [format('Quote', FORMAT_KEYS.blockquote), format('Code block', FORMAT_KEYS.codeBlock)];

/** Shortcuts that are not on the toolbar. The tests press each one and check what it does. */
const EDITING: ShortcutItem[] = [
  { label: 'Undo', keys: ['Mod-z'] },
  { label: 'Redo', keys: ['Mod-Shift-z', 'Mod-y'] },
  { label: 'New line in the same paragraph', keys: ['Shift-Enter', 'Mod-Enter'] },
  { label: 'Indent a list item', keys: ['Tab'] },
  { label: 'Outdent a list item', keys: ['Shift-Tab'] },
  { label: 'Next table cell', keys: ['Tab'], note: 'In the last cell, it adds a row' },
  { label: 'Previous table cell', keys: ['Shift-Tab'] },
  { label: 'Type a tab in a code block', keys: ['Tab'], note: 'With several lines selected, it indents each line' },
  { label: 'Take a tab out of a code block', keys: ['Shift-Tab'] },
  { label: 'Take the text out of an alert', keys: ['Backspace'], note: 'At the start of the alert' },
  { label: 'Save the file', keys: ['Mod-s'] },
];

const MENUS: ShortcutItem[] = [
  { label: 'Open the block menu', keys: ['/'], note: 'At the start of a line' },
  { label: 'Open the emoji menu', keys: [':'], note: 'Then type two letters' },
  { label: 'Move in a menu', keys: ['ArrowUp', 'ArrowDown'] },
  { label: 'Choose an item', keys: ['Enter', 'Tab'] },
  { label: 'Close a menu or a field', keys: ['Escape'] },
];

const LINKS: ShortcutItem[] = [
  { label: 'Open a link', keys: ['Mod-Click'] },
  { label: 'Go to the note of a footnote', keys: ['Mod-Click'], note: 'On the footnote number' },
];

/** Every keyboard shortcut of the editor, in the order of the shortcuts window. */
export function shortcutGroups(): ShortcutGroup[] {
  return [
    { title: 'Text', items: TEXT },
    { title: 'Headings', items: HEADINGS },
    { title: 'Lists', items: LISTS },
    { title: 'Blocks', items: BLOCKS },
    { title: 'Editing', items: EDITING },
    { title: 'Menus', items: MENUS },
    { title: 'Links', items: LINKS },
  ].map((group) => ({ title: group.title, items: group.items.map((item) => ({ ...item, keys: [...item.keys] })) }));
}
