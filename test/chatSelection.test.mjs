import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';

const { findSelectionOffsets } = await loadModule('src/chatSelection.ts', 'chatSelection');

test('finds selected text in a Markdown source range', () => {
  const source = '# Title\r\n\r\nHello **world**.\r\n';
  const offsets = findSelectionOffsets(source, 'world');
  assert.deepEqual(offsets, { start: source.indexOf('world'), end: source.indexOf('world') + 5 });
});

test('finds a multiline selection across normalized line endings', () => {
  const source = 'first line\r\n\r\nsecond line\r\n';
  assert.deepEqual(findSelectionOffsets(source, 'first line\n\nsecond line'), {
    start: 0,
    end: source.indexOf('\r\n', source.indexOf('second line')),
  });
});

test('finds a multiline selection when rendered paragraph breaks collapse', () => {
  const source = 'first line\n\nsecond line\n';
  assert.deepEqual(findSelectionOffsets(source, 'first line\nsecond line'), {
    start: 0,
    end: source.indexOf('\n', source.indexOf('second line')),
  });
});

test('finds a multiline selection across list item prefixes', () => {
  const source = '- first line\n- second line';
  assert.deepEqual(findSelectionOffsets(source, 'first line\nsecond line'), {
    start: source.indexOf('first line'),
    end: source.length,
  });
});

test('finds a selection across inline formatting delimiters', () => {
  const source = 'A **bold** and `code`';
  assert.deepEqual(findSelectionOffsets(source, 'A bold and code'), {
    start: 0,
    end: source.length - 1,
  });
});

test('matches literal syntax selected from code blocks', () => {
  const source = '```\nlet value = **literal**;\nnext();\n```';
  const selection = 'let value = **literal**;\nnext();';
  assert.deepEqual(findSelectionOffsets(source, selection), {
    start: source.indexOf(selection),
    end: source.indexOf(selection) + selection.length,
  });
});

test('does not invent a source range for text that is not present', () => {
  assert.equal(findSelectionOffsets('# Title\n', 'not in the file'), undefined);
});
