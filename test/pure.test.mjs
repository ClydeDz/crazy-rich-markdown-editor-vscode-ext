import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadModule } from './helpers.mjs';

const { minimalChange } = await loadModule('src/textDiff.ts', 'textDiff');
const { splitFrontMatter, joinFrontMatter } = await loadModule('webview/frontMatter.ts', 'frontMatter');
const { escapeMarkdownText, tidyMarkdown } = await loadModule('webview/markdownText.ts', 'markdownText');
const { normalizeHref } = await loadModule('webview/toolbar.ts', 'toolbar');
const { createImageResolver } = await loadModule('webview/editor.ts', 'editor');

function applyChange(oldText, change) {
  return oldText.slice(0, change.start) + change.text + oldText.slice(change.end);
}

test('minimalChange returns undefined for equal text', () => {
  assert.equal(minimalChange('same', 'same'), undefined);
});

test('minimalChange finds one small range', () => {
  const change = minimalChange('hello world\nline two\n', 'hello brave world\nline two\n');
  assert.deepEqual(change, { start: 6, end: 6, text: 'brave ' });
});

test('minimalChange handles insert, delete and replace at the edges', () => {
  const cases = [
    ['', 'abc'],
    ['abc', ''],
    ['abc', 'abcd'],
    ['abc', 'xabc'],
    ['aaa', 'aa'],
    ['aXa', 'aYYa'],
    ['one\ntwo', 'one\nthree\ntwo'],
  ];
  for (const [from, to] of cases) {
    assert.equal(applyChange(from, minimalChange(from, to)), to, `${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
  }
});

test('minimalChange does not split a surrogate pair', () => {
  const from = 'a\u{1F600}b';
  const to = 'a\u{1F601}b';
  const change = minimalChange(from, to);
  assert.equal(applyChange(from, change), to);
  assert.equal(change.start, 1);
  assert.equal(change.end, 3);
});

test('front matter splits and joins without a change', () => {
  const samples = [
    '---\ntitle: Hello\ntags: [a, b]\n---\n# Body\n',
    '---\n---\nBody',
    '---\ntitle: x\n---\n',
    'No front matter\n',
    '--- not front matter\ntext\n',
  ];
  for (const sample of samples) {
    const { yaml, body } = splitFrontMatter(sample);
    assert.equal(joinFrontMatter(yaml, body), sample);
  }
  assert.equal(splitFrontMatter('---\ntitle: Hello\n---\n# Body\n').yaml, 'title: Hello');
  assert.equal(splitFrontMatter('# Heading\n\n---\n\ntext').yaml, undefined);
});

test('front matter needs the closing line at the start of a line', () => {
  const { yaml } = splitFrontMatter('---\nkey: a---\nnext: b\n---\nbody');
  assert.equal(yaml, 'key: a---\nnext: b');
});

test('escapeMarkdownText keeps clean text clean', () => {
  assert.equal(escapeMarkdownText('snake_case_word', false), 'snake_case_word');
  assert.equal(escapeMarkdownText('a < b and c > d & e', false), 'a < b and c > d & e');
  assert.equal(escapeMarkdownText('2 * 3 * 4', false), '2 * 3 * 4');
  assert.equal(escapeMarkdownText('~/code', false), '~/code');
  assert.equal(escapeMarkdownText('array[0]', false), 'array[0]');
  assert.equal(escapeMarkdownText('C:\\Users\\me', false), 'C:\\Users\\me');
});

test('escapeMarkdownText escapes real Markdown syntax', () => {
  assert.equal(escapeMarkdownText('a*b*c', false), 'a\\*b\\*c');
  assert.equal(escapeMarkdownText('_em_', false), '\\_em\\_');
  assert.equal(escapeMarkdownText('use `code`', false), 'use \\`code\\`');
  assert.equal(escapeMarkdownText('~a~ and ~b~', false), '\\~a\\~ and \\~b\\~');
  assert.equal(escapeMarkdownText('[x](y)', false), '\\[x\\](y)');
  assert.equal(escapeMarkdownText('<div>', false), '\\<div>');
  assert.equal(escapeMarkdownText('&amp; entity', false), '\\&amp; entity');
  assert.equal(escapeMarkdownText('a\\*b', false), 'a\\\\\\*b');
});

test('escapeMarkdownText escapes blocks at the start of a line', () => {
  assert.equal(escapeMarkdownText('# heading', true), '\\# heading');
  assert.equal(escapeMarkdownText('- item', true), '\\- item');
  assert.equal(escapeMarkdownText('+ item', true), '\\+ item');
  assert.equal(escapeMarkdownText('* item', true), '\\* item');
  assert.equal(escapeMarkdownText('1. item', true), '1\\. item');
  assert.equal(escapeMarkdownText('> quote', true), '\\> quote');
  assert.equal(escapeMarkdownText('---', true), '\\---');
  assert.equal(escapeMarkdownText('#hashtag', true), '#hashtag');
  assert.equal(escapeMarkdownText('# heading', false), '# heading');
});

test('tidyMarkdown collapses blank lines but not inside code fences', () => {
  const input = 'a\n\n\n\nb\n\n```\nx\n\n\n\ny\n```\n\n\nc';
  assert.equal(tidyMarkdown(input), 'a\n\nb\n\n```\nx\n\n\n\ny\n```\n\nc');
});

test('normalizeHref adds a protocol only to bare domains', () => {
  assert.equal(normalizeHref('example.com'), 'https://example.com');
  assert.equal(normalizeHref('example.com/path?q=1'), 'https://example.com/path?q=1');
  assert.equal(normalizeHref('https://example.com'), 'https://example.com');
  assert.equal(normalizeHref('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizeHref('mailto:a@b.co'), 'mailto:a@b.co');
  assert.equal(normalizeHref('me@example.com'), 'mailto:me@example.com');
  assert.equal(normalizeHref('./docs/readme.md'), './docs/readme.md');
  assert.equal(normalizeHref('#section'), '#section');
  assert.equal(normalizeHref('docs/readme.md'), 'docs/readme.md');
  assert.equal(normalizeHref('  '), '');
});

test('image resolver rewrites relative paths only', () => {
  const resolve = createImageResolver('https://file+.vscode-resource.test/Users/me/docs');
  assert.equal(resolve('img/a%20b.png'), 'https://file+.vscode-resource.test/Users/me/docs/img/a%20b.png');
  assert.equal(resolve('../shared/c.png'), 'https://file+.vscode-resource.test/Users/me/shared/c.png');
  assert.equal(resolve('https://example.com/x.png'), 'https://example.com/x.png');
  assert.equal(resolve('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(resolve(''), '');
});

// ---------- The style of the editor dropdown ----------

const { applyMenuStyle, menuItemText, STYLES } = await import('../scripts/set-menu-style.mjs');
const { readFileSync } = await import('node:fs');
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the single style shows the editor name once in the menu', () => {
  const single = applyMenuStyle(manifest, 'single');
  assert.equal(single.displayName, 'Built-in');
  assert.equal(menuItemText(single), 'Crazy Rich Markdown Editor');
  assert.ok(single.description.startsWith('Crazy Rich Markdown Editor:'), 'the real name is in the description');
  assert.equal(single.contributes.commands.find((c) => c.command === 'richMarkdown.openRich').title, 'Open in Crazy Rich Markdown Editor');
});

test('the named style shows two different names in the menu', () => {
  const named = applyMenuStyle(manifest, 'named');
  assert.equal(named.displayName, 'Crazy Rich Markdown Editor');
  assert.equal(menuItemText(named), 'Rich Text - Crazy Rich Markdown Editor');
  assert.notEqual(named.contributes.customEditors[0].displayName, named.displayName);
});

test('a style changes only the names, and the two styles switch back and forth', () => {
  const single = applyMenuStyle(manifest, 'single');
  const named = applyMenuStyle(single, 'named');
  const again = applyMenuStyle(named, 'single');
  assert.deepEqual(again, single);
  const strip = (m) => ({ ...m, displayName: 0, description: 0, contributes: { ...m.contributes, customEditors: 0, commands: 0 } });
  assert.deepEqual(strip(named), strip(manifest));
  assert.throws(() => applyMenuStyle(manifest, 'other'), /Unknown style/);
  assert.deepEqual(Object.keys(STYLES), ['single', 'named']);
});

test('package.json uses the configured editor and extension names in the menu', () => {
  assert.equal(manifest.displayName, 'Crazy Rich Markdown Editor');
  assert.equal(manifest.contributes.customEditors[0].displayName, 'Markdown Editor');
  assert.equal(manifest.contributes.customEditors[1].displayName, 'MDX Editor');
  assert.equal(menuItemText(manifest), 'Markdown Editor - Crazy Rich Markdown Editor');
  assert.ok(manifest.description.startsWith('Edit Markdown files as rich text'));
});

// The script is also a command. It must write the manifest only when it is run with a style, and never when it is imported.

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const manifestFile = fileURLToPath(new URL('../package.json', import.meta.url));

test('importing the menu style script writes nothing and prints nothing', () => {
  const before = readFileSync(manifestFile, 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./scripts/set-menu-style.mjs')"], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(readFileSync(manifestFile, 'utf8'), before);
});

test('the menu style script run without a style shows the style that is on, and writes nothing', () => {
  const before = readFileSync(manifestFile, 'utf8');
  const result = spawnSync(process.execPath, ['scripts/set-menu-style.mjs'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'Now: menu item "Markdown Editor - Crazy Rich Markdown Editor". Use "single" or "named" to change it.\n');
  assert.equal(readFileSync(manifestFile, 'utf8'), before);
});
