// Tests of the keyboard shortcuts that the shortcuts window lists.
// Three things must be true:
//   1. Each listed key does the job that the list names, with the key events that a real keyboard sends.
//   2. The editor handles no other key. A key that it handles never reaches VS Code, so an extra key would take a key that VS Code needs.
//   3. The keys that VS Code uses for the whole window (Save, Save As, Settings, Run Build Task) stay free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadModule, makeEditor } from './helpers.mjs';

const require = createRequire(import.meta.url);
const { SOURCE, FORMAT_OF, ORDINARY, NOT_IN_THE_EDITOR, KEYS_FOR_VS_CODE } = require('./key-probe.cjs');
const { keyEventInit, parseChord, probeChords, EDITOR_STATES } = new Function(
  `${SOURCE}; return { keyEventInit, parseChord, probeChords, EDITOR_STATES };`,
)();

const { shortcutGroups, FORMAT_KEYS } = await loadModule('webview/shortcuts.ts', 'shortcuts');
const { toolbarShortcutGroups, LINK_SHORTCUT } = await loadModule('webview/toolbar.ts', 'toolbar');
const { createEditor, getMarkdown, setMarkdown } = await loadModule('webview/editor.ts', 'editor');

const isMac = /Mac/.test(navigator.platform);
const SHAPES = ['win', 'mac'];

/** Press a chord on the editor like a real keyboard does. The result tells if the editor handled it (it then calls preventDefault). */
function press(editor, chord, shape = 'win') {
  const { mods, base } = parseChord(chord);
  const event = new window.KeyboardEvent('keydown', keyEventInit(mods, base, shape, isMac));
  editor.view.dom.dispatchEvent(event);
  return event.defaultPrevented;
}

const groups = shortcutGroups();
const group = (title) => groups.find((entry) => entry.title === title);
const item = (title, label) => {
  const found = group(title).items.find((entry) => entry.label === label);
  assert.ok(found, `${title} has "${label}"`);
  return found;
};
const hasNode = (editor, name) => {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) found = true;
  });
  return found;
};
const countNodes = (editor, name) => {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === name) count++;
  });
  return count;
};

/** Every format that is on at the selection. A shortcut must turn on its own format, and no other. */
function activeFormats(editor) {
  const names = ['bold', 'italic', 'underline', 'strike', 'code', 'superscript', 'subscript', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock'];
  const on = names.filter((name) => editor.isActive(name));
  for (const level of [1, 2, 3, 4, 5, 6]) {
    if (editor.isActive('heading', { level })) on.push(`h${level}`);
  }
  return on;
}

// ---------- The key events ----------

test('the key source has no dollar sign, because the VS Code suite puts it in a page with String.replace', () => {
  assert.equal(SOURCE.includes('$'), false);
});

test('the key events are the ones that a real keyboard sends', () => {
  const shift8 = keyEventInit(['Mod', 'Shift'], '8', 'win', false);
  assert.equal(shift8.key, '*', 'Shift+8 gives a star');
  assert.equal(shift8.keyCode, 56, 'the key code is the one of the key');
  assert.equal(keyEventInit(['Mod', 'Shift'], '4', 'win', false).key, '$', 'Shift+4 gives a dollar sign');
  assert.equal(keyEventInit(['Mod', 'Shift'], 'b', 'win', false).key, 'B', 'Shift+B gives a capital letter');
  assert.equal(keyEventInit(['Mod'], 'b', 'win', false).key, 'b');
  const optionOne = keyEventInit(['Mod', 'Alt'], '1', 'mac', true);
  assert.notEqual(optionOne.key, '1', 'on a Mac, Option changes the character');
  assert.equal(optionOne.keyCode, 49);
  assert.equal(keyEventInit(['Mod', 'Alt'], '1', 'win', false).key, '1', 'on Windows, Alt keeps the character');
  assert.deepEqual(
    [keyEventInit(['Mod'], 'b', 'win', true).metaKey, keyEventInit(['Mod'], 'b', 'win', true).ctrlKey],
    [true, false],
    'Mod is the Command key on a Mac',
  );
  assert.deepEqual(
    [keyEventInit(['Mod'], 'b', 'win', false).metaKey, keyEventInit(['Mod'], 'b', 'win', false).ctrlKey],
    [false, true],
    'and the Ctrl key elsewhere',
  );
  assert.deepEqual(parseChord('Mod-Alt-,'), { mods: ['Mod', 'Alt'], base: ',' });
  assert.deepEqual(parseChord('/'), { mods: [], base: '/' });
});

// ---------- The list ----------

test('the list has the groups in a fixed order', () => {
  assert.deepEqual(
    groups.map((entry) => entry.title),
    ['Text', 'Headings', 'Lists', 'Blocks', 'Editing', 'Menus', 'Links'],
  );
});

test('every item has a label and at least one key name, and no label comes twice in a group', () => {
  for (const entry of groups) {
    assert.ok(entry.items.length > 0, `${entry.title} has items`);
    const labels = entry.items.map((line) => line.label);
    assert.equal(new Set(labels).size, labels.length, `${entry.title} has no label twice`);
    for (const line of entry.items) {
      assert.ok(typeof line.label === 'string' && line.label.length > 0, `${entry.title}: a label`);
      assert.ok(Array.isArray(line.keys) && line.keys.length > 0, `${line.label} has keys`);
      for (const key of line.keys) {
        assert.ok(typeof key === 'string' && key.length > 0, `${line.label} has no empty key`);
      }
    }
  }
});

test('shortcutGroups gives a copy, so a change to the result does not change the list', () => {
  const first = shortcutGroups();
  first[0].items[0].keys.push('Mod-Alt-q');
  first[0].items.pop();
  first.pop();
  const second = shortcutGroups();
  assert.equal(second.length, 7);
  assert.deepEqual(second[0].items[0].keys, [FORMAT_KEYS.bold]);
  assert.equal(second[0].items.length, 8);
});

test('FORMAT_KEYS and the list agree: each key of the table is on one line, and each formatting line has a key of the table', () => {
  const tableKeys = Object.values(FORMAT_KEYS);
  assert.equal(new Set(tableKeys).size, tableKeys.length, 'two formats never share a key');
  const listed = groups.slice(0, 4).flatMap((entry) => entry.items.flatMap((line) => line.keys));
  assert.deepEqual([...listed].sort(), [...tableKeys].sort());
});

test('the toolbar gives four groups, and the list has every shortcut of the toolbar buttons with the same key', () => {
  assert.equal(toolbarShortcutGroups().length, 4);
  const fromToolbar = toolbarShortcutGroups().flat();
  const fromList = groups.slice(0, 4).flatMap((entry) => entry.items);
  assert.deepEqual(
    fromList.map((line) => [line.label, line.keys]),
    fromToolbar.map((line) => [line.title, [line.shortcut]]),
  );
  assert.ok(fromList.length >= 15, `the toolbar has many shortcuts: ${fromList.length}`);
  assert.deepEqual(item('Text', 'Link').keys, [LINK_SHORTCUT]);
  assert.equal(LINK_SHORTCUT, FORMAT_KEYS.link);
  assert.equal(item('Text', 'Link').note, 'Select text first', 'the link shortcut needs a selection');
});

test('the Subscript line says why it has the Alt key', () => {
  assert.deepEqual(item('Text', 'Subscript').keys, ['Mod-Alt-,']);
  assert.match(item('Text', 'Subscript').note, /Settings/);
});

// ---------- 1. Each listed key does its job ----------

test('each formatting shortcut turns on its own format and no other, and the same key turns it off', () => {
  for (const entry of groups.slice(0, 4)) {
    for (const line of entry.items) {
      if (line.label === 'Link') continue; // The toolbar tests press this one: it opens the link field.
      const expected = FORMAT_OF[line.label];
      assert.ok(expected, `the test knows the format of "${line.label}"`);
      for (const key of line.keys) {
        for (const shape of SHAPES) {
          const editor = makeEditor(createEditor, 'some words here');
          editor.commands.setTextSelection({ from: 1, to: 5 });
          assert.deepEqual(activeFormats(editor), [], `${line.label}: nothing is on before the key`);
          assert.equal(press(editor, key, shape), true, `${line.label}: the editor handles ${key} (${shape} keyboard)`);
          assert.deepEqual(activeFormats(editor), [expected], `${line.label}: ${key} turns on ${expected} only (${shape} keyboard)`);
          press(editor, key, shape);
          assert.deepEqual(activeFormats(editor), [], `${line.label}: ${key} again turns it off (${shape} keyboard)`);
          editor.destroy();
        }
      }
    }
  }
});

test('the formatting shortcuts work with Caps Lock on, where the key has a capital letter and Shift is not pressed', () => {
  for (const [label, key] of [['Bold', 'b'], ['Italic', 'i'], ['Underline', 'u'], ['Inline code', 'e']]) {
    const editor = makeEditor(createEditor, 'some words here');
    editor.commands.setTextSelection({ from: 1, to: 5 });
    const init = { bubbles: true, cancelable: true, key: key.toUpperCase(), keyCode: key.toUpperCase().charCodeAt(0), ctrlKey: !isMac, metaKey: isMac };
    const event = new window.KeyboardEvent('keydown', init);
    editor.view.dom.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true, `${label} with Caps Lock`);
    assert.deepEqual(activeFormats(editor), [FORMAT_OF[label]]);
    editor.destroy();
  }
});

test('Undo and Redo: every key of the list works, with the keys that a real keyboard sends', () => {
  for (const shape of SHAPES) {
    for (const redoKey of item('Editing', 'Redo').keys) {
      const editor = makeEditor(createEditor, 'hello');
      editor.commands.setTextSelection({ from: 1, to: 6 });
      editor.commands.toggleBold();
      assert.equal(getMarkdown(editor), '**hello**');
      for (const undoKey of item('Editing', 'Undo').keys) {
        assert.equal(press(editor, undoKey, shape), true);
        assert.equal(getMarkdown(editor), 'hello', `${undoKey} undoes the change (${shape})`);
        assert.equal(press(editor, redoKey, shape), true);
        assert.equal(getMarkdown(editor), '**hello**', `${redoKey} does the change again (${shape})`);
      }
      editor.destroy();
    }
  }
});

test('a new line in the same paragraph: every key of the list works', () => {
  for (const key of item('Editing', 'New line in the same paragraph').keys) {
    const editor = makeEditor(createEditor, 'one two');
    editor.commands.setTextSelection(4);
    assert.equal(press(editor, key), true);
    assert.equal(hasNode(editor, 'hardBreak'), true, `${key} adds a line break`);
    assert.equal(editor.state.doc.childCount, 1, 'the text stays in one paragraph');
    editor.destroy();
  }
});

test('Tab and Shift+Tab indent and outdent a list item', () => {
  const editor = makeEditor(createEditor, '- a\n- b');
  editor.commands.setTextSelection(8);
  assert.deepEqual(item('Editing', 'Indent a list item').keys, ['Tab']);
  assert.deepEqual(item('Editing', 'Outdent a list item').keys, ['Shift-Tab']);
  assert.equal(press(editor, 'Tab'), true);
  assert.equal(getMarkdown(editor), '- a\n  - b');
  assert.equal(press(editor, 'Shift-Tab'), true);
  assert.equal(getMarkdown(editor), '- a\n- b');
  editor.destroy();
});

test('Tab and Shift+Tab move between the cells of a table, and Tab in the last cell adds a row', () => {
  assert.deepEqual(item('Editing', 'Next table cell').keys, ['Tab']);
  assert.deepEqual(item('Editing', 'Previous table cell').keys, ['Shift-Tab']);
  assert.match(item('Editing', 'Next table cell').note, /adds a row/);
  const editor = makeEditor(createEditor, '| a | b |\n| - | - |\n| c | d |');
  editor.commands.setTextSelection(4);
  const first = editor.state.selection.from;
  assert.equal(press(editor, 'Tab'), true);
  assert.ok(editor.state.selection.from > first, 'Tab goes to the next cell');
  assert.equal(press(editor, 'Shift-Tab'), true);
  assert.equal(editor.state.selection.from, first, 'Shift+Tab goes back');

  let last = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell') last = pos + 2;
  });
  editor.commands.setTextSelection(last);
  const rows = countNodes(editor, 'tableRow');
  assert.equal(press(editor, 'Tab'), true);
  assert.equal(countNodes(editor, 'tableRow'), rows + 1, 'Tab in the last cell adds a row');
  editor.destroy();
});

test('Backspace at the start of an alert takes the text out of the alert, and only there', () => {
  assert.deepEqual(item('Editing', 'Take the text out of an alert').keys, ['Backspace']);
  const editor = makeEditor(createEditor, '> [!NOTE]\n> text');
  assert.equal(hasNode(editor, 'alert'), true);
  editor.commands.setTextSelection(2);
  assert.equal(press(editor, 'Backspace'), true);
  assert.equal(hasNode(editor, 'alert'), false, 'the alert is gone');
  assert.equal(getMarkdown(editor), 'text', 'the text stays');
  editor.destroy();

  const inside = makeEditor(createEditor, '> [!NOTE]\n> text');
  inside.commands.setTextSelection(4);
  assert.equal(press(inside, 'Backspace'), false, 'inside the text, Backspace is left to the editor');
  assert.equal(hasNode(inside, 'alert'), true);
  inside.destroy();
});

test('the other lines of the list name the keys that the menus, the links and the save use', () => {
  assert.deepEqual(item('Editing', 'Save the file').keys, ['Mod-s']);
  assert.deepEqual(item('Menus', 'Open the block menu').keys, ['/']);
  assert.deepEqual(item('Menus', 'Open the emoji menu').keys, [':']);
  assert.deepEqual(item('Menus', 'Move in a menu').keys, ['ArrowUp', 'ArrowDown']);
  assert.deepEqual(item('Menus', 'Choose an item').keys, ['Enter', 'Tab']);
  assert.deepEqual(item('Menus', 'Close a menu or a field').keys, ['Escape']);
  assert.deepEqual(item('Links', 'Open a link').keys, ['Mod-Click']);
  assert.deepEqual(item('Links', 'Go to the note of a footnote').keys, ['Mod-Click']);
});

// ---------- 2 and 3. No other key, and the keys of VS Code stay free ----------

function probeEditor() {
  const editor = makeEditor(createEditor, '');
  const applyState = (state) => {
    setMarkdown(editor, state.markdown, { undoable: false });
    const size = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: Math.min(state.from, size), to: Math.min(state.to, size) });
    if (state.afterUndo) {
      editor.commands.toggleBold();
      editor.commands.undo();
    }
  };
  const send = (init) => {
    const event = new window.KeyboardEvent('keydown', init);
    editor.view.dom.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const handled = probeChords({ states: EDITOR_STATES, applyState, send, mac: isMac });
  editor.destroy();
  return handled;
}

test('the editor handles every listed key, with both kinds of keyboard, and no other key except the keys of ordinary text editing', () => {
  const handled = probeEditor();
  const listed = new Set(groups.flatMap((entry) => entry.items.flatMap((line) => line.keys)).filter((key) => !NOT_IN_THE_EDITOR.includes(key)));
  assert.ok(listed.size >= 20, `the probe checks many keys: ${listed.size}`);

  const missing = [...listed].filter((key) => !handled[key]);
  assert.deepEqual(missing, [], 'a listed key that the editor does not handle');
  const onlyOneKeyboard = [...listed].filter((key) => handled[key] && handled[key].length < SHAPES.length);
  assert.deepEqual(onlyOneKeyboard, [], 'a listed key that works only on one kind of keyboard (Option changes the key on a Mac)');

  const extra = Object.keys(handled).filter((name) => !listed.has(name) && !ORDINARY.test(name));
  assert.deepEqual(extra, [], 'a key that the editor handles and the list does not name. It is taken from VS Code, and nobody knows it.');
});

test('the keys that VS Code needs for the whole window stay free: the editor does not handle them', () => {
  const editor = makeEditor(createEditor, 'some words here');
  const keep = KEYS_FOR_VS_CODE;
  for (const [chord, what] of keep) {
    for (const shape of SHAPES) {
      editor.commands.setTextSelection({ from: 1, to: 5 });
      assert.equal(press(editor, chord, shape), false, `${chord} (${what}) goes on to VS Code (${shape} keyboard)`);
    }
  }
  assert.equal(getMarkdown(editor), 'some words here', 'none of these keys changed the text');
  editor.destroy();
});

test('Mod-Shift-b is not Bold: the capital B of Shift+B does not toggle bold', () => {
  const editor = makeEditor(createEditor, 'some words here');
  editor.commands.setTextSelection({ from: 1, to: 5 });
  press(editor, 'Mod-Shift-b');
  assert.equal(editor.isActive('bold'), false);
  assert.equal(editor.isActive('blockquote'), false);
  assert.deepEqual(activeFormats(editor), []);
  editor.destroy();
});

test('Tab and Shift+Tab type and take away tabs in a code block, also in a list item', () => {
  assert.deepEqual(item('Editing', 'Type a tab in a code block').keys, ['Tab']);
  assert.deepEqual(item('Editing', 'Take a tab out of a code block').keys, ['Shift-Tab']);
  const code = (editor) => {
    let text = '';
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'codeBlock') text = node.textContent;
    });
    return text;
  };
  for (const markdown of ['```\nab\ncd\n```', '- item\n\n  ```\n  ab\n  cd\n  ```']) {
    const editor = makeEditor(createEditor, markdown);
    let start = 0;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'codeBlock') start = pos + 1;
    });
    // A cursor after "a".
    editor.commands.setTextSelection(start + 1);
    assert.equal(press(editor, 'Tab'), true);
    assert.equal(code(editor), 'a\tb\ncd', 'Tab types a tab');
    assert.equal(editor.state.selection.from, start + 2, 'the cursor is after the tab');
    // Several lines.
    editor.commands.setTextSelection({ from: start, to: start + 5 });
    assert.equal(press(editor, 'Tab'), true);
    assert.equal(code(editor), '\ta\tb\n\tcd', 'Tab indents each selected line');
    assert.equal(press(editor, 'Shift-Tab'), true);
    assert.equal(code(editor), 'a\tb\ncd', 'Shift+Tab takes one tab from each line');
    assert.equal(press(editor, 'Shift-Tab'), true);
    assert.equal(code(editor), 'a\tb\ncd', 'a line without a tab stays as it is');
    editor.destroy();
  }
});

test('Tab handles the key in a code block with a selection that ends in another block', () => {
  const editor = makeEditor(createEditor, 'text\n\n```\nab\n```');
  editor.commands.selectAll();
  // The selection leaves the code block, so the key does what it did before.
  const before = editor.getJSON();
  press(editor, 'Tab');
  assert.equal(JSON.stringify(editor.getJSON().content[1]), JSON.stringify(before.content[1]), 'the code stays as it is');
  editor.destroy();
});
