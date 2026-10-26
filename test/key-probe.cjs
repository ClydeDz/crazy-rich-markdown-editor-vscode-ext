// Key presses for the tests. The code in SOURCE runs in a page: in jsdom (unit tests) and in a real VS Code webview.
// Both use the same code, so a key that works in one is tested the same way in the other.
//
// The suite puts SOURCE into the page of a webview with String.replace, where a dollar sign starts a special pattern.
// So SOURCE must not hold a dollar sign. A test checks this.
//
// A real keyboard sends events with these properties, and the tests copy them:
//   - Shift changes the key: Shift+B has the key "B", and Shift+8 has the key "*".
//   - On a Mac, Option changes the key too: Option+1 has the key "¡". The key code stays the one of the physical key.
//   - `Mod` is the Command key (metaKey) on a Mac and the Ctrl key (ctrlKey) elsewhere.
const SOURCE = `
const KEY_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const KEY_DIGITS = '0123456789'.split('');
const KEY_PUNCTUATION = ['.', ',', '/', ';', "'", '[', ']', '\\\\', '-', '=', '\`'];
const KEY_NAMED = ['Enter', 'Tab', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown', 'Escape', ' '];
const KEY_SHIFTED = { '\`': '~', 1: '!', 2: '@', 3: '#', 4: '\\u0024', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', '-': '_', '=': '+', '[': '{', ']': '}', '\\\\': '|', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?' };
const KEY_CODES = { Enter: 13, Tab: 9, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, PageUp: 33, PageDown: 34, Escape: 27, ' ': 32, '.': 190, ',': 188, '/': 191, ';': 186, "'": 222, '[': 219, ']': 221, '\\\\': 220, '-': 189, '=': 187, '\`': 192 };
const MODIFIER_SETS = [[], ['Mod'], ['Shift'], ['Alt'], ['Mod', 'Shift'], ['Mod', 'Alt'], ['Shift', 'Alt'], ['Mod', 'Shift', 'Alt']];

/** 'Mod-Alt-,' becomes { mods: ['Mod', 'Alt'], base: ',' }. */
function parseChord(chord) {
  const parts = chord.split('-');
  return { mods: parts.slice(0, -1), base: parts[parts.length - 1] };
}

/** The properties of the keydown event that a real keyboard sends. shape: 'win' (Option or Alt keeps the key) or 'mac'. */
function keyEventInit(mods, base, shape, mac) {
  const shift = mods.includes('Shift');
  const alt = mods.includes('Alt');
  const mod = mods.includes('Mod');
  let key = base;
  if (base.length === 1 && base !== ' ') {
    if (shape === 'mac' && alt) {
      key = '\\u00a1';
    } else if (shift) {
      key = /[a-z]/.test(base) ? base.toUpperCase() : (KEY_SHIFTED[base] || base);
    }
  }
  const keyCode = KEY_CODES[base] || base.toUpperCase().charCodeAt(0);
  return { bubbles: true, cancelable: true, key, keyCode, metaKey: mod && mac, ctrlKey: mod && !mac, shiftKey: shift, altKey: alt };
}

/** The name of a chord, as the shortcut list writes it. */
function chordName(mods, base) {
  return [...mods, base === ' ' ? 'Space' : base].join('-');
}

/**
 * Press every chord that a user could press, in every state, and collect the chords that the editor handles.
 * A key that the editor handles gets preventDefault. A key that the editor leaves alone goes on to VS Code.
 *   states      the places in the text where the keys are pressed (see EDITOR_STATES)
 *   applyState  puts the editor in a state
 *   send        presses a key with these event properties, and tells if the editor handled it
 * Typing (a letter, a digit or a sign without Ctrl, Cmd or Alt) is not a shortcut, so it is left out.
 * The result is { 'Mod-b': ['win', 'mac'], ... }: the shapes in which the chord is handled.
 */
function probeChords({ states, applyState, send, mac }) {
  const handled = {};
  const bases = [...KEY_LETTERS, ...KEY_DIGITS, ...KEY_PUNCTUATION, ...KEY_NAMED];
  for (const state of states) {
    for (const shape of ['win', 'mac']) {
      for (const mods of MODIFIER_SETS) {
        for (const base of bases) {
          const typing = !mods.includes('Mod') && !mods.includes('Alt') && (base.length === 1);
          if (typing) continue;
          applyState(state);
          if (send(keyEventInit(mods, base, shape, mac))) {
            const name = chordName(mods, base);
            handled[name] = handled[name] || [];
            if (!handled[name].includes(shape)) handled[name].push(shape);
          }
        }
      }
    }
  }
  return handled;
}

/**
 * The places where the keys are pressed. The editor handles some keys only in some of them: Tab in a list or a table,
 * Backspace at the start of an alert, Redo after an Undo.
 */
const EDITOR_STATES = [
  { name: 'text', markdown: 'some words here', from: 1, to: 5 },
  { name: 'list', markdown: '- a\\n- b', from: 8, to: 8 },
  { name: 'tasks', markdown: '- [ ] a\\n- [ ] b', from: 12, to: 12 },
  { name: 'table', markdown: '| a | b |\\n| - | - |\\n| c | d |', from: 4, to: 4 },
  { name: 'alert', markdown: '> [!NOTE]\\n> text', from: 2, to: 2 },
  { name: 'code', markdown: '\`\`\`ts\\nconst x = 1;\\n\`\`\`', from: 3, to: 3 },
  { name: 'heading', markdown: '# Title', from: 2, to: 4 },
  { name: 'empty', markdown: '', from: 1, to: 1 },
  { name: 'redo', markdown: 'hello', from: 1, to: 6, afterUndo: true },
];
`;

/** The format that each formatting line of the shortcut list turns on. */
const FORMAT_OF = {
  Bold: 'bold',
  Italic: 'italic',
  Underline: 'underline',
  Strikethrough: 'strike',
  'Inline code': 'code',
  Superscript: 'superscript',
  Subscript: 'subscript',
  'Heading 1': 'h1',
  'Heading 2': 'h2',
  'Heading 3': 'h3',
  'Bulleted list': 'bulletList',
  'Numbered list': 'orderedList',
  'Task list': 'taskList',
  Quote: 'blockquote',
  'Code block': 'codeBlock',
};

/**
 * Keys that move or change the text at the cursor: Enter, Escape, Backspace, Delete and the arrows, with any of Ctrl, Shift and Alt,
 * select all, and Alt+D (delete the word ahead, only on a Mac). ProseMirror handles them itself. For example it always takes Enter and Escape, to stop the browser default.
 * The list does not need them. VS Code binds them only to commands of a text editor, which are not active in a webview.
 */
const ORDINARY = /^(?:(?:Mod|Shift|Alt)-)*(?:Enter|Escape|Backspace|Delete|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$|^Mod-a$|^Alt-d$/;

/** Listed keys that a probe of the bare editor cannot press: a menu or the toolbar handles them, or VS Code does. */
const NOT_IN_THE_EDITOR = ['/', ':', 'Mod-Click', 'Mod-s', 'Escape', 'ArrowUp', 'ArrowDown', 'Mod-k'];

/** Keys that VS Code uses for the whole window. The editor must leave them to VS Code. [chord, what VS Code does] */
const KEYS_FOR_VS_CODE = [
  ['Mod-s', 'Save'],
  ['Mod-Shift-s', 'Save As'],
  ['Mod-Alt-s', 'Save All'],
  ['Mod-,', 'Settings'],
  ['Mod-Shift-b', 'Run Build Task'],
  ['Mod-Shift-p', 'Command Palette'],
  ['Mod-p', 'Quick Open'],
  ['Mod-Shift-e', 'Explorer'],
  ['Mod-Shift-u', 'Output'],
  ['Mod-Shift-i', 'Italic by Caps Lock only, not with Shift'],
  ['Mod-Shift-x', 'Extensions'],
  ['Mod-Alt-0', 'Toggle Editor Group Layout'],
  ['Mod-Alt-c', 'Copy Path of Active File'],
  ['Mod-Alt-4', 'a heading level that the toolbar does not have'],
  ['Mod-Alt-5', 'a heading level that the toolbar does not have'],
  ['Mod-Alt-6', 'a heading level that the toolbar does not have'],
  ['Mod-w', 'Close Editor'],
  ['Mod-n', 'New File'],
  ['Mod-f', 'Find'],
  ['Mod-g', 'Find next'],
  ['Mod-/', 'Toggle Comment'],
  ['Mod-\\', 'Split Editor'],
];

module.exports = { SOURCE, FORMAT_OF, ORDINARY, NOT_IN_THE_EDITOR, KEYS_FOR_VS_CODE };
