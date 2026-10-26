// Tests of the floating toolbar (webview/toolbar.ts) that the older tests in editor.test.mjs do not reach:
// the attributes of the buttons, the More menu and its listeners, Ctrl or Cmd plus K, link editing, and the table toolbar.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { leakedListeners, loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
const { createFloatingToolbars } = await loadModule('webview/toolbar.ts', 'toolbar');

const frame = () => new Promise((resolve) => setTimeout(resolve, 50));
/** The toolbar plugin updates its position 250 ms after a change. An editor that is destroyed before that causes an error. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

const created = [];

// A menu that a test leaves open keeps listeners on the document. They would take part in the next test.
afterEach(() => {
  for (const bar of created.splice(0)) {
    if (bar.querySelector('[data-action="more"]').getAttribute('aria-expanded') === 'true') {
      bar.querySelector('[data-action="more"]').click();
    }
    bar.remove();
  }
});

function setup(markdown) {
  const toolbars = createFloatingToolbars();
  const editor = makeEditor(createEditor, markdown, { extensions: toolbars.extensions });
  toolbars.bind(editor);
  const bar = toolbars.textBar;
  // The user works with the focus in the text. The floating toolbar is on the page only while text is selected,
  // and these tests need it there, so that its field can take the focus.
  if (!bar.isConnected) document.body.append(bar);
  editor.view.dom.focus();
  created.push(bar);
  return {
    editor,
    bar,
    button: (id) => bar.querySelector(`[data-action="${id}"]`),
    menu: () => bar.querySelector('.rme-menu'),
    more: () => bar.querySelector('[data-action="more"]'),
    form: () => bar.querySelector('form'),
    input: () => bar.querySelector('form input'),
  };
}

function select(editor, text) {
  let found;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return;
    const index = node.text.indexOf(text);
    if (index >= 0) found = { from: pos + index, to: pos + index + text.length };
  });
  assert.ok(found, `text ${text} exists`);
  editor.commands.setTextSelection(found);
}

const keydown = (init) => new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
const mousedown = (target) => {
  const event = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
/** Ctrl or Cmd plus K, as the editor reads it. */
const modK = (editor) => Boolean(editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, keydown({ key: 'k', ctrlKey: true, metaKey: /Mac/.test(navigator.platform) }))));

// ---------- The buttons ----------

test('the toolbar and its buttons are labelled, and every button is a plain button', () => {
  const { editor, bar, more, menu } = setup('a word here');
  assert.equal(bar.getAttribute('role'), 'toolbar');
  assert.equal(bar.getAttribute('aria-label'), 'Text formatting');
  const buttons = [...bar.querySelectorAll('button')];
  assert.ok(buttons.length > 20, 'the buttons, the items of the More menu, and the buttons of the link form');
  for (const button of bar.querySelectorAll('.rme-actions .rme-btn, .rme-menu-item')) {
    assert.equal(button.type, 'button', `${button.dataset.action} does not submit a form`);
  }
  assert.equal(bar.querySelector('form button[type="submit"]').type, 'submit', 'only the button that sends the link field submits');
  assert.equal(more().getAttribute('aria-haspopup'), 'menu');
  assert.equal(more().getAttribute('aria-expanded'), 'false');
  assert.equal(more().title, 'More formats');
  assert.equal(more().getAttribute('aria-label'), 'More formats');
  assert.equal(menu().getAttribute('role'), 'menu');
  assert.equal(menu().hidden, true);
  editor.destroy();
});

test('a click on a button, or on a menu item, does not take the focus away from the text', () => {
  const { editor, bar } = setup('a word here');
  for (const button of bar.querySelectorAll('.rme-actions .rme-btn, .rme-menu-item')) {
    assert.equal(mousedown(button).defaultPrevented, true, button.dataset.action);
  }
  editor.destroy();
});

test('each button has a title with its shortcut, a label for screen readers, and an icon or a text', () => {
  const { editor, button } = setup('a word here');
  assert.match(button('bold').title, /^Bold \((⌘B|Ctrl\+B)\)$/);
  assert.equal(button('bold').getAttribute('aria-label'), 'Bold');
  assert.ok(button('bold').querySelector('svg'), 'an icon');
  assert.equal(button('bold').classList.contains('rme-btn-text'), false);
  for (const [id, label] of [['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3']]) {
    assert.equal(button(id).textContent, label, id);
    assert.equal(button(id).classList.contains('rme-btn-text'), true, id);
    assert.equal(button(id).querySelector('svg'), null, id);
    assert.equal(button(id).getAttribute('aria-label'), `Heading ${label.slice(1)}`);
  }
  assert.match(button('h1').title, /^Heading 1 \(.*1\)$/);
  editor.destroy();
});

test('the items of the More menu are checkboxes that show their state, with a label and a shortcut', () => {
  const { editor, menu } = setup('x^up^ word');
  const items = [...menu().querySelectorAll('.rme-menu-item')];
  assert.deepEqual(items.map((item) => item.dataset.action), ['superscript', 'subscript', 'alert-note', 'alert-tip', 'alert-important', 'alert-warning', 'alert-caution', 'mathBlock', 'diagram', 'clear']);
  for (const item of items) {
    assert.equal(item.getAttribute('role'), 'menuitemcheckbox');
    assert.equal(item.getAttribute('aria-checked'), 'false');
    assert.ok(item.querySelector('.rme-menu-label').textContent.length > 0);
    assert.ok(item.querySelector('.rme-menu-icon svg'), `${item.dataset.action} has an icon`);
  }
  const superscript = items[0];
  assert.equal(superscript.querySelector('.rme-menu-label').textContent, 'Superscript');
  assert.match(superscript.querySelector('.rme-menu-hint').textContent, /^(⌘\.|Ctrl\+\.)$/);
  assert.equal(items[2].querySelector('.rme-menu-hint'), null, 'an alert has no shortcut');
  assert.deepEqual(items.slice(7, 9).map((item) => item.querySelector('.rme-menu-label').textContent), ['Math block', 'Diagram']);
  for (const item of items.slice(7, 9)) assert.equal(item.querySelector('.rme-menu-hint'), null, `${item.dataset.action} has no shortcut`);
  assert.equal(menu().querySelectorAll('[role="separator"]').length, 3, 'three lines between the groups');
  editor.destroy();
});

// ---------- The More menu ----------

test('the More menu shows and hides with its button, and the button shows the state', () => {
  const { editor, more, menu } = setup('a word here');
  select(editor, 'word');
  more().click();
  assert.equal(menu().hidden, false);
  assert.equal(more().getAttribute('aria-expanded'), 'true');
  assert.equal(more().classList.contains('is-active'), true);
  more().click();
  assert.equal(menu().hidden, true);
  assert.equal(more().getAttribute('aria-expanded'), 'false');
  assert.equal(more().classList.contains('is-active'), false);
  editor.destroy();
});

test('a click outside closes the More menu, and a click on the menu or on its button does not', () => {
  const { editor, more, menu } = setup('a word here');
  select(editor, 'word');
  more().click();
  mousedown(menu());
  mousedown(menu().querySelector('.rme-menu-item'));
  mousedown(more());
  assert.equal(menu().hidden, false, 'still open');
  mousedown(document.body);
  assert.equal(menu().hidden, true);
  assert.equal(more().classList.contains('is-active'), false);
  assert.equal(more().getAttribute('aria-expanded'), 'false');
  editor.destroy();
});

test('Escape closes the More menu and stays inside the toolbar', () => {
  const { editor, more, menu } = setup('a word here');
  select(editor, 'word');
  more().click();
  let reached = false;
  const spy = () => (reached = true);
  window.addEventListener('keydown', spy);
  const escape = keydown({ key: 'Escape' });
  try {
    document.body.dispatchEvent(escape);
  } finally {
    window.removeEventListener('keydown', spy);
  }
  assert.equal(escape.defaultPrevented, true);
  assert.equal(reached, false, 'the key does not reach the rest of the page');
  assert.equal(menu().hidden, true);
  const other = keydown({ key: 'a' });
  more().click();
  document.body.dispatchEvent(other);
  assert.equal(menu().hidden, false, 'another key does not close the menu');
  assert.equal(other.defaultPrevented, false);
  editor.destroy();
});

test('a closed More menu no longer listens: Escape and a click outside are left alone', () => {
  const { editor, more, menu } = setup('a word here');
  select(editor, 'word');
  more().click();
  more().click();
  assert.equal(menu().hidden, true);
  const escape = keydown({ key: 'Escape' });
  document.body.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, false, 'the Escape key is free for other things, such as the language picker');
  const outside = mousedown(document.body);
  assert.equal(outside.defaultPrevented, false);
  editor.destroy();
});

test('the More menu leaves no listener on the page behind when it closes, however it closes', () => {
  const { editor, more, menu } = setup('a word here and more');
  select(editor, 'word');
  const ways = {
    'a second click on the button': () => more().click(),
    'a click outside': () => mousedown(document.body),
    'the Escape key': () => document.body.dispatchEvent(keydown({ key: 'Escape' })),
    'a new selection': () => select(editor, 'more'),
  };
  for (const [name, close] of Object.entries(ways)) {
    const leaked = leakedListeners(document, () => {
      more().click();
      assert.equal(menu().hidden, false, name);
      close();
      assert.equal(menu().hidden, true, name);
    });
    // ProseMirror adds a listener of its own for the selection. The menu adds only mouse and key listeners.
    assert.deepEqual(leaked.filter((entry) => /^(mousedown|keydown)\|/.test(entry)), [], `after ${name}`);
  }
  editor.destroy();
});

test('a new selection closes the More menu', () => {
  const { editor, more, menu } = setup('a word here and more');
  select(editor, 'word');
  more().click();
  select(editor, 'more');
  assert.equal(menu().hidden, true);
  assert.equal(more().classList.contains('is-active'), false);
  editor.destroy();
});

// ---------- Links ----------

test('Ctrl or Cmd plus K opens the link field when text is selected, with the address of the link that is there', async () => {
  const { editor, bar, input } = setup('see [the docs](https://example.com/docs) now');
  select(editor, 'the docs');
  // The test page cannot keep the focus in the field (the real page can: see the test in the VS Code suite).
  // So the test looks at what the code asks for.
  const asked = [];
  input().focus = () => asked.push('focus');
  input().select = () => asked.push('select');
  assert.equal(modK(editor), true, 'the shortcut is used');
  assert.equal(bar.classList.contains('is-link-mode'), true);
  assert.equal(input().value, 'https://example.com/docs');
  await frame();
  assert.deepEqual(asked, ['focus', 'select'], 'the field gets the focus, and its address is selected');
  editor.destroy();

  const plain = setup('a word here');
  select(plain.editor, 'word');
  modK(plain.editor);
  assert.equal(plain.input().value, '', 'no link, no address');
  plain.editor.destroy();
});

test('Ctrl or Cmd plus K does nothing without a selection', () => {
  const { editor, bar } = setup('a word here');
  editor.commands.setTextSelection(3);
  assert.equal(modK(editor), false, 'the shortcut is left to others');
  assert.equal(bar.classList.contains('is-link-mode'), false);
  editor.destroy();
});

test('the link field closes the More menu when it opens', () => {
  const { editor, more, menu, bar } = setup('a word here');
  select(editor, 'word');
  more().click();
  modK(editor);
  assert.equal(menu().hidden, true);
  assert.equal(bar.classList.contains('is-link-mode'), true);
  editor.destroy();
});

test('Escape in the link field closes it, keeps the text as it was, and gives the focus back to the text', async () => {
  const { editor, bar, input } = setup('a word here');
  select(editor, 'word');
  modK(editor);
  await frame();
  input().value = 'example.com';
  let focused = 0;
  editor.view.focus = () => focused++;
  let reached = false;
  const spy = () => (reached = true);
  document.addEventListener('keydown', spy);
  const escape = keydown({ key: 'Escape' });
  try {
    input().dispatchEvent(escape);
  } finally {
    document.removeEventListener('keydown', spy);
  }
  assert.equal(escape.defaultPrevented, true);
  assert.equal(reached, false, 'the key goes no further');
  assert.equal(bar.classList.contains('is-link-mode'), false);
  assert.equal(getMarkdown(editor), 'a word here');
  await frame();
  assert.equal(focused, 1, 'the text gets the focus back');
  editor.destroy();
});

test('the Cancel button of the link field gives the focus back to the text, and the other keys stay in the field', async () => {
  const { editor, bar, input } = setup('a word here');
  select(editor, 'word');
  modK(editor);
  await frame();
  const other = keydown({ key: 'a' });
  input().dispatchEvent(other);
  assert.equal(other.defaultPrevented, false);
  assert.equal(bar.classList.contains('is-link-mode'), true, 'another key does not close the field');
  let focused = 0;
  editor.view.focus = () => focused++;
  bar.querySelector('[data-cancel]').click();
  assert.equal(bar.classList.contains('is-link-mode'), false);
  await frame();
  assert.equal(focused, 1, 'the text gets the focus back');
  editor.destroy();
});

test('the link field stays open when the selection moves to other text, and closes when the selection ends', () => {
  const { editor, bar } = setup('one two three');
  select(editor, 'one');
  modK(editor);
  select(editor, 'three');
  assert.equal(bar.classList.contains('is-link-mode'), true, 'text is still selected');
  editor.commands.setTextSelection(2);
  assert.equal(bar.classList.contains('is-link-mode'), false, 'no text is selected');
  editor.destroy();
});

test('sending the link field makes the link with a protocol, and ends the link mode', () => {
  const { editor, bar, input, form } = setup('a word here');
  select(editor, 'word');
  modK(editor);
  input().value = 'example.com/page';
  form().dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(getMarkdown(editor), 'a [word](https://example.com/page) here');
  assert.equal(bar.classList.contains('is-link-mode'), false);
  editor.destroy();
});

test('sending an empty link field removes the link', () => {
  const { editor, input, form } = setup('see [the docs](https://example.com) now');
  select(editor, 'the docs');
  modK(editor);
  input().value = '   ';
  form().dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(getMarkdown(editor), 'see the docs now');
  editor.destroy();
});

test('the Remove link button removes the link and ends the link mode', () => {
  const { editor, bar } = setup('see [the docs](https://example.com) now');
  select(editor, 'the docs');
  modK(editor);
  bar.querySelector('[data-unlink]').click();
  assert.equal(getMarkdown(editor), 'see the docs now');
  assert.equal(bar.classList.contains('is-link-mode'), false);
  editor.destroy();
});

// ---------- The table toolbar ----------

const TABLE = '| a | b |\n| --- | --- |\n| 1 | 2 |';

function tableSetup() {
  const result = setup(TABLE);
  let cell;
  result.editor.state.doc.descendants((node, pos) => {
    if (cell === undefined && node.type.name === 'tableCell') cell = pos + 2;
  });
  result.editor.commands.setTextSelection(cell);
  const bar = document.querySelector('.rme-table-toolbar');
  assert.ok(bar, 'the table toolbar is on the page');
  const shape = () => {
    const table = result.editor.getJSON().content.find((node) => node.type === 'table');
    return table ? [table.content.length, table.content[0].content.length] : null;
  };
  return { ...result, tableBar: bar, shape, tableButton: (id) => bar.querySelector(`[data-action="${id}"]`) };
}

test('the table toolbar is a labelled toolbar with five buttons that do not submit a form', async () => {
  const { editor, tableBar, tableButton } = tableSetup();
  assert.equal(tableBar.getAttribute('role'), 'toolbar');
  assert.equal(tableBar.getAttribute('aria-label'), 'Table');
  assert.deepEqual([...tableBar.querySelectorAll('button')].map((button) => button.dataset.action), ['addRow', 'addColumn', 'deleteRow', 'deleteColumn', 'deleteTable']);
  for (const button of tableBar.querySelectorAll('button')) {
    assert.equal(button.type, 'button');
    assert.equal(mousedown(button).defaultPrevented, true, 'the cursor stays in the cell');
  }
  assert.equal(tableButton('addRow').textContent, '+ Row');
  assert.equal(tableButton('deleteColumn').textContent, '− Col');
  assert.equal(tableButton('addRow').title, 'Add row below');
  assert.ok(tableButton('deleteTable').querySelector('svg'), 'the trash can is an icon');
  await settle();
  editor.destroy();
});

test('the buttons of the table toolbar change the table', async () => {
  const { editor, shape, tableButton } = tableSetup();
  assert.deepEqual(shape(), [2, 2], 'rows and columns');
  tableButton('addRow').click();
  assert.deepEqual(shape(), [3, 2]);
  tableButton('addColumn').click();
  assert.deepEqual(shape(), [3, 3]);
  tableButton('deleteRow').click();
  assert.deepEqual(shape(), [2, 3]);
  tableButton('deleteColumn').click();
  assert.deepEqual(shape(), [2, 2]);
  tableButton('deleteTable').click();
  assert.equal(shape(), null, 'no table is left');
  await settle();
  editor.destroy();
});

// ---------- Lines, math and diagrams ----------

/** Select from the start of one text to the end of another. */
function selectLines(editor, first, last) {
  let from;
  let to;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    if (from === undefined && node.text.includes(first)) from = pos + node.text.indexOf(first);
    if (node.text.includes(last)) to = pos + node.text.indexOf(last) + last.length;
  });
  assert.ok(from !== undefined && to !== undefined, 'the lines exist');
  editor.commands.setTextSelection({ from, to });
}

test('the Code block button puts all selected lines in one code block', () => {
  const { editor, button } = setup('one\n\ntwo\n\nthree');
  selectLines(editor, 'one', 'three');
  button('codeBlock').click();
  assert.equal(getMarkdown(editor), '```\none\ntwo\nthree\n```');
  assert.equal(button('codeBlock').classList.contains('is-active'), true, 'the button shows the state');
  button('codeBlock').click();
  assert.equal(editor.getJSON().content.some((node) => node.type === 'codeBlock'), false, 'the second click takes the block away');
  editor.destroy();
});

test('the Math block item of the More menu puts all selected lines in one math block, and the menu closes', () => {
  const { editor, more, menu } = setup('\\frac{a}{b}\n\nx_1 + y_2');
  selectLines(editor, 'frac', 'y_2');
  more().click();
  assert.equal(menu().hidden, false);
  menu().querySelector('[data-action="mathBlock"]').click();
  assert.equal(menu().hidden, true);
  assert.equal(getMarkdown(editor), '$$\n\\frac{a}{b}\nx_1 + y_2\n$$');
  assert.equal(editor.state.selection.node?.type.name, 'mathBlock');
  editor.destroy();
});

test('the Diagram item of the More menu puts all selected lines in one diagram, and the menu closes', () => {
  const { editor, more, menu } = setup('graph TD\n\nA --> B');
  selectLines(editor, 'graph', 'B');
  more().click();
  menu().querySelector('[data-action="diagram"]').click();
  assert.equal(menu().hidden, true);
  assert.equal(getMarkdown(editor), '```mermaid\ngraph TD\nA --> B\n```');
  editor.destroy();
});

test('the More menu has math and diagram, and no other block that the slash menu has', () => {
  const { editor, menu } = setup('x');
  const labels = [...menu().querySelectorAll('.rme-menu-label')].map((label) => label.textContent);
  for (const absent of ['Table', 'Footnote', 'Divider', 'Image or video', 'Code block']) {
    assert.equal(labels.includes(absent), false, absent);
  }
  assert.deepEqual(labels.filter((label) => /math|diagram/i.test(label)), ['Math block', 'Diagram']);
  editor.destroy();
});

test('the items for math and diagram do not appear in the list of shortcuts, since they have none', async () => {
  const { toolbarShortcutGroups } = await loadModule('webview/toolbar.ts', 'toolbar-shortcuts');
  const titles = toolbarShortcutGroups().flat().map((item) => item.title);
  assert.equal(titles.includes('Math block'), false);
  assert.equal(titles.includes('Diagram'), false);
});
