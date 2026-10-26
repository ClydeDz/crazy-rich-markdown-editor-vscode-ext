// Tests of how the user edits math: the field of inline math, and the text area of a math block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');

const frame = () => new Promise((resolve) => setTimeout(resolve, 50));
const key = (name) => new window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });

function positionOfNode(editor, name) {
  let found;
  editor.state.doc.descendants((node, pos) => {
    if (found === undefined && node.type.name === name) found = pos;
  });
  return found;
}

/** An editor with one inline formula that is open for editing. */
function openInline(markdown = 'a $x^2$ b') {
  const editor = makeEditor(createEditor, markdown);
  const pos = positionOfNode(editor, 'mathInline');
  editor.commands.setNodeSelection(pos);
  const input = editor.view.dom.querySelector('.rme-math-input');
  return { editor, pos, input, view: editor.view.dom.querySelector('.rme-math-view'), box: editor.view.dom.querySelector('.rme-math') };
}

function openBlock(markdown = '$$\nx\n$$') {
  const editor = makeEditor(createEditor, markdown);
  const pos = positionOfNode(editor, 'mathBlock');
  editor.commands.setNodeSelection(pos);
  const area = editor.view.dom.querySelector('textarea.rme-math-input');
  return { editor, pos, area, view: editor.view.dom.querySelector('.rme-math-block .rme-math-view'), box: editor.view.dom.querySelector('.rme-math-block') };
}

// ---------- Inline math ----------

test('inline math shows the formula, and opens a field with the TeX when it is selected', async () => {
  const { editor, input, view, box } = openInline();
  assert.equal(box.contentEditable, 'false');
  assert.equal(box.classList.contains('is-editing'), true);
  assert.equal(view.hidden, true, 'the picture is hidden while the field is open');
  assert.equal(input.hidden, false);
  assert.equal(input.value, 'x^2');
  assert.equal(input.getAttribute('aria-label'), 'TeX');
  assert.equal(input.size, 4, 'at least four characters wide');
  await frame();
  assert.ok(document.activeElement === input, 'the field has the focus');
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, 3, 'all of the TeX is selected');
  editor.destroy();
});

test('the field of inline math is as wide as its text, and not narrower than four characters', () => {
  const { editor, input } = openInline('a $x^2+y^2+z^2$ b');
  assert.equal(input.size, 12, 'eleven characters and one more');
  input.value = 'abcdefgh';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(input.size, 9);
  input.value = 'a';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(input.size, 4);
  editor.destroy();
});

test('Enter saves the TeX of inline math and puts the cursor after the formula', () => {
  const { editor, pos, input } = openInline();
  input.value = '  y^3 ';
  const enter = key('Enter');
  input.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(getMarkdown(editor), 'a $y^3$ b', 'the TeX is saved, without the spaces at the ends');
  assert.equal(editor.state.selection.empty, true);
  assert.equal(editor.state.selection.from, pos + 1, 'the cursor is after the formula');
  assert.equal(editor.view.dom.querySelector('.rme-math-input').hidden, true, 'the field closes');
  assert.equal(editor.view.dom.querySelector('.rme-math-view').hidden, false);
  assert.ok(editor.view.dom.querySelector('.rme-math-view .katex'), 'the new formula is drawn');
  editor.destroy();
});

test('Enter with an empty field removes the formula and does not fail', () => {
  const { editor, input } = openInline();
  input.value = '';
  input.dispatchEvent(key('Enter'));
  assert.equal(getMarkdown(editor), 'a  b');
  assert.equal(editor.view.dom.querySelectorAll('.rme-math').length, 0);
  editor.destroy();
});

test('Escape puts the old TeX back, keeps the document as it was, and does not reach the rest of the page', () => {
  const { editor, pos, input } = openInline();
  input.value = 'changed';
  let reached = false;
  const spy = () => (reached = true);
  document.addEventListener('keydown', spy);
  const escape = key('Escape');
  try {
    input.dispatchEvent(escape);
  } finally {
    document.removeEventListener('keydown', spy);
  }
  assert.equal(escape.defaultPrevented, true);
  assert.equal(reached, false, 'VS Code must not see the key');
  assert.equal(input.value, 'x^2', 'the old TeX is back');
  assert.equal(editor.state.selection.from, pos + 1, 'the cursor is after the formula');
  assert.equal(getMarkdown(editor), 'a $x^2$ b');
  editor.destroy();
});

test('leaving the field saves the change only while it is open, and a text that did not change makes no change', () => {
  const { editor, pos, input } = openInline();
  let changes = 0;
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++;
  });
  input.value = 'x^2';
  input.dispatchEvent(new window.Event('blur'));
  assert.equal(changes, 0, 'the same TeX: no change');

  input.value = 'z';
  input.dispatchEvent(key('Enter'));
  assert.equal(getMarkdown(editor), 'a $z$ b');
  assert.equal(changes, 1);

  // The field is closed now. A blur must not save what is still in it.
  const closed = editor.view.dom.querySelector('.rme-math-input');
  assert.equal(closed.hidden, true);
  closed.value = 'ignored';
  closed.dispatchEvent(new window.Event('blur'));
  assert.equal(getMarkdown(editor), 'a $z$ b');
  assert.equal(changes, 1);
  void pos;
  editor.destroy();
});

test('while the field is open, a change of the node does not draw the formula again, and the field keeps what the user typed', () => {
  const { editor, pos, input, box, view } = openInline();
  input.value = 'typed but not saved';
  view.innerHTML = 'marker';
  // The same transaction changes the node and selects it again, so the field stays open.
  editor
    .chain()
    .command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { tex: 'q', backtick: false });
      return true;
    })
    .setNodeSelection(pos)
    .run();
  assert.ok(editor.view.dom.querySelector('.rme-math') === box, 'the element is not made again');
  assert.equal(box.classList.contains('is-editing'), true, 'the field is still open');
  assert.equal(input.hidden, false);
  assert.equal(view.innerHTML, 'marker', 'the picture is not drawn again while the field is open');
  assert.equal(input.value, 'typed but not saved');

  editor.commands.setTextSelection(1);
  assert.equal(box.classList.contains('is-editing'), false, 'the field closes when the selection moves away');
  assert.equal(view.hidden, false);
  assert.equal(input.hidden, true);
  assert.ok(view.innerHTML.includes('katex'), 'the picture shows the new TeX when the field closes');
  assert.ok(view.textContent.includes('q'));
  editor.destroy();
});

test('a change of an inline formula that is not open shows at once', () => {
  const editor = makeEditor(createEditor, 'a $x$ b');
  const pos = positionOfNode(editor, 'mathInline');
  const box = editor.view.dom.querySelector('.rme-math');
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { tex: '\\frac{1}{2}', backtick: false }));
  assert.ok(editor.view.dom.querySelector('.rme-math') === box, 'the element is not made again');
  assert.ok(box.querySelector('.rme-math-view .katex'), 'drawn again');
  assert.ok(box.querySelector('.rme-math-view').innerHTML.includes('mfrac') || box.querySelector('.rme-math-view').innerHTML.includes('frac'));
  editor.destroy();
});

// ---------- Math blocks ----------

test('a math block opens a text area with the TeX when it is selected, and the picture hides', async () => {
  const { editor, area, view, box } = openBlock('$$\na + b\n$$');
  assert.equal(box.classList.contains('is-editing'), true);
  assert.equal(area.hidden, false);
  assert.equal(area.value, 'a + b');
  assert.equal(area.rows, 1);
  assert.equal(area.getAttribute('aria-label'), 'TeX');
  assert.equal(area.spellcheck, false);
  await frame();
  assert.ok(document.activeElement === area, 'the text area has the focus');
  void view;
  editor.destroy();
});

test('the text area of a math block grows with its text, when the page can measure it', async () => {
  const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'scrollHeight');
  let height = 0;
  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => height });
  try {
    const { editor, area } = openBlock();
    await frame();
    assert.equal(area.style.height, 'auto', 'a page that cannot measure keeps the automatic height');
    height = 84;
    area.value = 'a\nb\nc';
    area.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(area.style.height, '84px');
    height = 0;
    area.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(area.style.height, 'auto');
    editor.destroy();
  } finally {
    if (original) Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', original);
    else delete window.HTMLElement.prototype.scrollHeight;
  }
});

test('leaving a math block saves the TeX without the empty lines at the start and the spaces at the end', () => {
  const { editor, area } = openBlock('$$\nx\n$$');
  area.value = '\n\n  a + b\n= c  \n\n';
  area.dispatchEvent(new window.Event('blur'));
  assert.equal(getMarkdown(editor), '$$\n  a + b\n= c\n$$');
  editor.destroy();
});

test('a math block that was written in one line is written in lines after an edit', () => {
  const { editor, area } = openBlock('$$a^2$$');
  area.value = 'b^2';
  area.dispatchEvent(new window.Event('blur'));
  assert.equal(getMarkdown(editor), '$$\nb^2\n$$');
  editor.destroy();
});

test('Escape in a math block puts the old TeX back, moves the cursor after the block, and does not reach the page', () => {
  const { editor, pos, area } = openBlock('$$\nx\n$$\n\nafter');
  area.value = 'changed';
  let reached = false;
  const spy = () => (reached = true);
  document.addEventListener('keydown', spy);
  const escape = key('Escape');
  try {
    area.dispatchEvent(escape);
  } finally {
    document.removeEventListener('keydown', spy);
  }
  assert.equal(escape.defaultPrevented, true);
  assert.equal(reached, false);
  assert.equal(area.value, 'x');
  assert.equal(editor.state.selection.from, pos + 1, 'the cursor is after the block');
  assert.equal(getMarkdown(editor), '$$\nx\n$$\n\nafter');
  editor.destroy();
});

test('other keys in the text area of a math block are left alone', () => {
  const { editor, area } = openBlock();
  for (const name of ['Enter', 'a', 'Backspace']) {
    const event = key(name);
    area.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, name);
  }
  editor.destroy();
});

test('a math block saves only while it is open, and a text that did not change makes no change', () => {
  const { editor, area } = openBlock();
  let changes = 0;
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++;
  });
  area.dispatchEvent(new window.Event('blur'));
  assert.equal(changes, 0, 'the same TeX: no change');
  editor.commands.setTextSelection(1);
  const closed = editor.view.dom.querySelector('textarea.rme-math-input');
  assert.equal(closed.hidden, true, 'the text area closes when the selection moves away');
  closed.value = 'ignored';
  closed.dispatchEvent(new window.Event('blur'));
  assert.equal(getMarkdown(editor), '$$\nx\n$$');
  assert.equal(changes, 0);
  editor.destroy();
});

test('a math block draws the new formula when the node changes, and keeps its element', () => {
  const { editor, pos, box, view } = openBlock();
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { tex: 'q^2', oneLine: false }));
  assert.ok(editor.view.dom.querySelector('.rme-math-block') === box, 'the element is not made again');
  editor.commands.setTextSelection(1);
  assert.equal(view.hidden === false || view.hidden === undefined, true);
  assert.ok(view.textContent.includes('q'));
  assert.equal(box.classList.contains('is-editing'), false);
  assert.equal(box.querySelector('textarea').hidden, true);
  editor.destroy();
});

test('insertMathBlock puts the new block where the cursor is, opens it, and picks the right block when the TeX is the same', () => {
  const editor = makeEditor(createEditor, '$$\nx^2 + y^2 = z^2\n$$\n\nlast');
  editor.commands.focus('end');
  editor.commands.insertMathBlock();
  const positions = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'mathBlock') positions.push(pos);
  });
  assert.equal(positions.length, 2, 'a second block');
  assert.equal(editor.state.selection.from, positions[1], 'the new block is the one that is selected, not the first');
  assert.equal(editor.state.selection.node?.type.name, 'mathBlock');

  const custom = makeEditor(createEditor, 'text');
  custom.commands.focus('end');
  custom.commands.insertMathBlock('E = mc^2');
  assert.equal(getMarkdown(custom), 'text\n\n$$\nE = mc^2\n$$');
  editor.destroy();
  custom.destroy();
});

test('Tab in the text area of a math block types a tab and does not move the focus', () => {
  const { editor, area } = openBlock();
  area.value = 'ab';
  area.setSelectionRange(1, 1);
  const event = key('Tab');
  area.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, 'the browser does not move the focus');
  assert.equal(area.value, 'a\tb');
  assert.equal(area.selectionStart, 2, 'the cursor is after the tab');
  const shifted = new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  area.dispatchEvent(shifted);
  assert.equal(shifted.defaultPrevented, false, 'Shift+Tab still leaves the field');
  editor.destroy();
});
