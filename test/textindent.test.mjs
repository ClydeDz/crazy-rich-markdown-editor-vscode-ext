// Tests of Tab and Enter in the front matter field: the indent is spaces, and the key does not leave the field.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';

const { indentChange, newLineChange, applyTextChange, INDENT } = await loadModule('webview/textIndent.ts', 'textIndent');

/** The text after a change. */
const run = (value, start, end, change) => ({
  value: value.slice(0, change.from) + change.text + value.slice(change.to),
  selection: [change.selectStart, change.selectEnd],
});

test('the indent is two spaces, never a tab', () => {
  assert.equal(INDENT, '  ');
  const result = run('a: 1', 0, 0, indentChange('a: 1', 0, 0, false));
  assert.equal(result.value, '  a: 1');
  assert.ok(!result.value.includes('\t'));
});

test('Tab with a cursor types the indent at the cursor and moves the cursor after it', () => {
  const result = run('key:', 4, 4, indentChange('key:', 4, 4, false));
  assert.equal(result.value, 'key:  ');
  assert.deepEqual(result.selection, [6, 6]);
});

test('Tab with a selection in one line replaces the selection', () => {
  const result = run('abc', 1, 2, indentChange('abc', 1, 2, false));
  assert.equal(result.value, 'a  c');
});

test('Tab with a selection over several lines indents each line and keeps the selection', () => {
  const value = 'a\nb\nc';
  const result = run(value, 0, 3, indentChange(value, 0, 3, false));
  assert.equal(result.value, '  a\n  b\nc');
  assert.deepEqual(result.selection, [2, 7]);
  assert.equal(result.value.slice(...result.selection), 'a\n  b');
});

test('a line that starts where the selection ends is not indented', () => {
  const value = 'a\nb\nc';
  const result = run(value, 0, 4, indentChange(value, 0, 4, false));
  assert.equal(result.value, '  a\n  b\nc');
});

test('Shift+Tab takes one level, or one space, from each line, and leaves a line without indent', () => {
  const value = '    a\n b\nc';
  const result = run(value, 0, value.length, indentChange(value, 0, value.length, true));
  assert.equal(result.value, '  a\nb\nc');
});

test('Shift+Tab with a cursor outdents the line and keeps the cursor on its text', () => {
  const value = '  a: 1';
  const result = run(value, 5, 5, indentChange(value, 5, 5, true));
  assert.equal(result.value, 'a: 1');
  assert.deepEqual(result.selection, [3, 3]);
});

test('Shift+Tab never moves the selection before the start of the line', () => {
  const value = 'x\n  a';
  const result = run(value, 2, 2, indentChange(value, 2, 2, true));
  assert.equal(result.value, 'x\na');
  assert.deepEqual(result.selection, [2, 2]);
});

test('Enter keeps the indent of the line, and a line that ends with a colon gets one more level', () => {
  const same = run('  a: 1', 6, 6, newLineChange('  a: 1', 6, 6));
  assert.equal(same.value, '  a: 1\n  ');
  assert.deepEqual(same.selection, [9, 9]);
  const deeper = run('tags:', 5, 5, newLineChange('tags:', 5, 5));
  assert.equal(deeper.value, 'tags:\n  ');
  const nested = run('  list:', 7, 7, newLineChange('  list:', 7, 7));
  assert.equal(nested.value, '  list:\n    ');
});

test('Enter in the middle of a line splits the line and keeps the indent', () => {
  const result = run('  ab', 3, 3, newLineChange('  ab', 3, 3));
  assert.equal(result.value, '  a\n  b');
});

test('applyTextChange changes the field, selects the result and tells the page about the input', () => {
  const area = document.createElement('textarea');
  document.body.append(area);
  area.value = 'a\nb';
  let inputs = 0;
  area.addEventListener('input', () => inputs++);
  area.focus();
  applyTextChange(area, indentChange(area.value, 0, 3, false));
  assert.equal(area.value, '  a\n  b');
  assert.equal(area.selectionStart, 2);
  assert.ok(inputs >= 1, 'the page saves the change');
  area.remove();
});
