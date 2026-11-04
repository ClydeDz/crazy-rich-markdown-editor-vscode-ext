// Tests of the line numbers at the left of the page (webview/lineNumbers.ts).
// The numbers must agree with the lines of the Markdown file, also when the editor writes a block in another way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor } = await loadModule('webview/editor.ts', 'editor');
const { blockLineNumbers, createLineNumbers, documentSections, lineNumbers, sourcePosition, topLevelBlocks } =
  await loadModule('webview/lineNumbers.ts', 'lineNumbers');

/** A block of the document, as `topLevelBlocks` gives it. */
const block = (pos, text) => ({ pos, text });

/** The numbers of the blocks in a file body. */
const lines = (blocks, source, firstLine) => blockLineNumbers(blocks, source, firstLine).map((entry) => entry.line);

/** The last line of each block. */
const lastLines = (blocks, source, firstLine) =>
  blockLineNumbers(blocks, source, firstLine).map((entry) => entry.lastLine);

/** The numbers that the page draws for a document, in the order of the file. */
const numbers = (editor, source, firstLine) =>
  lineNumbers(documentSections(editor), source, firstLine).map((entry) => entry.line);

/** The lines inside the blocks, which the page draws under the number of their block. */
const inside = (editor, source, firstLine) =>
  lineNumbers(documentSections(editor), source, firstLine)
    .filter((entry) => !entry.block)
    .map((entry) => entry.line);

// ---------- The lines that the blocks cover ----------

test('a block gets the line where the file starts it', () => {
  const source = '# Title\n\npara one\n\nsecond';
  assert.deepEqual(lines([block(0, '# Title'), block(8, 'para one'), block(18, 'second')], source), [1, 3, 5]);
});

test('blank lines between the blocks do not move the numbers', () => {
  const source = 'one\n\n\n\ntwo';
  assert.deepEqual(lines([block(0, 'one'), block(4, 'two')], source), [1, 5]);
});

test('the front matter comes before the body, so the first number of the body counts it', () => {
  const text = '---\ntitle: A page\n---\n\n# Hello\n\nbody\n';
  const position = sourcePosition(text);
  assert.equal(position.firstLine, 4, 'the body starts on the fourth line');
  assert.equal(position.body, '\n# Hello\n\nbody\n', 'the front matter is not in the body');
  assert.deepEqual(lines([block(0, '# Hello'), block(9, 'body')], position.body, position.firstLine), [5, 7]);
});

test('a file without front matter starts the body on the first line', () => {
  assert.deepEqual(sourcePosition('# Hello\n'), { body: '# Hello\n', firstLine: 1 });
});

test('a block that fills several lines gives its first line and its last line', () => {
  const source = '```js\ncode();\n\nmore();\n```\n\nlast';
  const blocks = [block(0, '```js\ncode();\n\nmore();\n```'), block(9, 'last')];
  assert.deepEqual(lines(blocks, source), [1, 7]);
  assert.deepEqual(lastLines(blocks, source), [5, 7], 'the blank line before the last block is not in the code block');
});

test('a list that keeps a blank line in the file gives the line of its first item', () => {
  const source = '- a\n\n  second paragraph\n- b\n\nafter';
  const blocks = [block(0, '- a\n  second paragraph\n- b'), block(10, 'after')];
  assert.deepEqual(lines(blocks, source), [1, 6]);
});

test('a table whose cells the editor pads keeps the lines of the file', () => {
  const source = '| a | b |\n| - | - |\n| 1 | 2 |\n\nafter';
  const blocks = [block(0, '| a   | b   |\n| --- | --- |\n| 1   | 2   |'), block(9, 'after')];
  assert.deepEqual(lines(blocks, source), [1, 5]);
  assert.deepEqual(lastLines(blocks, source), [3, 5]);
});

test('two blocks with the same text keep their order in the file', () => {
  const source = 'same\n\nother\n\nsame';
  assert.deepEqual(lines([block(0, 'same'), block(8, 'other'), block(16, 'same')], source), [1, 3, 5]);
});

test('an empty paragraph gives no number, and it does not move the blocks after it', () => {
  const source = 'one\n\ntwo';
  assert.deepEqual(lines([block(0, 'one'), block(5, ''), block(8, 'two')], source), [1, 3]);
});

test('a block that the file does not have takes the next line with text, and the block after it finds its own line', () => {
  const source = 'first\n\nsecond';
  assert.deepEqual(lines([block(0, 'gone'), block(6, 'second')], source), [1, 3]);
});

test('the end of a block stops at its own last line, not at the next block', () => {
  const source = 'one\n\n\n\n\ntwo';
  assert.deepEqual(lastLines([block(0, 'one'), block(7, 'two')], source), [1, 6]);
});

// ---------- The lines inside a block ----------

test('each item of a list gets the line where the file starts it, also a nested item and a task', () => {
  const markdown = '- one\n- two\n  - under two\n\n1. first\n2. second\n\n- [ ] open\n- [x] done\n\nafter';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(
    numbers(editor, markdown),
    [1, 2, 3, 5, 6, 8, 9, 11],
    'the item of the list takes the line of its marker, and the number of the list takes the first item',
  );
  assert.deepEqual(inside(editor, markdown), [2, 3, 6, 9], 'the first item has the number of the list');
  editor.destroy();
});

test('each row of a table gets its line, and the line of the dashes stays without a number', () => {
  const markdown = '| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\nafter';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(numbers(editor, markdown), [1, 3, 4, 6], 'the first row has the number of the table');
  assert.deepEqual(inside(editor, markdown), [3, 4]);
  editor.destroy();
});

test('two rows with the same cells keep their order in the file', () => {
  const markdown = '| a | b |\n| - | - |\n| 1 | 2 |\n| 1 | 2 |\n\nafter';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(numbers(editor, markdown), [1, 3, 4, 6]);
  editor.destroy();
});

test('a line that a picture fills gets a number of its own, like the badges of a readme', () => {
  const markdown = 'Before the badges.\n\n![One](one.svg)\n![Two](two.svg)\n![Three](three.svg)\n\nafter';
  const editor = makeEditor(createEditor, markdown);
  const drawn = lineNumbers(documentSections(editor), markdown);
  assert.deepEqual(
    drawn.map((entry) => entry.line),
    [1, 3, 4, 5, 7],
    'the three pictures are three lines of the file, in one paragraph',
  );
  assert.deepEqual(
    drawn.filter((entry) => !entry.block).map((entry) => editor.state.doc.nodeAt(entry.pos)?.type.name),
    ['image', 'image'],
    'the number sits at the picture that starts the line',
  );
  editor.destroy();
});

test('a line under another one in a paragraph gets a number, and so does a wrapped line', () => {
  const markdown = 'line one  \nline two\n\nafter';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(numbers(editor, markdown), [1, 2, 4]);
  editor.destroy();
});

test('the lines inside a block count the front matter, like the lines of the blocks', () => {
  const text = '---\ntitle: x\n---\n\n- a\n- b\n';
  const position = sourcePosition(text);
  const editor = makeEditor(createEditor, position.body);
  assert.deepEqual(numbers(editor, position.body, position.firstLine), [5, 6]);
  assert.deepEqual(inside(editor, position.body, position.firstLine), [6]);
  editor.destroy();
});

test('the body of an alert gets a line under the title of the alert', () => {
  const markdown = '> [!NOTE]\n> Read this.\n\nafter';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(numbers(editor, markdown), [1, 2, 4]);
  editor.destroy();
});

test('a line of a code block gets no number of its own: the block has the lines of the code', () => {
  const markdown = '```js\ncode();\nmore();\n```';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(numbers(editor, markdown), [1]);
  editor.destroy();
});

// ---------- The numbers on the page ----------

test('the numbers of the blocks are drawn when the setting is on, and gone when it is off', () => {
  const markdown = '# Title\n\ntext here\n\nlast';
  const editor = makeEditor(createEditor, markdown);
  const numbers = createLineNumbers(editor, { source: () => ({ body: markdown, firstLine: 1 }) });

  const box = editor.view.dom.parentElement.querySelector('.rme-line-numbers');
  assert.equal(box.hidden, true, 'the numbers are off by default');
  assert.equal(document.documentElement.classList.contains('rme-has-line-numbers'), false);

  numbers.setEnabled(true);
  assert.equal(numbers.isEnabled(), true);
  assert.equal(box.hidden, false);
  assert.equal(document.documentElement.classList.contains('rme-has-line-numbers'), true);
  assert.deepEqual(
    [...box.querySelectorAll('.rme-line-number')].map((element) => element.textContent),
    ['1', '3', '5'],
    'the blocks start on the first, the third and the fifth line',
  );

  numbers.setEnabled(false);
  assert.equal(box.hidden, true);
  assert.equal(box.children.length, 0, 'the numbers leave the page when the setting goes off');
  assert.equal(document.documentElement.classList.contains('rme-has-line-numbers'), false);

  numbers.destroy();
  editor.destroy();
});

test('a number sits at the top of its block, and the title names the lines of a block that fills several', () => {
  const markdown = 'first\n\n```js\ncode();\nmore();\n```\n\nlast';
  const editor = makeEditor(createEditor, markdown);
  const numbers = createLineNumbers(editor, { source: () => ({ body: markdown, firstLine: 1 }) });
  numbers.setEnabled(true);

  // The page has no layout here, so each block gets a height of its own.
  const tops = [40, 120, 300];
  let index = 0;
  editor.state.doc.forEach((node, pos) => {
    const dom = editor.view.nodeDOM(pos);
    const top = tops[index++];
    dom.getBoundingClientRect = () => ({ top, bottom: top });
  });
  numbers.refresh();

  const drawn = [...editor.view.dom.parentElement.querySelectorAll('.rme-line-number')];
  assert.deepEqual(
    drawn.map((element) => element.style.top),
    ['40px', '120px', '300px'],
  );
  assert.equal(drawn[0].title, 'Line 1');
  assert.equal(drawn[1].title, 'Lines 3 to 6', 'the code block covers its fences and the lines between them');

  numbers.destroy();
  editor.destroy();
});

test('a number inside a block sits at the top of the item or the row that it counts', () => {
  const markdown = '- one\n- two\n- three\n\n| a | b |\n| - | - |\n| 1 | 2 |';
  const editor = makeEditor(createEditor, markdown);
  const drawn = createLineNumbers(editor, { source: () => ({ body: markdown, firstLine: 1 }) });
  drawn.setEnabled(true);

  // The page has no layout here, so the list, its items, the table and its rows get a height of their own.
  const tops = { UL: 100, LI: 100, DIV: 400, TR: 400 };
  editor.state.doc.descendants((node, pos) => {
    const dom = editor.view.nodeDOM(pos);
    if (dom instanceof HTMLElement && dom.getBoundingClientRect !== undefined) {
      dom.getBoundingClientRect = () => ({ top: tops[dom.tagName] ?? 0, bottom: 0 });
    }
  });
  drawn.refresh();

  const elements = [...editor.view.dom.parentElement.querySelectorAll('.rme-line-number')];
  assert.deepEqual(
    elements.map((element) => [element.textContent, element.style.top]),
    [
      ['1', '100px'],
      ['2', '100px'],
      ['3', '100px'],
      ['5', '400px'],
      ['7', '400px'],
    ],
    'the first item is the number of the list, and each row of the table has its own number',
  );

  drawn.destroy();
  editor.destroy();
});

test('the blocks of a document are written as the file writes them', () => {
  const editor = makeEditor(createEditor, '# Title\n\n- a\n- b\n\n```js\ncode();\n```');
  const blocks = topLevelBlocks(editor);
  assert.deepEqual(
    blocks.map((entry) => entry.text),
    ['# Title', '- a\n- b', '```js\ncode();\n```', ''],
    'the empty paragraph at the end of the document has no text',
  );
  assert.deepEqual(
    blocks.map((entry) => entry.pos),
    [0, 7, 19, 28],
    'each block knows where it starts in the document',
  );
  editor.destroy();
});
