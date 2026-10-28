// Tests of the selected lines (webview/selectedLines.ts) and of the three commands that use them:
// the code block, the math block and the diagram. All selected lines go in one block, as a quote or an alert does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
const { selectedLineGroups } = await loadModule('webview/selectedLines.ts', 'selectedLines');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function positionOf(editor, text) {
  let found;
  editor.state.doc.descendants((node, pos) => {
    if (found === undefined && node.isText && node.text.includes(text)) found = pos + node.text.indexOf(text);
  });
  assert.notEqual(found, undefined, `the text "${text}" is in the document`);
  return found;
}

/** Select from the start of one text to the end of another. */
function selectBetween(editor, first, last = first) {
  editor.commands.setTextSelection({ from: positionOf(editor, first), to: positionOf(editor, last) + last.length });
}

/** The types of the blocks at the top of the document. */
const topTypes = (editor) => editor.getJSON().content.map((node) => node.type);

function nodesOf(editor, type) {
  const found = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) found.push(node);
  });
  return found;
}

// ---------- The lines that a selection touches ----------

test('three paragraphs that the selection touches are one group, from the start of the first to the end of the last', () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo\n\nthree\n\nfour');
  selectBetween(editor, 'one', 'three');
  const groups = selectedLineGroups(editor.state, 'source');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].lines, ['one', 'two', 'three']);
  assert.equal(groups[0].text, 'one\ntwo\nthree');
  assert.equal(groups[0].from, 0);
  const fourth = editor.state.doc.child(3);
  assert.equal(
    groups[0].to,
    editor.state.doc.content.size - fourth.nodeSize,
    'the group ends where the fourth paragraph starts',
  );
  editor.destroy();
});

test('a selection that starts and ends inside a line takes the whole line', () => {
  const editor = makeEditor(createEditor, 'alpha beta\n\ngamma delta');
  editor.commands.setTextSelection({ from: positionOf(editor, 'beta') + 2, to: positionOf(editor, 'gamma') + 2 });
  assert.deepEqual(selectedLineGroups(editor.state, 'source')[0].lines, ['alpha beta', 'gamma delta']);
  editor.destroy();
});

test('a cursor gives the line that holds it, and a heading is a line', () => {
  const editor = makeEditor(createEditor, '# Title\n\nbody');
  editor.commands.setTextSelection(positionOf(editor, 'body') + 1);
  assert.deepEqual(
    selectedLineGroups(editor.state, 'source').map((g) => g.lines),
    [['body']],
  );
  selectBetween(editor, 'Title', 'body');
  assert.deepEqual(
    selectedLineGroups(editor.state, 'source').map((g) => g.lines),
    [['Title', 'body']],
  );
  editor.destroy();
});

test('a block that is not a line splits the groups: a divider, a list, a quote or a table between two paragraphs', () => {
  for (const between of ['---', '- item', '> quote', '| a | b |\n| - | - |\n| 1 | 2 |', '$$\nx\n$$']) {
    const editor = makeEditor(createEditor, `before\n\n${between}\n\nafter`);
    selectBetween(editor, 'before', 'after');
    const groups = selectedLineGroups(editor.state, 'source');
    const text = groups.map((group) => group.lines);
    if (between.startsWith('-') && between !== '---') {
      assert.deepEqual(text, [['before'], ['item'], ['after']], 'a list item is a group of its own');
    } else if (between.startsWith('>')) {
      assert.deepEqual(text, [['before'], ['quote'], ['after']], 'a quote is a group of its own');
    } else {
      assert.deepEqual(text, [['before'], ['after']], JSON.stringify(between));
    }
    editor.destroy();
  }
});

test('the lines of a table are not lines: a cursor in a cell gives no group, and a selection over a table gives the lines around it', () => {
  const editor = makeEditor(createEditor, 'x\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\ny');
  editor.commands.setTextSelection(positionOf(editor, '1') + 1);
  assert.deepEqual(selectedLineGroups(editor.state, 'source'), []);
  editor.commands.selectAll();
  assert.deepEqual(
    selectedLineGroups(editor.state, 'source').map((group) => group.lines),
    [['x'], ['y']],
  );
  editor.destroy();
});

test('a selection of a block that holds no line gives no group', () => {
  const editor = makeEditor(createEditor, 'text\n\n---\n\nmore');
  editor.commands.setNodeSelection(editor.state.doc.child(0).nodeSize);
  assert.equal(editor.state.selection.node.type.name, 'horizontalRule');
  assert.deepEqual(selectedLineGroups(editor.state, 'source'), []);
  editor.destroy();
});

test('paragraphs of one list item are one group, and the paragraphs of two list items are two groups', () => {
  const editor = makeEditor(createEditor, '- first\n\n  second\n- third');
  selectBetween(editor, 'first', 'third');
  assert.deepEqual(
    selectedLineGroups(editor.state, 'source').map((g) => g.lines),
    [['first', 'second'], ['third']],
  );
  editor.destroy();
});

test('a paragraph in a quote and a paragraph after the quote are two groups, though no block lies between them', () => {
  const editor = makeEditor(createEditor, '> inside\n\noutside');
  selectBetween(editor, 'inside', 'outside');
  assert.deepEqual(
    selectedLineGroups(editor.state, 'source').map((g) => g.lines),
    [['inside'], ['outside']],
  );
  editor.destroy();
});

test('the text of a line is what the user sees: a line break is a new line, marks are gone, and the text is not escaped', () => {
  const editor = makeEditor(createEditor, 'a  \nb **bold** `code`\n\ndef f(*args, **kwargs) x_1 \\frac{a}{b}');
  selectBetween(editor, 'a', 'frac');
  assert.deepEqual(selectedLineGroups(editor.state, 'source')[0].lines, [
    'a\nb bold code',
    'def f(*args, **kwargs) x_1 \\frac{a}{b}',
  ]);
  editor.destroy();
});

test('the parts of a line that are not text give the Markdown that made them, and a formula gives its TeX for a math block', () => {
  const editor = makeEditor(createEditor, 'x $E=mc^2$ y $`a_b`$ :tada: [^1] <kbd>K</kbd>\n\n[^1]: note');
  selectBetween(editor, 'x ', 'y ');
  editor.commands.setTextSelection({ from: 1, to: 3 });
  assert.equal(selectedLineGroups(editor.state, 'source')[0].text, 'x $E=mc^2$ y $`a_b`$ :tada: [^1] <kbd>K</kbd>');
  assert.equal(selectedLineGroups(editor.state, 'tex')[0].text, 'x E=mc^2 y a_b :tada: [^1] <kbd>K</kbd>');
  editor.destroy();
});

test('a blank line at the start or at the end of a group is cut off, and a blank line in the middle stays', () => {
  const editor = makeEditor(createEditor, 'x');
  const paragraph = (text) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });
  editor.commands.setContent({
    type: 'doc',
    content: [paragraph(''), paragraph('  indented'), paragraph(''), paragraph('last'), paragraph('')],
  });
  editor.commands.selectAll();
  const [group] = selectedLineGroups(editor.state, 'source');
  assert.equal(group.lines.length, 5);
  assert.equal(group.text, '  indented\n\nlast', 'the indent of the first line stays');
  editor.destroy();
});

// ---------- Code block ----------

test('the code block button puts all selected lines in one code block', () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo\n\nthree\n\nafter');
  selectBetween(editor, 'one', 'three');
  assert.equal(editor.commands.toggleCodeBlock(), true);
  assert.equal(getMarkdown(editor), '```\none\ntwo\nthree\n```\n\nafter');
  assert.deepEqual(topTypes(editor).slice(0, 2), ['codeBlock', 'paragraph']);
  assert.equal(nodesOf(editor, 'codeBlock').length, 1, 'one block, not one for each line');
  editor.destroy();
});

test('the new code block stays selected, so the same command turns it back into text', () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo');
  selectBetween(editor, 'one', 'two');
  editor.commands.toggleCodeBlock();
  assert.equal(editor.isActive('codeBlock'), true);
  const block = nodesOf(editor, 'codeBlock')[0];
  assert.equal(editor.state.selection.from, 1);
  assert.equal(editor.state.selection.to, 1 + block.content.size, 'the text of the block is selected');
  editor.commands.toggleCodeBlock();
  assert.equal(nodesOf(editor, 'codeBlock').length, 0);
  assert.equal(getMarkdown(editor), 'one  \ntwo', 'the lines stay, with a line break between them');
  editor.destroy();
});

test('one step of undo takes the code block back to the lines', () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo\n\nthree');
  selectBetween(editor, 'one', 'three');
  editor.commands.toggleCodeBlock();
  assert.equal(nodesOf(editor, 'codeBlock').length, 1);
  editor.commands.undo();
  assert.equal(getMarkdown(editor), 'one\n\ntwo\n\nthree');
  assert.equal(editor.can().redo(), true);
  editor.destroy();
});

test('the code block takes the lines as they are: no escape characters, and no marks', () => {
  const editor = makeEditor(createEditor, 'def f(*args, **kwargs):\n\nx_1 = \\frac{a}{b} **bold** `code`');
  selectBetween(editor, 'def', 'frac');
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '```\ndef f(*args, **kwargs):\nx_1 = \\frac{a}{b} bold code\n```');
  editor.destroy();
});

test('a line break inside a line is a new line in the code, and it does not join two words', () => {
  const editor = makeEditor(createEditor, 'first  \nsecond\n\nthird');
  selectBetween(editor, 'first', 'third');
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '```\nfirst\nsecond\nthird\n```');
  editor.destroy();
});

test('a heading is a line of the code, without its #, and the lines around it go in the same block', () => {
  const editor = makeEditor(createEditor, 'intro\n\n## Title\n\nbody');
  selectBetween(editor, 'intro', 'body');
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '```\nintro\nTitle\nbody\n```');
  editor.destroy();
});

test('a selection from the middle of the first line to the middle of the last line takes the whole lines', () => {
  const editor = makeEditor(createEditor, 'alpha beta\n\ngamma delta\n\nepsilon');
  editor.commands.setTextSelection({ from: positionOf(editor, 'beta'), to: positionOf(editor, 'gamma') + 3 });
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '```\nalpha beta\ngamma delta\n```\n\nepsilon');
  editor.destroy();
});

test('an empty line between two lines stays in the code, and an empty line at the end does not', () => {
  const editor = makeEditor(createEditor, 'x');
  const paragraph = (text) => (text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' });
  editor.commands.setContent({ type: 'doc', content: [paragraph('a'), paragraph(''), paragraph('b'), paragraph('')] });
  editor.commands.selectAll();
  editor.commands.toggleCodeBlock();
  assert.equal(nodesOf(editor, 'codeBlock')[0].textContent, 'a\n\nb');
  editor.destroy();
});

test('lines in a quote go in one code block inside the quote, and a line outside the quote is not touched', () => {
  const editor = makeEditor(createEditor, 'outside\n\n> one\n>\n> two\n>\n> three');
  selectBetween(editor, 'one', 'three');
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), 'outside\n\n> ```\n> one\n> two\n> three\n> ```');
  editor.destroy();
});

test('lines in an alert go in one code block inside the alert', () => {
  const editor = makeEditor(createEditor, '> [!NOTE]\n> one\n>\n> two');
  selectBetween(editor, 'one', 'two');
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '> [!NOTE]\n> ```\n> one\n> two\n> ```');
  editor.destroy();
});

test('list items that the selection touches become one code block, and the items next to them stay a list', () => {
  const editor = makeEditor(createEditor, '- a\n- b\n- c\n- d\n\nafter');
  selectBetween(editor, 'b', 'c');
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '- a\n\n```\nb\nc\n```\n\n- d\n\nafter');
  editor.destroy();

  const whole = makeEditor(createEditor, '- x\n- y\n- z\n\nafter');
  selectBetween(whole, 'x', 'z');
  whole.commands.toggleCodeBlock();
  assert.equal(getMarkdown(whole), '```\nx\ny\nz\n```\n\nafter');
  whole.destroy();
});

test('task list items and numbered list items work the same way', () => {
  for (const markdown of ['1. x\n2. y\n3. z', '- [ ] x\n- [x] y\n- [ ] z']) {
    const editor = makeEditor(createEditor, markdown);
    selectBetween(editor, 'x', 'z');
    editor.commands.toggleCodeBlock();
    assert.equal(getMarkdown(editor), '```\nx\ny\nz\n```', markdown);
    editor.destroy();
  }
});

test('a block that holds no line stops the group: the code blocks are two, and the divider and the table stay', () => {
  const editor = makeEditor(createEditor, 'one\n\n---\n\ntwo\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nthree');
  selectBetween(editor, 'one', 'three');
  editor.commands.toggleCodeBlock();
  assert.equal(
    getMarkdown(editor),
    '```\none\n```\n\n---\n\n```\ntwo\n```\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n\n```\nthree\n```',
  );
  editor.destroy();
});

test('an existing code block and the lines around it go in one block', () => {
  const editor = makeEditor(createEditor, 'before\n\n```js\ncode();\n```\n\nafter');
  selectBetween(editor, 'before', 'after');
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '```\nbefore\ncode();\nafter\n```');
  editor.destroy();
});

test('the command with a language gives the block that language', () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo');
  selectBetween(editor, 'one', 'two');
  editor.commands.toggleCodeBlock({ language: 'ts' });
  assert.equal(getMarkdown(editor), '```ts\none\ntwo\n```');
  editor.destroy();
});

test('a cursor in one line makes one code block, and the cursor stays where it was in the text', () => {
  const editor = makeEditor(createEditor, 'hello world');
  editor.commands.setTextSelection(7);
  editor.commands.toggleCodeBlock();
  assert.equal(getMarkdown(editor), '```\nhello world\n```');
  assert.equal(editor.state.selection.empty, true);
  assert.equal(editor.state.selection.from, 7);
  editor.destroy();
});

test('a cursor after a part of the line that gives no text stays inside the code block', () => {
  // The picture is one position in the document and gives no text, so the code is shorter than the line was.
  const editor = makeEditor(createEditor, 'x ![alt](a.png) y');
  editor.commands.setTextSelection(editor.state.doc.child(0).nodeSize - 1);
  const cursor = editor.state.selection.from;
  assert.equal(cursor, 6, 'the cursor is at the end of the line');
  editor.commands.toggleCodeBlock();
  const block = nodesOf(editor, 'codeBlock')[0];
  assert.equal(block.textContent, 'x  y');
  assert.equal(editor.state.selection.from, 1 + block.content.size, 'the cursor is at the end of the code');
  editor.destroy();
});

test('an empty line becomes an empty code block, with the cursor inside it', () => {
  const editor = makeEditor(createEditor, 'a');
  editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
  editor.commands.focus('start');
  editor.commands.toggleCodeBlock();
  assert.equal(editor.isActive('codeBlock'), true);
  assert.equal(editor.state.selection.empty, true);
  assert.equal(editor.state.selection.from, 1);
  editor.destroy();
});

test('the command works in a chain, after another command, as the slash menu runs it', () => {
  const editor = makeEditor(createEditor, 'keep\n\n/code');
  const from = positionOf(editor, '/code');
  editor
    .chain()
    .focus()
    .deleteRange({ from, to: from + 5 })
    .toggleCodeBlock()
    .run();
  assert.deepEqual(topTypes(editor).slice(0, 2), ['paragraph', 'codeBlock']);
  assert.equal(getMarkdown(editor).startsWith('keep\n\n```'), true);
  editor.destroy();
});

test('can() says yes when there are lines, and does not change the document', () => {
  const editor = makeEditor(createEditor, 'one\n\ntwo');
  selectBetween(editor, 'one', 'two');
  assert.equal(editor.can().toggleCodeBlock(), true);
  assert.equal(getMarkdown(editor), 'one\n\ntwo');
  editor.destroy();
});

test('a cursor in a table cell gets the result of the default command, as before', () => {
  const markdown = '| a | b |\n| - | - |\n| 1 | 2 |';
  const ours = makeEditor(createEditor, markdown);
  const standard = makeEditor(createEditor, markdown);
  for (const editor of [ours, standard]) editor.commands.setTextSelection(positionOf(editor, '1') + 1);
  ours.commands.toggleCodeBlock();
  standard.commands.toggleNode('codeBlock', 'paragraph');
  assert.equal(getMarkdown(ours), getMarkdown(standard));
  ours.destroy();
  standard.destroy();
});

// ---------- Math block ----------

test('the Math block item puts all selected lines in one math block, with the lines as the TeX', () => {
  const editor = makeEditor(createEditor, 'before\n\n\\frac{a}{b}\n\nx_1 + y_2\n\nafter');
  selectBetween(editor, 'frac', 'y_2');
  assert.equal(editor.commands.setMathBlock(), true);
  assert.equal(getMarkdown(editor), 'before\n\n$$\n\\frac{a}{b}\nx_1 + y_2\n$$\n\nafter');
  const [block] = nodesOf(editor, 'mathBlock');
  assert.equal(block.attrs.tex, '\\frac{a}{b}\nx_1 + y_2');
  assert.equal(block.attrs.oneLine, false);
  assert.equal(nodesOf(editor, 'mathBlock').length, 1);
  editor.destroy();
});

test('the math block is selected and open for editing, as the block of the slash menu is', () => {
  // Text lies before and after the block. The selection must not move to it by chance.
  const editor = makeEditor(createEditor, 'before\n\nx^2\n\nafter');
  selectBetween(editor, 'x^2');
  editor.commands.setMathBlock();
  assert.equal(editor.state.selection.node?.type.name, 'mathBlock');
  assert.equal(editor.state.selection.node, nodesOf(editor, 'mathBlock')[0]);
  assert.equal(editor.view.dom.querySelector('.rme-math-block').classList.contains('is-editing'), true);
  assert.equal(editor.view.dom.querySelector('.rme-math-block textarea').hidden, false);
  assert.ok(editor.view.dom.querySelector('.rme-math-block .katex'), 'the formula is drawn');
  editor.destroy();
});

test('a formula inside the line gives its TeX, without the dollar signs', () => {
  const editor = makeEditor(createEditor, '$E = mc^2$');
  editor.commands.selectAll();
  editor.commands.setMathBlock();
  assert.equal(nodesOf(editor, 'mathBlock')[0].attrs.tex, 'E = mc^2');
  editor.destroy();
});

test('list items go in one math block, and the list goes away', () => {
  const editor = makeEditor(createEditor, '- a + b\n- c + d');
  selectBetween(editor, 'a + b', 'c + d');
  editor.commands.setMathBlock();
  assert.equal(getMarkdown(editor), '$$\na + b\nc + d\n$$');
  editor.destroy();
});

test('one list item gives one block, and the items before it and after it stay a list', () => {
  const math = makeEditor(createEditor, '- a\n- b\n- c');
  math.commands.setTextSelection(positionOf(math, 'b') + 1);
  assert.equal(math.commands.setMathBlock(), true);
  assert.equal(getMarkdown(math), '- a\n\n$$\nb\n$$\n\n- c');
  math.destroy();

  const diagram = makeEditor(createEditor, '- a\n- b\n- c');
  diagram.commands.setTextSelection(positionOf(diagram, 'b') + 1);
  assert.equal(diagram.commands.setDiagram(), true);
  assert.equal(getMarkdown(diagram), '- a\n\n```mermaid\nb\n```\n\n- c');
  diagram.destroy();
});

test('the Math block item does nothing when no line is selected', () => {
  const editor = makeEditor(createEditor, 'text\n\n---');
  editor.commands.setNodeSelection(editor.state.doc.child(0).nodeSize);
  const before = getMarkdown(editor);
  assert.equal(editor.commands.setMathBlock(), false);
  assert.equal(getMarkdown(editor), before);
  assert.equal(editor.state.selection.node.type.name, 'horizontalRule', 'the selection stays');
  editor.destroy();
});

test('a table keeps its cells when the Math block item runs, and one undo step takes the block back', () => {
  const editor = makeEditor(createEditor, 'one\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\ntwo');
  selectBetween(editor, 'one', 'two');
  editor.commands.setMathBlock();
  assert.equal(nodesOf(editor, 'mathBlock').length, 2);
  assert.equal(nodesOf(editor, 'table').length, 1);
  assert.ok(!nodesOf(editor, 'table')[0].textContent.includes('$'));
  editor.commands.undo();
  assert.equal(nodesOf(editor, 'mathBlock').length, 0);
  editor.destroy();
});

// ---------- Diagram ----------

test('the Diagram item puts all selected lines in one mermaid block', () => {
  const editor = makeEditor(createEditor, 'before\n\ngraph TD\n\nA[Start] --> B{Done}\n\nB -.-> C((End))\n\nafter');
  selectBetween(editor, 'graph', 'End');
  assert.equal(editor.commands.setDiagram(), true);
  assert.equal(
    getMarkdown(editor),
    'before\n\n```mermaid\ngraph TD\nA[Start] --> B{Done}\nB -.-> C((End))\n```\n\nafter',
  );
  assert.equal(nodesOf(editor, 'codeBlock').length, 1);
  assert.equal(nodesOf(editor, 'codeBlock')[0].attrs.language, 'mermaid');
  editor.destroy();
});

test('the diagram stays selected as text, so the user can change it, and the picture appears under it', async () => {
  const drawn = [];
  window.mermaid = {
    initialize: () => {},
    render: async (id, text) => {
      drawn.push(text);
      return { svg: '<svg data-test="diagram"></svg>' };
    },
  };
  try {
    const editor = makeEditor(createEditor, 'graph TD\n\nA --> B');
    selectBetween(editor, 'graph', 'B');
    editor.commands.setDiagram();
    assert.equal(editor.isActive('codeBlock'), true);
    assert.equal(editor.state.selection.empty, false);
    await wait(500);
    assert.deepEqual(drawn, ['graph TD\nA --> B']);
    assert.ok(editor.view.dom.querySelector('.rme-code-preview svg[data-test="diagram"]'));
    assert.equal(editor.view.dom.querySelector('.rme-code-lang').textContent, 'Mermaid');
    editor.destroy();
  } finally {
    delete window.mermaid;
  }
});

test('lines that a list holds go in one diagram, and the lines of a quote go in a diagram inside the quote', () => {
  const list = makeEditor(createEditor, '- graph TD\n- A --> B');
  selectBetween(list, 'graph', 'A --> B');
  list.commands.setDiagram();
  assert.equal(getMarkdown(list), '```mermaid\ngraph TD\nA --> B\n```');
  list.destroy();

  const quote = makeEditor(createEditor, '> graph TD\n>\n> A --> B');
  selectBetween(quote, 'graph', 'A --> B');
  quote.commands.setDiagram();
  assert.equal(getMarkdown(quote), '> ```mermaid\n> graph TD\n> A --> B\n> ```');
  quote.destroy();
});

test('the Diagram item does nothing when no line is selected, and it does nothing in a table', () => {
  const editor = makeEditor(createEditor, '| a | b |\n| - | - |\n| 1 | 2 |');
  editor.commands.setTextSelection(positionOf(editor, '1') + 1);
  const before = getMarkdown(editor);
  assert.equal(editor.commands.setDiagram(), false);
  assert.equal(editor.commands.setMathBlock(), false);
  assert.equal(getMarkdown(editor), before);
  editor.destroy();
});

test('the diagram of the Diagram item, from lines that are already a mermaid block, keeps the language', () => {
  const editor = makeEditor(createEditor, 'x\n\n```mermaid\ngraph TD\n```');
  selectBetween(editor, 'x', 'graph TD');
  editor.commands.setDiagram();
  assert.equal(getMarkdown(editor), '```mermaid\nx\ngraph TD\n```');
  editor.destroy();
});
