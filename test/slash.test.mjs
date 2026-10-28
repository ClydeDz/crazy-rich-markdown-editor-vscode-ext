// Tests of the pop-up lists: the renderer that the slash menu and the emoji menu share (webview/suggestionMenu.ts),
// the items of the slash menu (webview/slashMenu.ts), and the emoji menu (webview/emoji.ts).
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createSuggestionRenderer } = await loadModule('webview/suggestionMenu.ts', 'suggestionMenu');
const { createSlashMenu } = await loadModule('webview/slashMenu.ts', 'slashMenu');
const { ALERT_TYPES, ALERT_TITLES } = await loadModule('webview/alert.ts', 'alert');
const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');

afterEach(() => {
  for (const menu of document.querySelectorAll('.rme-slash')) menu.remove();
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const menu = () => document.querySelector('.rme-slash');
const rows = () => [...document.querySelectorAll('.rme-slash-item')];
const titles = () => [...document.querySelectorAll('.rme-slash-title')].map((title) => title.textContent);
const selectedTitle = () => document.querySelector('.rme-slash-item.is-selected .rme-slash-title')?.textContent;
const key = (name) => ({ event: new window.KeyboardEvent('keydown', { key: name, cancelable: true }) });

// ---------- The renderer ----------

const entries = [
  { icon: '<svg viewBox="0 0 1 1"></svg>', title: 'One', description: 'First item' },
  { icon: 'H2', title: 'Two', description: 'Second item' },
  { title: 'Three' },
];

/** A renderer, and the fake properties that the suggestion plugin gives it. */
function renderer(options = {}) {
  const chosen = [];
  const created = createSuggestionRenderer({ describe: (item) => item, ...options })();
  const props = (items, rect = { left: 10, right: 50, top: 100, bottom: 120 }) => ({
    items,
    command: (item) => chosen.push(item),
    clientRect: () => rect,
  });
  return { created, chosen, props };
}

test('the renderer shows a list box with one row for each item, and the first row is selected', () => {
  const { created, props } = renderer();
  created.onStart(props(entries));
  assert.equal(menu().getAttribute('role'), 'listbox');
  assert.equal(menu().className, 'rme-slash');
  assert.deepEqual(titles(), ['One', 'Two', 'Three']);
  assert.deepEqual(
    rows().map((row) => row.getAttribute('aria-selected')),
    ['true', 'false', 'false'],
  );
  assert.equal(document.querySelectorAll('.is-selected').length, 1);
  for (const row of rows()) assert.equal(row.getAttribute('role'), 'option');
  created.onExit();
});

test('the renderer shows an SVG icon as a picture, other icons as text, and no description when there is none', () => {
  const { created, props } = renderer();
  created.onStart(props(entries));
  const [first, second, third] = rows();
  assert.ok(first.querySelector('.rme-slash-icon svg'), 'an icon that starts with <svg is a picture');
  assert.equal(second.querySelector('.rme-slash-icon').textContent, 'H2');
  assert.equal(second.querySelector('.rme-slash-icon svg'), null);
  assert.equal(third.querySelector('.rme-slash-icon').textContent, '', 'no icon is an empty icon');
  assert.equal(first.querySelector('.rme-slash-description').textContent, 'First item');
  assert.equal(third.querySelector('.rme-slash-description'), null);
  created.onExit();
});

test('the renderer adds the class that the owner asks for', () => {
  const { created, props } = renderer({ className: 'rme-emoji-menu' });
  created.onStart(props(entries));
  assert.equal(menu().className, 'rme-slash rme-emoji-menu');
  created.onExit();
});

test('the arrow keys move the selection and go round, and the renderer says that it used the key', () => {
  const { created, props } = renderer();
  created.onStart(props(entries));
  assert.equal(created.onKeyDown(key('ArrowDown')), true);
  assert.equal(selectedTitle(), 'Two');
  created.onKeyDown(key('ArrowDown'));
  assert.equal(selectedTitle(), 'Three');
  created.onKeyDown(key('ArrowDown'));
  assert.equal(selectedTitle(), 'One', 'down from the last goes to the first');
  assert.equal(created.onKeyDown(key('ArrowUp')), true);
  assert.equal(selectedTitle(), 'Three', 'up from the first goes to the last');
  created.onKeyDown(key('ArrowUp'));
  assert.equal(selectedTitle(), 'Two');
  assert.equal(document.querySelectorAll('.is-selected').length, 1);
  created.onExit();
});

test('Enter and Tab choose the selected item, and other keys are left to the editor', () => {
  const { created, chosen, props } = renderer();
  created.onStart(props(entries));
  created.onKeyDown(key('ArrowDown'));
  assert.equal(created.onKeyDown(key('Enter')), true);
  assert.deepEqual(chosen, [entries[1]]);
  assert.equal(created.onKeyDown(key('Tab')), true);
  assert.deepEqual(chosen, [entries[1], entries[1]]);
  for (const other of ['a', 'ArrowLeft', 'Backspace', ' ', 'Shift']) {
    assert.equal(created.onKeyDown(key(other)), false, other);
  }
  assert.equal(chosen.length, 2, 'no other key chooses');
  created.onExit();
});

test('Escape closes the list and uses the key', () => {
  const { created, chosen, props } = renderer();
  created.onStart(props(entries));
  assert.equal(created.onKeyDown(key('Escape')), true);
  assert.equal(menu(), null);
  assert.deepEqual(chosen, []);
  assert.equal(created.onKeyDown(key('Escape')), true, 'Escape is used also when the list is already closed');
  assert.equal(created.onKeyDown(key('ArrowDown')), false, 'a closed list uses no other key');
  assert.equal(created.onKeyDown(key('Enter')), false);
  created.onExit();
});

test('a list that is empty uses no key except Escape, and it chooses nothing', () => {
  const { created, chosen, props } = renderer();
  created.onStart(props([]));
  for (const name of ['ArrowDown', 'ArrowUp', 'Enter', 'Tab']) {
    assert.equal(created.onKeyDown(key(name)), false, name);
  }
  assert.deepEqual(chosen, []);
  assert.equal(created.onKeyDown(key('Escape')), true);
  created.onExit();
});

test('the mouse selects the row under it, and a click chooses the row without taking the focus away', () => {
  const { created, chosen, props } = renderer();
  created.onStart(props(entries));
  rows()[2].dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true }));
  assert.equal(selectedTitle(), 'Three');
  const mousedown = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  rows()[1].dispatchEvent(mousedown);
  assert.equal(mousedown.defaultPrevented, true, 'the editor keeps its focus');
  assert.deepEqual(chosen, [entries[1]]);
  created.onExit();
});

test('an update shows the new items, and keeps the selection when it still exists', () => {
  const { created, props } = renderer();
  created.onStart(props(entries));
  created.onKeyDown(key('ArrowDown'));
  created.onKeyDown(key('ArrowDown'));
  assert.equal(selectedTitle(), 'Three');
  created.onUpdate(props([entries[0], entries[1]]));
  assert.deepEqual(titles(), ['One', 'Two']);
  assert.equal(selectedTitle(), 'Two', 'the selection moves to the last row that is left');
  created.onUpdate(props(entries));
  assert.equal(selectedTitle(), 'Two');
  created.onKeyDown(key('Enter'));
  created.onExit();
});

test('a start puts the selection on the first row again', () => {
  const { created, props } = renderer();
  created.onStart(props(entries));
  created.onKeyDown(key('ArrowDown'));
  created.onExit();
  created.onStart(props(entries));
  assert.equal(selectedTitle(), 'One');
  created.onExit();
});

test('a list without items says that nothing matches, unless the owner wants it hidden', () => {
  const { created, props } = renderer();
  created.onStart(props([]));
  assert.equal(document.querySelector('.rme-slash-empty').textContent, 'No matches');
  assert.equal(rows().length, 0);
  created.onUpdate(props(entries));
  assert.equal(document.querySelector('.rme-slash-empty'), null, 'the message goes away');
  assert.equal(rows().length, 3);
  created.onExit();

  const hidden = renderer({ hideWhenEmpty: true });
  hidden.created.onStart(hidden.props(entries));
  assert.ok(menu());
  hidden.created.onUpdate(hidden.props([]));
  assert.equal(menu(), null, 'no list at all');
  hidden.created.onUpdate(hidden.props(entries));
  assert.ok(menu(), 'the list comes back');
  hidden.created.onExit();
});

test('exit removes the list and forgets the choice', () => {
  const { created, chosen, props } = renderer();
  created.onStart(props(entries));
  created.onExit();
  assert.equal(menu(), null);
  assert.equal(document.querySelectorAll('.rme-slash').length, 0);
  assert.equal(created.onKeyDown(key('Enter')), false);
  assert.deepEqual(chosen, []);
});

test('the list shows below the cursor when it fits, above when it does not, and stays on the screen', () => {
  const sizes = Object.getOwnPropertyDescriptors(window.HTMLElement.prototype);
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 300 });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 250 });
  const place = (rect) => {
    const { created, props } = renderer();
    created.onStart(props(entries, rect));
    const result = { top: menu().style.top, left: menu().style.left };
    created.onExit();
    return result;
  };
  try {
    assert.deepEqual(
      place({ left: 100, right: 110, top: 100, bottom: 120 }),
      { top: '126px', left: '100px' },
      'below the cursor',
    );
    assert.deepEqual(
      place({ left: 100, right: 110, top: 700, bottom: 720 }),
      { top: '394px', left: '100px' },
      'above the cursor',
    );
    assert.deepEqual(
      place({ left: -50, right: 0, top: 100, bottom: 120 }),
      { top: '126px', left: '8px' },
      'not past the left edge',
    );
    assert.deepEqual(
      place({ left: 2000, right: 2010, top: 100, bottom: 120 }),
      { top: '126px', left: '766px' },
      'not past the right edge',
    );
    assert.deepEqual(
      place({ left: 100, right: 110, top: 100, bottom: 462 }),
      { top: '468px', left: '100px' },
      'the list fits exactly',
    );
    assert.deepEqual(
      place({ left: 100, right: 110, top: 100, bottom: 463 }),
      { top: '8px', left: '100px' },
      'above, but not above the screen',
    );
    const { created, props } = renderer();
    created.onStart({ ...props(entries), clientRect: null });
    assert.equal(menu().style.top, '', 'no position without a cursor rectangle');
    created.onExit();
  } finally {
    for (const name of ['offsetHeight', 'offsetWidth']) {
      if (sizes[name]) Object.defineProperty(window.HTMLElement.prototype, name, sizes[name]);
      else delete window.HTMLElement.prototype[name];
    }
  }
});

// ---------- The slash menu in an editor ----------

const press = (editor, name) =>
  Boolean(
    editor.view.someProp('handleKeyDown', (handler) =>
      handler(editor.view, new window.KeyboardEvent('keydown', { key: name, cancelable: true })),
    ),
  );

/** An empty editor with the slash menu. The test types text, and waits for the menu. */
async function slashEditor(markdown = '', onPickMedia = () => {}) {
  const editor = makeEditor(createEditor, markdown, { extensions: [createSlashMenu({ onPickMedia })] });
  editor.commands.focus('end');
  return editor;
}
const type = async (editor, text) => {
  editor.commands.insertContent(text);
  await tick();
};

test('typing a slash at the start of a line opens the menu with every item', async () => {
  const editor = await slashEditor();
  await type(editor, '/');
  assert.ok(menu());
  assert.deepEqual(titles(), [
    'Heading 1',
    'Heading 2',
    'Heading 3',
    'Bulleted list',
    'Numbered list',
    'Task list',
    'Quote',
    ...ALERT_TYPES.map((type) => `${ALERT_TITLES[type]} alert`),
    'Code block',
    'Table',
    'Math block',
    'Diagram',
    'Footnote',
    'Divider',
    'Image or video',
  ]);
  assert.equal(selectedTitle(), 'Heading 1');
  editor.destroy();
});

test('a slash after text does not open the menu', async () => {
  const editor = await slashEditor('some text ');
  editor.commands.focus('end');
  await type(editor, '/');
  assert.equal(menu(), null);
  editor.destroy();
});

test('typing filters the items by title and keywords, and a space closes the menu', async () => {
  const editor = await slashEditor();
  await type(editor, '/head');
  assert.deepEqual(titles(), ['Heading 1', 'Heading 2', 'Heading 3']);
  await type(editor, 'ING');
  assert.deepEqual(titles(), ['Heading 1', 'Heading 2', 'Heading 3'], 'capitals do not matter');
  editor.destroy();

  const byKeyword = await slashEditor();
  await type(byKeyword, '/todo');
  assert.deepEqual(titles(), ['Task list'], 'a keyword finds the item');
  byKeyword.destroy();

  const none = await slashEditor();
  await type(none, '/zzzz');
  assert.equal(document.querySelector('.rme-slash-empty').textContent, 'No matches');
  none.destroy();

  const space = await slashEditor();
  await type(space, '/head');
  assert.ok(menu());
  await type(space, ' ');
  assert.equal(menu(), null, 'a space ends the search');
  space.destroy();
});

test('Escape closes the menu and keeps the typed text', async () => {
  const editor = await slashEditor();
  await type(editor, '/head');
  assert.equal(press(editor, 'Escape'), true);
  assert.equal(menu(), null);
  assert.equal(editor.getText(), '/head');
  editor.destroy();
});

test('the arrow keys and Enter pick an item of the menu in the editor', async () => {
  const editor = await slashEditor();
  await type(editor, '/');
  assert.equal(press(editor, 'ArrowDown'), true);
  assert.equal(selectedTitle(), 'Heading 2');
  assert.equal(press(editor, 'Enter'), true);
  await tick();
  assert.equal(menu(), null);
  assert.equal(editor.getJSON().content[0].type, 'heading');
  assert.equal(editor.getJSON().content[0].attrs.level, 2);
  assert.ok(!JSON.stringify(editor.getJSON()).includes('"text"'), 'the slash and the search text are gone');
  editor.destroy();
});

// What each item makes. `check` returns what the first block must look like.
const CASES = [
  ['Heading 1', (doc) => [doc[0].type, doc[0].attrs.level], ['heading', 1]],
  ['Heading 2', (doc) => [doc[0].type, doc[0].attrs.level], ['heading', 2]],
  ['Heading 3', (doc) => [doc[0].type, doc[0].attrs.level], ['heading', 3]],
  ['Bulleted list', (doc) => doc[0].type, 'bulletList'],
  ['Numbered list', (doc) => doc[0].type, 'orderedList'],
  ['Task list', (doc) => doc[0].type, 'taskList'],
  ['Quote', (doc) => doc[0].type, 'blockquote'],
  ...ALERT_TYPES.map((type) => [
    `${ALERT_TITLES[type]} alert`,
    (doc) => [doc[0].type, doc[0].attrs.alertType ?? doc[0].attrs.type],
    ['alert', type],
  ]),
  ['Code block', (doc) => doc[0].type, 'codeBlock'],
  ['Table', (doc) => doc[0].type, 'table'],
  ['Math block', (doc) => doc[0].type, 'mathBlock'],
  ['Divider', (doc) => doc.some((node) => node.type === 'horizontalRule'), true],
];

for (const [title, check, expected] of CASES) {
  test(`the slash menu item "${title}" makes the right block and removes the slash`, async () => {
    const editor = await slashEditor();
    await type(editor, '/');
    while (selectedTitle() !== title) {
      assert.equal(press(editor, 'ArrowDown'), true);
      assert.ok(titles().includes(title));
    }
    press(editor, 'Enter');
    await tick();
    const doc = editor.getJSON().content;
    assert.deepEqual(check(doc), expected, JSON.stringify(doc).slice(0, 200));
    assert.ok(!JSON.stringify(doc).includes('"text":"/"'), 'the slash is gone');
    assert.equal(menu(), null);
    editor.destroy();
  });
}

test('the slash menu item "Table" makes a table of three rows and three columns, with a header row', async () => {
  const editor = await slashEditor();
  await type(editor, '/table');
  press(editor, 'Enter');
  await tick();
  const table = editor.getJSON().content.find((node) => node.type === 'table');
  assert.equal(table.content.length, 3, 'rows');
  assert.deepEqual(
    table.content.map((row) => row.content.length),
    [3, 3, 3],
    'columns',
  );
  assert.deepEqual(
    table.content[0].content.map((cell) => cell.type),
    ['tableHeader', 'tableHeader', 'tableHeader'],
  );
  assert.deepEqual(
    table.content[1].content.map((cell) => cell.type),
    ['tableCell', 'tableCell', 'tableCell'],
  );
  editor.destroy();
});

test('the slash menu item "Diagram" makes a mermaid block with a first diagram', async () => {
  const editor = await slashEditor();
  await type(editor, '/diagram');
  press(editor, 'Enter');
  await tick();
  const block = editor.getJSON().content.find((node) => node.type === 'codeBlock');
  assert.equal(block.attrs.language, 'mermaid');
  assert.equal(block.content[0].text, 'graph TD\n  A[Start] --> B[Done]');
  assert.ok(getMarkdown(editor).startsWith('```mermaid\ngraph TD'));
  editor.destroy();
});

test('the slash menu item "Footnote" adds a mark and a note', async () => {
  const editor = await slashEditor('Text');
  editor.chain().focus('end').splitBlock().run();
  await type(editor, '/footnote');
  press(editor, 'Enter');
  await tick();
  const names = [];
  editor.state.doc.descendants((node) => {
    names.push(node.type.name);
  });
  assert.ok(names.includes('footnoteRef') && names.includes('footnoteDefinition'), names.join());
  editor.destroy();
});

test('the slash menu item "Image or video" removes the slash and asks the host for files', async () => {
  let asked = 0;
  const editor = await slashEditor('', () => asked++);
  await type(editor, '/image');
  assert.deepEqual(titles(), ['Image or video']);
  press(editor, 'Enter');
  await tick();
  assert.equal(asked, 1);
  assert.ok(!JSON.stringify(editor.getJSON()).includes('"text"'), 'the slash and the search text are gone');
  editor.destroy();
});

test('a click on an item of the menu picks it', async () => {
  const editor = await slashEditor();
  await type(editor, '/quote');
  rows()[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(editor.getJSON().content[0].type, 'blockquote');
  editor.destroy();
});

// ---------- The emoji menu ----------

test('typing a colon and two letters opens the emoji menu, and Enter makes the emoji', async () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.focus('end');
  await type(editor, ':s');
  assert.equal(menu(), null, 'one letter is too few');
  await type(editor, 'mi');
  assert.ok(menu().classList.contains('rme-emoji-menu') || menu(), 'the menu is open');
  assert.ok(
    titles().some((title) => title.includes('smile')),
    titles().join(),
  );
  assert.equal(press(editor, 'Enter'), true);
  await tick();
  assert.equal(menu(), null);
  const names = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'emoji') names.push(node.attrs.name);
  });
  assert.equal(names.length, 1);
  assert.equal(editor.getText().includes(':s'), false, 'the typed code is gone');
  assert.match(getMarkdown(editor), /^:[a-z0-9_+-]+:$/);
  editor.destroy();
});

test('the emoji menu closes when no code matches', async () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.focus('end');
  await type(editor, ':smi');
  assert.ok(menu());
  await type(editor, 'qzxw');
  assert.equal(menu(), null, 'the emoji menu is hidden when nothing matches, not shown with a message');
  editor.destroy();
});

// ---------- The front matter item ----------

async function frontMatterEditor(state) {
  const editor = makeEditor(createEditor, '', {
    extensions: [
      createSlashMenu({
        onPickMedia() {},
        hasFrontMatter: () => state.has,
        onAddFrontMatter: () => state.added++,
      }),
    ],
  });
  editor.commands.focus('end');
  return editor;
}

test('the menu has a front matter item only while the file has no front matter', async () => {
  const state = { has: false, added: 0 };
  const editor = await frontMatterEditor(state);
  await type(editor, '/');
  assert.ok(titles().includes('Front matter'), 'a file without front matter gets the item');
  editor.commands.clearContent();
  await tick();

  state.has = true;
  await type(editor, '/');
  assert.ok(!titles().includes('Front matter'), 'a file with front matter does not');
  await type(editor, 'front');
  assert.deepEqual(titles(), [], 'not even when the user searches for it');
  editor.destroy();
});

test('the front matter item removes the slash, adds the block once and leaves the Markdown alone', async () => {
  const state = { has: false, added: 0 };
  const editor = await frontMatterEditor(state);
  await type(editor, '/yaml');
  assert.deepEqual(titles(), ['Front matter'], 'the keywords find it');
  assert.equal(press(editor, 'Enter'), true);
  await tick();
  assert.equal(state.added, 1);
  assert.equal(editor.getText(), '', 'the text of the slash is gone');
  editor.destroy();
});

test('a menu without the front matter options has no front matter item', async () => {
  const editor = await slashEditor();
  await type(editor, '/front');
  assert.deepEqual(titles(), []);
  editor.destroy();
});

// ---------- The MDX code item ----------

async function mdxSlashEditor(mdx, markdown = '') {
  const editor = makeEditor(createEditor, markdown, { mdx, extensions: [createSlashMenu({ onPickMedia() {}, mdx })] });
  editor.commands.focus('end');
  return editor;
}

test('the menu has an MDX code item only in an MDX file', async () => {
  const plain = await mdxSlashEditor(false);
  await type(plain, '/mdx');
  assert.deepEqual(titles(), [], 'a Markdown file has no such item');
  plain.destroy();
  const editor = await mdxSlashEditor(true);
  await type(editor, '/');
  assert.ok(titles().includes('MDX code'));
  editor.commands.clearContent();
  await tick();
  await type(editor, '/jsx');
  assert.deepEqual(titles(), ['MDX code'], 'the keywords find it');
  editor.destroy();
});

test('the MDX code item adds an empty MDX block, removes the slash, and puts the cursor in the block', async () => {
  const editor = await mdxSlashEditor(true);
  await type(editor, '/mdx');
  assert.equal(press(editor, 'Enter'), true);
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 80));
  const types = editor.getJSON().content.map((node) => node.type);
  assert.ok(types.includes('mdxBlock'), `an MDX block is in the document: ${types}`);
  assert.ok(!JSON.stringify(editor.getJSON()).includes('"text":"/'), 'the slash is gone');
  const area = editor.view.dom.querySelector('.rme-raw textarea');
  assert.equal(area.value, '');
  assert.equal(area.placeholder, 'Write MDX here, for example <Counter />');
  assert.ok(document.activeElement === area, 'the cursor is in the text box of the block');
  assert.equal(editor.view.dom.querySelector('.rme-raw-label').textContent, 'MDX code');

  // The user types a component. The file gets it as written.
  area.value = '<Counter start={3} />';
  area.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.ok(getMarkdown(editor).includes('<Counter start={3} />'));
  editor.destroy();
});

test('an MDX code block that the user leaves empty adds nothing to the file', async () => {
  const editor = await mdxSlashEditor(true, 'before\n\nafter\n');
  editor.commands.insertContentAt(8, { type: 'mdxBlock', attrs: { raw: '' } });
  assert.equal(getMarkdown(editor).trim(), 'before\n\nafter');
  editor.destroy();
});
