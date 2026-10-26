// Tests of the handle that moves and deletes a block: a grip and a trash button at the left of the block under the pointer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
const { blockAtHeight } = await loadModule('webview/blockHandle.ts', 'blockHandle');

const frame = () => new Promise((resolve) => setTimeout(resolve, 60));

/** jsdom has no layout. Each top level block gets 40 pixels, one under the other. */
function layOut(editor) {
  let index = 0;
  editor.state.doc.forEach((_node, offset) => {
    const dom = editor.view.nodeDOM(offset);
    const top = index * 40;
    dom.getBoundingClientRect = () => ({ top, bottom: top + 30, left: 0, right: 100, width: 100, height: 30 });
    index++;
  });
}

const handleOf = (editor) => editor.view.dom.parentElement.querySelector('.rme-block-handle');
const hoverAt = async (editor, clientY) => {
  editor.view.dom.parentElement.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientY }));
  await frame();
};

test('the block at a height is the top level block, and a gap belongs to the block above', () => {
  const editor = makeEditor(createEditor, 'one\n\n- a\n- b\n\nthree');
  layOut(editor);
  assert.equal(blockAtHeight(editor.view, 10).node.type.name, 'paragraph');
  assert.equal(blockAtHeight(editor.view, 50).node.type.name, 'bulletList', 'a list is one block');
  assert.equal(blockAtHeight(editor.view, 85).node.type.name, 'paragraph');
  assert.equal(blockAtHeight(editor.view, 500), undefined, 'below the last block');
  editor.destroy();
});

test('the handle shows next to the block under the pointer, and hides when the pointer leaves', async () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo');
  layOut(editor);
  const handle = handleOf(editor);
  assert.equal(handle.hidden, true, 'it starts hidden');
  await hoverAt(editor, 45);
  assert.equal(handle.hidden, false);
  assert.equal(handle.style.top, '40px', 'it sits at the top of the second block');
  const host = editor.view.dom.parentElement;
  host.dispatchEvent(new window.MouseEvent('mouseleave'));
  assert.equal(handle.hidden, false, 'it waits a moment, so that the pointer can reach it');
  handle.dispatchEvent(new window.MouseEvent('mouseenter'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(handle.hidden, false, 'it stays while the pointer is on it');
  handle.dispatchEvent(new window.MouseEvent('mouseleave'));
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(handle.hidden, true, 'it goes after the pointer leaves');
  editor.destroy();
});

test('the trash button deletes the block under the pointer and keeps the others', async () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo\n\nthree');
  layOut(editor);
  await hoverAt(editor, 45);
  handleOf(editor).querySelector('.rme-block-trash').click();
  assert.equal(getMarkdown(editor).trim(), 'one\n\nthree');
  assert.equal(handleOf(editor).hidden, true, 'the handle goes with the block');
  editor.destroy();
});

test('the trash button deletes a whole list and the only block of a document', async () => {
  const editor = makeEditor(createEditor, '- a\n- b');
  layOut(editor);
  await hoverAt(editor, 10);
  handleOf(editor).querySelector('.rme-block-trash').click();
  assert.equal(getMarkdown(editor).trim(), '');
  assert.equal(editor.state.doc.childCount, 1, 'one empty paragraph stays');
  editor.destroy();
});

test('a click on the grip selects the block', async () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo');
  layOut(editor);
  await hoverAt(editor, 45);
  handleOf(editor).querySelector('.rme-block-grip').click();
  const { selection } = editor.state;
  assert.equal(selection.node?.textContent, 'two');
  editor.destroy();
});

/** Start a drag of the block at a height, and drop it at another height like the editor does after a real drop. */
async function dragBlock(editor, fromY, toY) {
  await hoverAt(editor, fromY);
  const grip = handleOf(editor).querySelector('.rme-block-grip');
  const start = new window.Event('dragstart', { bubbles: true, cancelable: true });
  start.dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '' };
  grip.dispatchEvent(start);
  assert.ok(editor.view.dragging, 'the editor knows the block that moves');
  assert.equal(editor.view.dragging.move, true);
  const over = new window.Event('dragover', { bubbles: true, cancelable: true });
  over.clientY = toY;
  editor.view.dom.dispatchEvent(over);
  const line = editor.view.dom.parentElement.querySelector('.rme-block-drop-line');
  const lineShown = !line.hidden;
  const lineTop = line.style.top;
  const drop = new window.Event('drop', { bubbles: true, cancelable: true });
  drop.clientY = toY;
  const plugin = editor.view.state.plugins.find((entry) => entry.props.handleDrop);
  const handled = plugin.props.handleDrop(editor.view, drop);
  editor.view.dom.parentElement.dispatchEvent(new window.Event('drop'));
  grip.dispatchEvent(new window.Event('dragend', { bubbles: true }));
  assert.equal(editor.view.dragging, null, 'the move ends with the drag');
  return { handled, lineShown, lineTop };
}

test('dragging the grip moves a block to the top, to the middle and to the end', async () => {
  const cases = [
    // The third block (height 85) goes above the first one.
    [85, 5, 'three\n\none\n\ntwo'],
    // The first block goes below the second one: the lower half of the second block.
    [5, 65, 'two\n\none\n\nthree'],
    // The first block goes to the end.
    [5, 500, 'two\n\nthree\n\none'],
    // A drop next to the block itself changes nothing.
    [45, 45, 'one\n\ntwo\n\nthree'],
  ];
  for (const [fromY, toY, expected] of cases) {
    const editor = makeEditor(createEditor, 'one\n\ntwo\n\nthree');
    layOut(editor);
    const result = await dragBlock(editor, fromY, toY);
    assert.equal(result.handled, true);
    assert.equal(getMarkdown(editor).trim(), expected, `${fromY} to ${toY}`);
    editor.destroy();
  }
});

test('a block that is dropped on a list lands next to the list, never inside it', async () => {
  const editor = makeEditor(createEditor, 'one\n\n- a\n- b\n\nthree');
  layOut(editor);
  // The list is the second block (height 40 to 70). The pointer is in its upper half.
  const result = await dragBlock(editor, 85, 45);
  assert.equal(result.handled, true);
  assert.equal(getMarkdown(editor).trim(), 'one\n\nthree\n\n- a\n- b');
  editor.destroy();
});

test('the drop line shows where the block lands while it is dragged', async () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo\n\nthree');
  layOut(editor);
  const result = await dragBlock(editor, 5, 65);
  assert.equal(result.lineShown, true);
  assert.equal(result.lineTop, '70px', 'the line is at the bottom of the second block');
  const line = editor.view.dom.parentElement.querySelector('.rme-block-drop-line');
  assert.equal(line.hidden, true, 'the line goes when the drag ends');
  editor.destroy();
});

test('a drop of something else, such as an image from the desktop, is left to the editor', () => {
  const editor = makeEditor(createEditor, 'one');
  const plugin = editor.view.state.plugins.find((entry) => entry.props.handleDrop);
  assert.equal(plugin.props.handleDrop(editor.view, new window.Event('drop')), false);
  editor.destroy();
});

test('typing hides the handle, and the editor removes it when it is destroyed', async () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo');
  layOut(editor);
  const host = editor.view.dom.parentElement;
  await hoverAt(editor, 10);
  assert.equal(handleOf(editor).hidden, false);
  editor.view.dom.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  assert.equal(handleOf(editor).hidden, true);
  editor.destroy();
  assert.equal(host.querySelector('.rme-block-handle'), null);
});
