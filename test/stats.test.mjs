import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule, makeEditor } from './helpers.mjs';

const { countLines, countWords, countCharacters, documentStats, proseText, createStatsBar } = await loadModule(
  'webview/stats.ts',
  'stats',
);
const { createEditor } = await loadModule('webview/editor.ts', 'editor');

test('countLines counts the lines of a file', () => {
  const cases = [
    ['', 0],
    ['a', 1],
    ['a\n', 1],
    ['a\nb', 2],
    ['a\nb\n', 2],
    ['\n', 1],
    ['\n\n', 2],
    ['a\n\nb\n', 3],
    ['a\r\nb\r\n', 2],
    ['a\rb', 2],
  ];
  for (const [text, lines] of cases) {
    assert.equal(countLines(text), lines, JSON.stringify(text));
  }
});

test('countWords counts words that have a letter or a digit', () => {
  const cases = [
    ['', 0],
    ['   \n ', 0],
    ['Hello brave world', 3],
    ['one\ntwo\n\nthree', 3],
    ['e-mail me', 2],
    ["don't stop", 2],
    ['3.14 is pi', 3],
    ['café au lait', 3],
    ['word — word', 2],
    ['- … *', 0],
    ['https://example.com/a?b=c', 1],
  ];
  for (const [text, words] of cases) {
    assert.equal(countWords(text), words, JSON.stringify(text));
  }
});

test('countWords counts each Chinese, Japanese and Korean letter of a word group', () => {
  assert.equal(countWords('你好世界'), 4);
  assert.equal(countWords('こんにちは'), 5);
  assert.equal(countWords('Hello 世界 world'), 4);
  assert.equal(countWords('日本語text'), 4);
});

test('countCharacters ignores line breaks and counts a symbol as one', () => {
  assert.equal(countCharacters('a b\nc'), 4);
  assert.equal(countCharacters('a b\nc', { spaces: false }), 3);
  assert.equal(countCharacters('😀a'), 2);
  assert.equal(countCharacters('a\r\nb'), 2);
  assert.equal(countCharacters(''), 0);
  assert.equal(countCharacters(' \t\n ', { spaces: false }), 0);
});

test('documentStats reads the lines from the file and the rest from the text', () => {
  const stats = documentStats('---\ntitle: x\n---\n\n# Hi\n\nOne two.\n', 'Hi\nOne two.');
  assert.deepEqual(stats, { lines: 7, words: 3, characters: 10, charactersWithoutSpaces: 9 });
});

test('proseText holds the text that a reader sees, and nothing else', () => {
  const editor = makeEditor(
    createEditor,
    '# Title\n\nHello **brave** world :tada:\n\n- one\n- two\n\n```js\nconst a = 1;\n```\n\nline  \nbreak\n',
  );
  const text = proseText(editor);
  assert.equal(text, 'Title\nHello brave world 🎉\none\ntwo\nconst a = 1;\nline\nbreak');
  // Title 1, Hello brave world 3 (the emoji has no letter), one two 2, `const a = 1;` 3 (the `=` is not a word), line break 2.
  assert.equal(countWords(text), 11);
  editor.destroy();
});

test('proseText leaves out the Markdown marks and the blocks that are not text', () => {
  const editor = makeEditor(createEditor, '**bold** and `code`\n\n$$\nx^2\n$$\n\n<div>raw</div>\n\n![alt text](a.png)\n');
  const text = proseText(editor);
  assert.ok(text.includes('bold and code'), JSON.stringify(text));
  for (const hidden of ['**', '`', 'x^2', '<div>', 'raw', 'alt text', 'a.png']) {
    assert.ok(!text.includes(hidden), `${hidden} is not in ${JSON.stringify(text)}`);
  }
  editor.destroy();
});

test('proseText of an empty document is empty', () => {
  const editor = makeEditor(createEditor, '');
  assert.equal(proseText(editor), '');
  assert.deepEqual(documentStats('', proseText(editor)), { lines: 0, words: 0, characters: 0, charactersWithoutSpaces: 0 });
  editor.destroy();
});

test('the stats bar stays hidden until it is shown, and then shows the three numbers', () => {
  const element = document.createElement('div');
  element.hidden = true;
  document.body.append(element);
  const bar = createStatsBar(element);
  bar.update({ lines: 12, words: 345, characters: 2011, charactersWithoutSpaces: 1700 });
  assert.equal(element.hidden, true, 'update does not show the bar');
  bar.show();
  assert.equal(element.hidden, false);

  const read = (name) => element.querySelector(`[data-stat="${name}"]`);
  assert.equal(read('lines').dataset.value, '12');
  assert.match(read('lines').textContent, /^12 lines$/);
  assert.equal(read('words').dataset.value, '345');
  assert.match(read('words').textContent, /^345 words$/);
  assert.equal(read('characters').dataset.value, '2011');
  assert.match(read('characters').textContent, /^2\D?011 characters$/, 'the number has a thousands mark');
  assert.match(read('characters').title, /Without spaces: 1\D?700\./);
  assert.equal(element.getAttribute('role'), 'group');
  element.remove();
});

test('the stats bar uses the singular for one and the plural for none', () => {
  const element = document.createElement('div');
  document.body.append(element);
  const bar = createStatsBar(element);
  bar.update({ lines: 1, words: 1, characters: 1, charactersWithoutSpaces: 1 });
  const counts = () => [...element.querySelectorAll('[data-stat]')].map((item) => item.textContent).join('');
  assert.equal(counts(), '1 line1 word1 character');
  bar.update({ lines: 0, words: 0, characters: 0, charactersWithoutSpaces: 0 });
  assert.equal(counts(), '0 lines0 words0 characters');
  element.remove();
});

const alice = { name: 'Alice Smith', date: Date.UTC(2026, 9, 20, 9, 30), subject: 'Add intro' };
const bob = { name: 'Bob Lee', date: Date.UTC(2026, 8, 2, 14, 0), subject: 'Fix the table' };
const carol = { name: 'Carol Diaz', date: Date.UTC(2026, 6, 11, 8, 15), subject: 'First draft' };
const dan = { name: 'Dan Wu', date: Date.UTC(2026, 5, 1, 8, 15), subject: 'Typo' };

function barWithFile(info) {
  const element = document.createElement('div');
  document.body.append(element);
  const bar = createStatsBar(element);
  bar.update({ lines: 1, words: 1, characters: 1, charactersWithoutSpaces: 1 });
  bar.updateFile(info);
  const read = (name) => element.querySelector(`[data-stat="${name}"]`);
  return { element, bar, read };
}

test('the stats bar puts the facts about the file before the counts, and hides them until it has them', () => {
  const { element, read } = barWithFile({});
  assert.deepEqual(
    [...element.querySelectorAll('[data-stat]')].map((item) => item.dataset.stat),
    ['authors', 'modified', 'lines', 'words', 'characters'],
  );
  assert.ok(element.lastElementChild === element.querySelector('[data-action="settings"]'), 'the settings button is the last item');
  assert.equal(read('authors').hidden, true);
  assert.equal(read('modified').hidden, true);
  assert.equal(read('lines').hidden, false);
  element.remove();
});

test('the stats bar shows the date that the file was last saved', () => {
  const when = Date.UTC(2026, 9, 25, 12, 0);
  const { element, read } = barWithFile({ modified: when });
  assert.equal(read('modified').hidden, false);
  assert.match(read('modified').textContent, /^Modified .*2026/);
  assert.equal(read('modified').dataset.value, String(when));
  assert.match(read('modified').title, /2026/);
  assert.equal(read('authors').hidden, true, 'no authors without Git');
  element.remove();
});

test('the stats bar names the authors, and counts the others', () => {
  const one = barWithFile({ authors: [alice] });
  assert.equal(one.read('authors').textContent, 'Edited by Alice Smith');
  assert.equal(one.read('authors').dataset.value, '1');
  one.element.remove();

  const three = barWithFile({ authors: [alice, bob, carol] });
  assert.equal(three.read('authors').textContent, 'Edited by Alice Smith, Bob Lee, Carol Diaz');
  three.element.remove();

  const four = barWithFile({ authors: [alice, bob, carol, dan] });
  assert.equal(four.read('authors').textContent, 'Edited by Alice Smith, Bob Lee, Carol Diaz +1');
  assert.equal(four.read('authors').dataset.value, '4');
  assert.equal(four.read('modified').hidden, true, 'the authors do not need the date');
  four.element.remove();
});

test('the tooltip of the authors lists every author with the date and the commit message', () => {
  const long = { ...dan, subject: 'x'.repeat(120) };
  const { element, read } = barWithFile({ authors: [alice, bob, carol, long] });
  const lines = read('authors').title.split('\n');
  assert.equal(lines.length, 5);
  assert.match(lines[0], /last Git commits, newest first/);
  assert.match(lines[1], /^Alice Smith, .*2026.*: Add intro$/);
  assert.match(lines[2], /^Bob Lee, /);
  assert.ok(lines[4].endsWith('…') && lines[4].length < 120, 'a long message is cut');
  element.remove();
});

test('the stats bar hides the facts again when the host sends none', () => {
  const { element, bar, read } = barWithFile({ modified: Date.UTC(2026, 0, 1), authors: [alice] });
  assert.equal(read('authors').hidden, false);
  bar.updateFile({ authors: [], modified: undefined });
  assert.equal(read('authors').hidden, true);
  assert.equal(read('authors').textContent, '');
  assert.equal(read('modified').hidden, true);
  assert.equal(read('modified').textContent, '');
  bar.updateFile({ modified: Number.NaN });
  assert.equal(read('modified').hidden, true, 'a time that is not a number is not shown');
  element.remove();
});

test('the stats bar stays hidden while it is turned off, and shows again when it is turned on', () => {
  const root = document.documentElement;
  const element = document.createElement('div');
  element.hidden = true;
  document.body.append(element);
  const bar = createStatsBar(element);
  assert.equal(bar.isEnabled(), true, 'the bar is on until the host says it is off');

  bar.setEnabled(false);
  bar.show();
  assert.equal(bar.isEnabled(), false);
  assert.equal(element.hidden, true, 'show does not override the setting');
  assert.equal(root.classList.contains('rme-no-bar'), true, 'the page keeps no room for the bar');

  bar.setEnabled(true);
  assert.equal(element.hidden, false);
  assert.equal(root.classList.contains('rme-no-bar'), false);
  element.remove();
});

test('a bar that was turned off and on before the editor is ready stays hidden until show', () => {
  const element = document.createElement('div');
  element.hidden = true;
  document.body.append(element);
  const bar = createStatsBar(element);
  bar.setEnabled(false);
  bar.setEnabled(true);
  assert.equal(element.hidden, true, 'the editor is not ready yet');
  bar.show();
  assert.equal(element.hidden, false);
  element.remove();
});

test('the tooltip cuts a long commit message at 80 characters with an ellipsis, and keeps a message of exactly 80', () => {
  const exact = { ...dan, subject: 'x'.repeat(80) };
  const long = { ...dan, name: 'Eve Long', subject: 'y'.repeat(81) };
  const { element, read } = barWithFile({ authors: [exact, long] });
  const lines = read('authors').title.split('\n');
  assert.ok(lines[1].endsWith(`: ${'x'.repeat(80)}`), 'a message of 80 characters is whole');
  assert.ok(!lines[1].includes('…'));
  assert.ok(lines[2].endsWith(`: ${'y'.repeat(79)}…`), 'a message of 81 characters is cut to 79 and an ellipsis');
  element.remove();
});

test('the tooltip of an author without a commit message has no colon at the end', () => {
  const { element, read } = barWithFile({ authors: [{ name: 'Fay Quiet', date: Date.UTC(2026, 0, 2), subject: '' }] });
  const line = read('authors').title.split('\n')[1];
  assert.match(line, /^Fay Quiet, .*2026/);
  assert.doesNotMatch(line, /:\s*$/, 'no colon and no empty message at the end');
  element.remove();
});

test('the tooltips go away with the facts', () => {
  const { element, bar, read } = barWithFile({ modified: Date.UTC(2026, 0, 1), authors: [alice] });
  assert.match(read('modified').title, /^The file was last saved to disk on .*2026/);
  assert.ok(read('authors').title.length > 0);
  bar.updateFile({});
  assert.equal(read('authors').title, '');
  assert.equal(read('modified').title, '');
  assert.equal(read('authors').dataset.value, undefined);
  assert.equal(read('modified').dataset.value, undefined);
  element.remove();
});

function barWithButton(options) {
  const element = document.createElement('div');
  document.body.append(element);
  const bar = createStatsBar(element, options);
  const button = element.querySelector('[data-action="settings"]');
  return { element, bar, button };
}

test('the stats bar ends with a settings button that has an icon and the text "Settings"', () => {
  const { element, button } = barWithButton();
  assert.ok(button, 'the button is in the bar');
  assert.equal(button.tagName, 'BUTTON', 'a real button works with the keyboard');
  assert.equal(button.type, 'button');
  assert.equal(button.disabled, false);
  assert.ok(element.lastElementChild === button, 'the button is the last item');
  assert.equal(button.textContent, 'Settings');
  assert.equal(button.getAttribute('aria-label'), 'Open the extension settings');
  assert.equal(button.title, 'Open the extension settings');
  const icon = button.querySelector('svg');
  assert.ok(icon, 'the icon is a picture in the button');
  assert.equal(icon.getAttribute('aria-hidden'), 'true', 'a screen reader reads the label and not the picture');
  assert.equal(icon.getAttribute('viewBox'), '0 0 16 16');
  assert.match(icon.querySelector('path').getAttribute('d'), /^M[\d. ]+L.*Z/s, 'the gear has a path');
  assert.equal(icon.querySelector('path').getAttribute('fill-rule'), 'evenodd', 'the hole in the gear needs this rule');
  assert.ok(button.querySelector('.rme-stats-button-label'), 'the text has its own element, so a narrow editor can hide it');
  element.remove();
});

test('a click on the settings button, on its icon or on its text asks to open the settings once', () => {
  const calls = [];
  const { element, button } = barWithButton({ onOpenSettings: (...args) => calls.push(args) });
  assert.deepEqual(calls, [], 'nothing runs before a click');
  button.click();
  assert.deepEqual(calls, [[]], 'one click, one call, no arguments');
  button.querySelector('svg').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  button.querySelector('.rme-stats-button-label').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(calls.length, 3, 'a click on a part of the button counts');
  element.remove();
});

test('a click on the other items of the bar does not open the settings', () => {
  const calls = [];
  const { element, bar } = barWithButton({ onOpenSettings: () => calls.push('open') });
  bar.update({ lines: 1, words: 1, characters: 1, charactersWithoutSpaces: 1 });
  bar.updateFile({ modified: Date.UTC(2026, 9, 25), authors: [alice] });
  for (const item of element.querySelectorAll('[data-stat]')) {
    item.click();
  }
  element.click();
  assert.deepEqual(calls, []);
  element.remove();
});

test('a settings button without a handler does nothing when the user clicks it', () => {
  const { element, button } = barWithButton();
  button.click();
  assert.ok(button.isConnected, 'the bar still works');
  element.remove();
});

test('the settings button stays the same element when the numbers and the facts change', () => {
  const calls = [];
  const { element, bar, button } = barWithButton({ onOpenSettings: () => calls.push('open') });
  bar.update({ lines: 3, words: 4, characters: 5, charactersWithoutSpaces: 5 });
  bar.updateFile({ modified: Date.UTC(2026, 9, 25), authors: [alice, bob] });
  bar.updateFile({});
  bar.update({ lines: 0, words: 0, characters: 0, charactersWithoutSpaces: 0 });
  assert.ok(element.querySelector('[data-action="settings"]') === button, 'an update does not replace the button');
  assert.equal(element.querySelectorAll('[data-action="settings"]').length, 1);
  assert.equal(button.hidden, false, 'the facts about the file never hide the button');
  button.click();
  assert.deepEqual(calls, ['open']);
  element.remove();
});

test('the settings button goes away with the bar, and comes back with it', () => {
  const { element, bar, button } = barWithButton();
  bar.show();
  assert.equal(element.hidden, false);
  bar.setEnabled(false);
  assert.equal(element.hidden, true, 'the button is inside the bar that the user turned off');
  assert.ok(element.contains(button));
  bar.setEnabled(true);
  assert.equal(element.hidden, false);
  element.remove();
});

test('the shortcuts button comes before the settings button, and has an icon and the text "Shortcuts"', () => {
  const { element, button } = barWithButton();
  const shortcuts = element.querySelector('[data-action="shortcuts"]');
  assert.ok(shortcuts, 'the button is in the bar');
  assert.equal(shortcuts.tagName, 'BUTTON');
  assert.equal(shortcuts.type, 'button');
  assert.equal(shortcuts.textContent, 'Shortcuts');
  assert.equal(shortcuts.getAttribute('aria-label'), 'Show the keyboard shortcuts');
  assert.equal(shortcuts.title, 'Show the keyboard shortcuts');
  assert.equal(shortcuts.getAttribute('aria-haspopup'), 'dialog', 'the button opens a window');
  assert.ok(shortcuts.nextElementSibling === button, 'the settings button follows');
  assert.ok(element.lastElementChild === button, 'the settings button is still the last item');
  const icon = shortcuts.querySelector('svg');
  assert.ok(icon && icon.getAttribute('aria-hidden') === 'true');
  assert.ok(icon.querySelector('rect'), 'the keyboard has a body');
  assert.match(icon.querySelector('path').getAttribute('d'), /^M[\d. ]+h.*z$/i, 'and keys');
  assert.ok(shortcuts.querySelector('.rme-stats-button-label'), 'the text has its own element');
  assert.equal(button.hasAttribute('aria-haspopup'), false, 'the settings button opens no window');
  element.remove();
});

test('each button of the bar asks for its own action, and only that one', () => {
  const calls = [];
  const { element, button } = barWithButton({
    onOpenSettings: () => calls.push('settings'),
    onOpenShortcuts: () => calls.push('shortcuts'),
  });
  const shortcuts = element.querySelector('[data-action="shortcuts"]');
  shortcuts.click();
  assert.deepEqual(calls, ['shortcuts']);
  button.click();
  assert.deepEqual(calls, ['shortcuts', 'settings']);
  shortcuts.querySelector('.rme-stats-button-label').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(calls, ['shortcuts', 'settings', 'shortcuts'], 'a click on the text counts');
  element.remove();
});

test('a shortcuts button without a handler does nothing when the user clicks it', () => {
  const { element } = barWithButton({ onOpenSettings: () => {} });
  const shortcuts = element.querySelector('[data-action="shortcuts"]');
  shortcuts.click();
  assert.ok(shortcuts.isConnected);
  element.remove();
});

test('both buttons stay the same elements when the numbers and the facts change', () => {
  const { element, bar, button } = barWithButton();
  const shortcuts = element.querySelector('[data-action="shortcuts"]');
  bar.update({ lines: 3, words: 4, characters: 5, charactersWithoutSpaces: 5 });
  bar.updateFile({ modified: Date.UTC(2026, 9, 25), authors: [alice] });
  bar.updateFile({});
  assert.ok(element.querySelector('[data-action="shortcuts"]') === shortcuts);
  assert.ok(element.querySelector('[data-action="settings"]') === button);
  assert.equal(element.querySelectorAll('button').length, 2);
  element.remove();
});

test('the stats bar does not touch the page when the numbers or the facts have not changed', () => {
  const { element, bar } = barWithFile({ modified: Date.UTC(2026, 9, 25), authors: [alice, bob] });
  const numbers = { lines: 3, words: 4, characters: 5, charactersWithoutSpaces: 5 };
  bar.update(numbers);
  const observer = new window.MutationObserver(() => {});
  observer.observe(element, { subtree: true, childList: true, characterData: true, attributes: true });
  bar.update({ ...numbers });
  bar.updateFile({ modified: Date.UTC(2026, 9, 25), authors: [alice, bob] });
  assert.equal(observer.takeRecords().length, 0, 'the same numbers and the same facts change nothing on the page (a tooltip would flicker)');

  bar.update({ ...numbers, words: 5 });
  assert.ok(observer.takeRecords().length > 0, 'a new number changes the page');
  bar.updateFile({ modified: Date.UTC(2026, 9, 26), authors: [alice, bob] });
  assert.ok(observer.takeRecords().length > 0, 'a new date changes the page');
  observer.disconnect();
  element.remove();
});

test('the bar uses every class that styles.css has for its items and buttons', () => {
  const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'webview', 'styles.css'), 'utf8');
  // `rme-stats` is the class of the bar itself. The page has it, and the code does not make it.
  const wanted = new Set([...css.matchAll(/\.(rme-stat(?:s-button)?[\w-]*)/g)].map((match) => match[1]).filter((name) => name !== 'rme-stats'));
  const { element } = barWithFile({ modified: Date.UTC(2026, 9, 25), authors: [alice] });
  const used = new Set([...element.querySelectorAll('*')].flatMap((item) => [...item.classList]));
  assert.deepEqual([...wanted].filter((name) => !used.has(name)), [], 'a class of styles.css that the bar does not use');
  assert.deepEqual([...used].filter((name) => !wanted.has(name)), [], 'a class of the bar that styles.css does not know');
  element.remove();
});
