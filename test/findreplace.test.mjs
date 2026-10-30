import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, createFindReplaceBar, getMarkdown } = await loadModule('webview/editor.ts', 'findreplace-editor');

function setup(markdown) {
  const editor = makeEditor(createEditor, markdown);
  const bar = createFindReplaceBar(editor);
  const input = barElement().querySelector('[aria-label="Find"]');
  const replacement = barElement().querySelector('[aria-label="Replace"]');
  const action = (name) => barElement().querySelector(`[data-action="${name}"]`);
  function barElement() {
    return document.querySelector('.rme-find-bar');
  }
  function search(query) {
    input.value = query;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  return { editor, bar, input, replacement, action, search };
}

test('find highlights and navigates through case-insensitive matches', () => {
  const { editor, bar, input, action } = setup('One **one** ONE');
  window.dispatchEvent(new window.CustomEvent('rme-find-shortcut', { detail: 'find' }));
  input.value = 'one';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(document.querySelector('.rme-find-count').textContent, '1 of 3');
  assert.equal(editor.view.dom.querySelectorAll('.rme-find-match').length, 3);

  action('next').click();
  assert.equal(document.querySelector('.rme-find-count').textContent, '2 of 3');
  action('previous').click();
  assert.equal(document.querySelector('.rme-find-count').textContent, '1 of 3');

  action('case').click();
  assert.equal(document.querySelector('.rme-find-count').textContent, '1 of 1');
  assert.equal(action('case').getAttribute('aria-pressed'), 'true');
  bar.destroy();
  editor.destroy();
});

test('replace changes the current match and replace all is one undoable edit', () => {
  const { editor, bar, input, replacement, action } = setup('One **one** ONE');
  window.dispatchEvent(new window.CustomEvent('rme-find-shortcut', { detail: 'replace' }));
  input.value = 'one';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  replacement.value = 'two';

  action('replace').click();
  assert.equal(getMarkdown(editor), 'two **one** ONE', 'replace changes the active occurrence');

  action('replace-all').click();
  assert.equal(getMarkdown(editor), 'two **two** two', 'replace all updates every remaining match');
  editor.commands.undo();
  assert.equal(getMarkdown(editor), 'two **one** ONE', 'replace all is a single undo step');
  bar.destroy();
  editor.destroy();
});

test('Find and Replace shortcuts open the matching bar mode, and Escape closes it', () => {
  const { editor, bar, input, replacement } = setup('search text');
  const find = new window.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
  window.dispatchEvent(find);
  assert.equal(find.defaultPrevented, true);
  assert.equal(barElement().hidden, false);
  assert.equal(document.activeElement, input);

  const replace = new window.KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true, cancelable: true });
  window.dispatchEvent(replace);
  assert.equal(replace.defaultPrevented, true);
  assert.equal(document.activeElement, replacement);

  replacement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(barElement().hidden, true);
  bar.destroy();
  editor.destroy();

  function barElement() {
    return document.querySelector('.rme-find-bar');
  }
});
