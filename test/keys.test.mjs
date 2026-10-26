// Tests of the key names: how `Mod-Shift-s` shows on a key cap and in a tooltip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';

const { keyParts, formatShortcut } = await loadModule('webview/keys.ts', 'keys');

test('Mod is the Command key on macOS and the Ctrl key elsewhere, and a letter is in upper case', () => {
  assert.deepEqual(keyParts('Mod-Shift-s', true), ['⌘', '⇧', 'S']);
  assert.deepEqual(keyParts('Mod-Shift-s', false), ['Ctrl', 'Shift', 'S']);
  assert.deepEqual(keyParts('Mod-Alt-1', true), ['⌘', '⌥', '1']);
  assert.deepEqual(keyParts('Mod-Alt-1', false), ['Ctrl', 'Alt', '1']);
});

test('a punctuation key stays as it is', () => {
  assert.deepEqual(keyParts('Mod-.', false), ['Ctrl', '.']);
  assert.deepEqual(keyParts('Mod-,', true), ['⌘', ',']);
  assert.deepEqual(keyParts('/', false), ['/']);
  assert.deepEqual(keyParts(':', true), [':']);
});

test('the named keys have a short name, and the arrows have an arrow', () => {
  assert.deepEqual(keyParts('Enter', true), ['↵']);
  assert.deepEqual(keyParts('Enter', false), ['Enter']);
  assert.deepEqual(keyParts('Shift-Tab', true), ['⇧', '⇥']);
  assert.deepEqual(keyParts('Shift-Tab', false), ['Shift', 'Tab']);
  assert.deepEqual(keyParts('Backspace', true), ['⌫']);
  assert.deepEqual(keyParts('Backspace', false), ['Backspace']);
  assert.deepEqual(keyParts('Escape', true), ['Esc']);
  assert.deepEqual(keyParts('Escape', false), ['Esc']);
  assert.deepEqual(keyParts('ArrowUp', false), ['↑']);
  assert.deepEqual(keyParts('ArrowDown', true), ['↓']);
  assert.deepEqual(keyParts('Mod-Click', false), ['Ctrl', 'Click']);
});

test('a tooltip writes the keys together on macOS and with a plus elsewhere', () => {
  assert.equal(formatShortcut('Mod-Shift-s', true), '⌘⇧S');
  assert.equal(formatShortcut('Mod-Shift-s', false), 'Ctrl+Shift+S');
  assert.equal(formatShortcut('Mod-b', true), '⌘B');
  assert.equal(formatShortcut('Mod-b', false), 'Ctrl+B');
  assert.equal(formatShortcut('Mod-.', false), 'Ctrl+.');
});

test('a page on a Mac gets the Mac keys without a call that says so', async () => {
  // The module reads navigator.platform when it loads, so the test sets the platform first and loads a new copy.
  Object.defineProperty(globalThis.navigator, 'platform', { value: 'MacIntel', configurable: true });
  try {
    const onMac = await loadModule('webview/keys.ts', 'keysOnMac');
    assert.equal(onMac.isMac, true);
    assert.deepEqual(onMac.keyParts('Mod-Shift-s'), ['⌘', '⇧', 'S']);
    assert.equal(onMac.formatShortcut('Mod-k'), '⌘K');
  } finally {
    delete globalThis.navigator.platform;
  }
  const elsewhere = await loadModule('webview/keys.ts', 'keysElsewhere');
  assert.equal(elsewhere.isMac, false, 'the platform of the test is not a Mac');
  assert.equal(elsewhere.formatShortcut('Mod-k'), 'Ctrl+K');
});

test('the platform of the page decides when the call does not say', () => {
  // jsdom is not a Mac, so the default is the Ctrl form.
  assert.deepEqual(keyParts('Mod-k'), ['Ctrl', 'K']);
  assert.equal(formatShortcut('Mod-k'), 'Ctrl+K');
});
