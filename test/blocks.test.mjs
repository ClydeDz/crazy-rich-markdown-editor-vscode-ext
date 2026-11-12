// Tests of the blocks that hold text the editor cannot show as rich text (raw HTML, link definitions), the video block,
// the code block, images, and the settings of the editor extensions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');

const frame = () => new Promise((resolve) => setTimeout(resolve, 30));
const dom = (editor) => editor.view.dom;
const nodesNamed = (editor, name) => {
  const found = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === name) found.push({ node, pos });
  });
  return found;
};

/** Make the page report a height for a text area. A page without a layout reports zero. */
function withScrollHeight(value, body) {
  const original = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, 'scrollHeight');
  Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => value.current });
  try {
    return body();
  } finally {
    if (original) Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', original);
    else delete window.HTMLElement.prototype.scrollHeight;
  }
}

// ---------- Raw HTML and link definitions ----------

test('a raw block has a label and a text area with the text that the editor keeps', () => {
  const editor = makeEditor(createEditor, '<details>\n<summary>More</summary>\n</details>\n\n[d]: https://example.com');
  const [html, definition] = [...dom(editor).querySelectorAll('.rme-raw')];
  assert.ok(html && definition, 'two raw blocks');
  assert.equal(html.querySelector('.rme-raw-label').textContent, 'HTML output');
  assert.equal(definition.querySelector('.rme-raw-label').textContent, 'Link definition');
  const area = html.querySelector('textarea.rme-raw-input');
  assert.equal(area.value, '<details>\n<summary>More</summary>\n</details>');
  assert.equal(area.getAttribute('aria-label'), 'HTML');
  assert.equal(area.rows, 1);
  assert.equal(area.spellcheck, false);
  assert.equal(definition.querySelector('textarea').getAttribute('aria-label'), 'Link definition');
  editor.destroy();
});

test('an HTML block shows as the page shows it, and its text box holds the HTML when it is selected', () => {
  const markdown = '<details><summary>More</summary>Hidden text</details>';
  const editor = makeEditor(createEditor, markdown);
  const block = dom(editor).querySelector('.rme-raw');
  assert.equal(block.classList.contains('has-preview'), true, 'the block is drawn');
  assert.equal(block.querySelector('.rme-raw-preview summary').textContent, 'More');
  assert.equal(block.querySelector('textarea').value, markdown, 'the text box keeps the HTML');

  const [{ pos }] = nodesNamed(editor, 'htmlBlock');
  editor.commands.setNodeSelection(pos);
  assert.equal(block.classList.contains('is-selected'), true, 'a selected block opens its text box');
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('a details element with a blank line inside stays one block, and its content sits inside the details', () => {
  const markdown = '<details>\n<summary>More</summary>\n\nHidden text.\n\n</details>\n\nAfter';
  const editor = makeEditor(createEditor, markdown);
  assert.equal(nodesNamed(editor, 'htmlBlock').length, 1, 'one block, not one on each side of the blank line');
  const block = dom(editor).querySelector('.rme-raw');
  const details = block.querySelector('.rme-raw-preview details');
  assert.ok(details, 'the page draws the details element');
  assert.equal(details.querySelector('summary').textContent, 'More');
  assert.ok(details.textContent.includes('Hidden text.'), 'the hidden text is inside the details');
  assert.equal(details.hasAttribute('open'), false, 'the element starts as the file writes it');
  assert.equal(getMarkdown(editor), markdown, 'the file comes back as it was');
  editor.destroy();
});

test('a click on the summary opens and closes the details, and the page does the toggle itself', () => {
  const editor = makeEditor(createEditor, '<details><summary>More</summary>\n\nHidden text.\n\n</details>');
  const details = dom(editor).querySelector('.rme-raw-preview details');
  const summary = details.querySelector('summary');
  const click = () => {
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    summary.dispatchEvent(event);
    return event;
  };
  const first = click();
  assert.equal(details.hasAttribute('open'), true, 'a click opens the details');
  assert.equal(first.defaultPrevented, true, 'the browser does not toggle it a second time');
  click();
  assert.equal(details.hasAttribute('open'), false, 'the next click closes it again');
  editor.destroy();
});

test('a details that the user opened stays open when the text of the block changes', () => {
  const editor = makeEditor(createEditor, '<details><summary>More</summary>\n\nHidden text.\n\n</details>');
  const block = dom(editor).querySelector('.rme-raw');
  block.querySelector('summary').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(block.querySelector('details').hasAttribute('open'), true);
  const [{ pos }] = nodesNamed(editor, 'htmlBlock');
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      raw: '<details><summary>More</summary>\n\nOther text.\n\n</details>',
    }),
  );
  const details = dom(editor).querySelector('.rme-raw-preview details');
  assert.equal(details.hasAttribute('open'), true, 'the copy that the page makes again keeps the open state');
  assert.ok(details.textContent.includes('Other text.'));
  editor.destroy();
});

test('a details element without its end tag stays the HTML block of the Markdown parser', () => {
  const markdown = '<details>\n<summary>More</summary>';
  const editor = makeEditor(createEditor, markdown);
  assert.equal(nodesNamed(editor, 'htmlBlock').length, 1);
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

// The block-level elements of the GFM spec, section 4.6, start condition 6.
const GFM_BLOCK_TAGS =
  'address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param section source summary table tbody td tfoot th thead title tr track ul'.split(
    ' ',
  );

test('every block-level element of the GFM spec starts one HTML block, and the file keeps it', () => {
  const broken = [];
  for (const tag of GFM_BLOCK_TAGS) {
    const markdown = `<${tag}>text</${tag}>`;
    const editor = makeEditor(createEditor, markdown);
    const blocks = nodesNamed(editor, 'htmlBlock');
    const out = getMarkdown(editor);
    if (blocks.length !== 1 || blocks[0].node.attrs.raw !== markdown || out !== markdown) {
      broken.push({ tag, blocks: blocks.length, out });
    }
    editor.destroy();
  }
  assert.deepEqual(broken, [], 'these elements do not start one block that the file gets back');
});

test('an HTML block that ends at its own end tag keeps blank lines, as the GFM spec says', () => {
  const kinds = [
    ['script', '<script>\nlet a = 1;\n\nlet b = 2;\n</script>'],
    ['pre', '<pre>\nline one\n\nline two\n</pre>'],
    ['style', '<style>\np { color: red; }\n\nb { color: blue; }\n</style>'],
    ['comment', '<!-- one\n\ntwo -->'],
    ['processing instruction', '<?php\necho 1;\n\necho 2;\n?>'],
    ['declaration', '<!DOCTYPE html>'],
    ['CDATA', '<![CDATA[\nx < y\n\nx > y\n]]>'],
  ];
  for (const [name, markdown] of kinds) {
    const editor = makeEditor(createEditor, markdown);
    const blocks = nodesNamed(editor, 'htmlBlock');
    assert.equal(blocks.length, 1, `${name}: one block`);
    assert.equal(blocks[0].node.attrs.raw, markdown, `${name}: the text of the block`);
    assert.equal(getMarkdown(editor), markdown, `${name}: the file comes back as it was`);
    editor.destroy();
  }
});

test('an element block ends at a blank line, and its Markdown stays as written', () => {
  const markdown = '<div>\n*not Markdown*\n\nA paragraph.';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(
    nodesNamed(editor, 'htmlBlock').map(({ node }) => node.attrs.raw),
    ['<div>\n*not Markdown*'],
  );
  assert.equal(editor.state.doc.lastChild.textContent, 'A paragraph.', 'the text after the blank line is a paragraph');
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('a tag that is not a block element starts a block only when it stands on a line of its own', () => {
  const markdown = '<span>\n*one*\n</span>';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(
    nodesNamed(editor, 'htmlBlock').map(({ node }) => node.attrs.raw),
    [markdown],
  );
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();

  const inline = makeEditor(createEditor, 'A <span>span</span> in a paragraph.');
  assert.equal(nodesNamed(inline, 'htmlBlock').length, 0, 'a tag in a paragraph is not a block');
  assert.ok(dom(inline).querySelector('.rme-html-inline'), 'the page shows the inline HTML');
  inline.destroy();
});

test('a block-level element that the Markdown parser does not know still starts a block', () => {
  const markdown = '<source src="clip.mp4">\nText after the tag.\n\nA paragraph.';
  const editor = makeEditor(createEditor, markdown);
  assert.deepEqual(
    nodesNamed(editor, 'htmlBlock').map(({ node }) => node.attrs.raw),
    ['<source src="clip.mp4">\nText after the tag.'],
  );
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('a pre block keeps its blank lines and a table shows its cells, as the GFM page shows them', () => {
  const markdown = '<pre>\nline one\n\nline two\n</pre>\n\n<table>\n<tr><td>one</td><td>two</td></tr>\n</table>';
  const editor = makeEditor(createEditor, markdown);
  const previews = [...dom(editor).querySelectorAll('.rme-raw-preview')];
  assert.equal(previews.length, 2);
  // The page drops the first newline of a pre element.
  assert.equal(previews[0].querySelector('pre').textContent, 'line one\n\nline two\n');
  assert.deepEqual(
    [...previews[1].querySelectorAll('td')].map((cell) => cell.textContent),
    ['one', 'two'],
  );
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('a definition list with blank lines stays one block, and the page shows its terms', () => {
  const markdown =
    '<dl>\n  <dt>Markdown</dt>\n  <dd>A lightweight markup language.</dd>\n\n  <dt>HTML</dt>\n  <dd>A markup language for web pages.</dd>\n</dl>';
  const editor = makeEditor(createEditor, markdown);
  assert.equal(nodesNamed(editor, 'htmlBlock').length, 1, 'one block, not one for each term');
  const preview = dom(editor).querySelector('.rme-raw-preview');
  assert.deepEqual(
    [...preview.querySelectorAll('dt')].map((term) => term.textContent),
    ['Markdown', 'HTML'],
  );
  assert.deepEqual(
    [...preview.querySelectorAll('dd')].map((definition) => definition.textContent),
    ['A lightweight markup language.', 'A markup language for web pages.'],
  );
  assert.equal(getMarkdown(editor), markdown, 'the file comes back as it was');
  editor.destroy();
});

test('a definition list in the page has the weight, the indent and the spacing of the GitHub page', async () => {
  const css = await readFile(new URL('../webview/styles.css', import.meta.url), 'utf8');
  const rule = (selector) => {
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, `${selector} has a rule in styles.css`);
    return css.slice(start, css.indexOf('}', start));
  };
  const term = rule('.rme-raw-preview dt');
  assert.match(term, /font-weight:\s*600/, 'the term is bold');
  assert.match(term, /font-style:\s*italic/, 'the term is italic');
  assert.match(term, /margin-top:\s*1em/, 'a term has room above it');
  const definition = rule('.rme-raw-preview dd');
  assert.match(definition, /margin:\s*0 0 1em/, 'a definition has no large browser margin');
  assert.match(definition, /padding:\s*0 16px/, 'a definition is indented like GitHub indents it');

  const selected = rule('.rme-raw.has-preview.is-selected');
  assert.match(selected, /background:\s*none/, 'the page copy stays on the page, not on the paper of code');
  const field = rule('.rme-raw.has-preview.is-selected .rme-raw-field');
  assert.match(field, /background:\s*var\(--rme-code-bg\)/, 'the code sits on the paper of a code block');
  assert.match(field, /padding:\s*8px 10px/, 'the code has the room of a code block');
});

test('a script block keeps its text box, because the page shows nothing for it', () => {
  const markdown = '<script>\nalert(1);\n</script>';
  const editor = makeEditor(createEditor, markdown);
  const block = dom(editor).querySelector('.rme-raw');
  assert.equal(block.classList.contains('has-preview'), false, 'the page shows no script');
  assert.equal(block.querySelector('textarea').value, markdown);
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('an HTML comment block stays one line until it is selected, and its text box holds the comment', () => {
  const editor = makeEditor(createEditor, '<!-- hidden -->\n\ntext');
  const block = dom(editor).querySelector('.rme-raw');
  assert.equal(block.classList.contains('has-preview'), false);
  assert.equal(block.querySelector('.rme-raw-preview').hidden, true);
  assert.equal(block.classList.contains('is-collapsed'), true, 'a comment shows a line, not a code box');
  assert.equal(block.querySelector('.rme-raw-hidden').textContent, 'HTML comment');
  assert.equal(block.querySelector('textarea').value, '<!-- hidden -->');

  const [{ pos }] = nodesNamed(editor, 'htmlBlock');
  editor.commands.setNodeSelection(pos);
  assert.equal(block.classList.contains('is-selected'), true, 'the code opens when the block is selected');
  editor.commands.setTextSelection(editor.state.doc.content.size - 2);
  assert.equal(block.classList.contains('is-selected'), false);
  assert.equal(block.classList.contains('is-collapsed'), true, 'the code goes, and the line comes back');
  editor.destroy();
});

test('a selected HTML block labels the page copy and the code, and the code has colors', () => {
  const markdown = '<details><summary>More</summary>Shown</details>';
  const editor = makeEditor(createEditor, markdown);
  const block = dom(editor).querySelector('.rme-raw');
  const [{ pos }] = nodesNamed(editor, 'htmlBlock');
  editor.commands.setNodeSelection(pos);

  assert.equal(block.querySelector('.rme-raw-label').textContent, 'HTML output');
  assert.equal(block.querySelector('.rme-raw-code-label').textContent, 'HTML code');
  assert.ok(block.querySelector('.rme-raw-divider'), 'a dotted rule between the page copy and the code');
  assert.ok(block.querySelector('.rme-raw-preview details'), 'the page copy stays above the code');
  assert.ok(block.querySelector('.rme-raw-colors .hljs-tag'), 'the HTML in the text box has colors');
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('a click on the page copy of a selected HTML block closes its text box', () => {
  const markdown = 'Before\n\n<details><summary>More</summary>Shown</details>\n\nAfter';
  const editor = makeEditor(createEditor, markdown);
  const [{ pos }] = nodesNamed(editor, 'htmlBlock');
  const block = dom(editor).querySelector('.rme-raw');
  editor.commands.setNodeSelection(pos);
  assert.equal(block.classList.contains('is-selected'), true);

  block.querySelector('.rme-raw-preview').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(editor.state.selection.empty, true, 'the cursor leaves the block');
  assert.equal(block.classList.contains('is-selected'), false, 'the code box closes, and the page copy stays');
  assert.equal(getMarkdown(editor), markdown, 'the file is unchanged');
  editor.destroy();
});

test('a click on the page copy of another HTML block closes an open text box', () => {
  const markdown = 'Before\n\n<details><summary>One</summary>A</details>\n\n<details><summary>Two</summary>B</details>';
  const editor = makeEditor(createEditor, markdown);
  const blocks = [...dom(editor).querySelectorAll('.rme-raw')];
  const [{ pos }] = nodesNamed(editor, 'htmlBlock');
  editor.commands.setNodeSelection(pos);
  assert.equal(blocks[0].classList.contains('is-selected'), true);

  blocks[1].querySelector('.rme-raw-preview').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(editor.state.selection.empty, true, 'no block stays selected');
  assert.equal(blocks[0].classList.contains('is-selected'), false);
  assert.equal(blocks[1].classList.contains('is-selected'), false, 'the click does not open the other block');
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('typing in the text area of a raw block changes the document, and the text area grows', () => {
  const height = { current: 0 };
  withScrollHeight(height, () => {
    const editor = makeEditor(createEditor, '<div>one</div>');
    const area = dom(editor).querySelector('textarea.rme-raw-input');
    assert.equal(area.style.height, 'auto', 'a page that cannot measure keeps the automatic height');
    height.current = 96;
    area.value = '<div>one</div>\n<div>two</div>\n<div>three</div>';
    area.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(getMarkdown(editor), '<div>one</div>\n<div>two</div>\n<div>three</div>');
    assert.equal(area.style.height, '96px');
    height.current = 0;
    area.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(area.style.height, 'auto');
    editor.destroy();
  });
});

test('a raw block measures its text area when it is made', () => {
  const height = { current: 52 };
  withScrollHeight(height, () => {
    const editor = makeEditor(createEditor, '<div>one</div>');
    assert.equal(dom(editor).querySelector('textarea.rme-raw-input').style.height, '52px');
    editor.destroy();
  });
});

test('a raw block measures its text area again when its width changes, and not when the width is the same', () => {
  const callbacks = [];
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      callbacks.push(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const height = { current: 10 };
  try {
    withScrollHeight(height, () => {
      const editor = makeEditor(createEditor, '<div>one</div>');
      const area = dom(editor).querySelector('textarea.rme-raw-input');
      let width = 0;
      Object.defineProperty(area, 'clientWidth', { configurable: true, get: () => width });
      const resize = () => callbacks.forEach((callback) => callback());
      assert.equal(area.style.height, '10px', 'measured when it was made');

      height.current = 20;
      resize();
      assert.equal(area.style.height, '10px', 'the width is still 0: no new measure');
      width = 300;
      resize();
      assert.equal(area.style.height, '20px', 'a new width: measured again');
      height.current = 30;
      resize();
      assert.equal(area.style.height, '20px', 'the same width: no new measure');
      width = 500;
      resize();
      assert.equal(area.style.height, '30px');
      editor.destroy();
    });
  } finally {
    globalThis.ResizeObserver = original;
  }
});

test('a raw block that changes keeps its element, and the text area gets the new text only when it differs', () => {
  const editor = makeEditor(createEditor, '<div>one</div>');
  const block = dom(editor).querySelector('.rme-raw');
  const area = block.querySelector('textarea');
  const [{ pos }] = nodesNamed(editor, 'htmlBlock');
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { raw: '<div>two</div>' }));
  assert.ok(dom(editor).querySelector('.rme-raw') === block, 'the element is not made again');
  assert.equal(area.value, '<div>two</div>');

  // The user types. The node follows, and the text area must not be set again (that would move the cursor).
  let assigned = 0;
  let value = area.value;
  Object.defineProperty(area, 'value', {
    configurable: true,
    get: () => value,
    set: (next) => {
      assigned++;
      value = next;
    },
  });
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { raw: '<div>two</div>' }));
  assert.equal(assigned, 0, 'same text: the text area is left alone');
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { raw: '<div>three</div>' }));
  assert.equal(assigned, 1);
  editor.destroy();
});

test('an HTML element inside a sentence is kept as it is, and it is not a raw block', () => {
  const editor = makeEditor(createEditor, 'A sentence with <samp>Ctrl</samp> in it.');
  assert.equal(nodesNamed(editor, 'htmlBlock').length, 0);
  const inline = nodesNamed(editor, 'htmlInline');
  assert.equal(inline.length, 1);
  assert.equal(inline[0].node.attrs.raw, '<samp>Ctrl</samp>', 'the whole element is kept');
  assert.equal(getMarkdown(editor), 'A sentence with <samp>Ctrl</samp> in it.');
  editor.destroy();
});

// ---------- Video ----------

test('a video tag inside a sentence is not a video block', () => {
  const editor = makeEditor(createEditor, 'See <video src="a.mp4" controls></video> here.');
  assert.equal(nodesNamed(editor, 'video').length, 0);
  assert.equal(getMarkdown(editor), 'See <video src="a.mp4" controls></video> here.');
  editor.destroy();
});

test('a video tag on a line of its own is a video block, and a tag with text next to it is not', () => {
  const alone = makeEditor(createEditor, '<video src="assets/a.mp4" controls></video>');
  assert.equal(nodesNamed(alone, 'video').length, 1);
  assert.equal(getMarkdown(alone), '<video src="assets/a.mp4" controls></video>');
  alone.destroy();

  const spaced = makeEditor(createEditor, '<video src="a.mp4"></video> <video src="b.mp4"></video>');
  assert.equal(nodesNamed(spaced, 'video').length, 0, 'two tags next to each other are not one video');
  spaced.destroy();

  const withText = makeEditor(createEditor, 'caption <video src="a.mp4"></video>');
  assert.equal(nodesNamed(withText, 'video').length, 0);
  assert.equal(getMarkdown(withText), 'caption <video src="a.mp4"></video>');
  withText.destroy();

  const noSource = makeEditor(createEditor, '<video controls></video>');
  assert.equal(nodesNamed(noSource, 'video').length, 0, 'a video without a source stays as HTML');
  noSource.destroy();
});

test('a video tag with its end tag on the next line, or with a space inside, is a video block', () => {
  const lines = makeEditor(createEditor, '<video src="assets/a.mp4" controls>\n</video>');
  assert.equal(nodesNamed(lines, 'video').length, 1, 'the open tag alone on a line, then the end tag');
  assert.equal(nodesNamed(lines, 'htmlBlock').length, 0);
  assert.equal(getMarkdown(lines), '<video src="assets/a.mp4" controls>\n</video>');
  lines.destroy();

  const space = makeEditor(createEditor, '<video src="assets/a.mp4" controls> </video>');
  assert.equal(nodesNamed(space, 'video').length, 1, 'a space between the tags');
  assert.equal(getMarkdown(space), '<video src="assets/a.mp4" controls> </video>');
  space.destroy();

  const fallback = makeEditor(createEditor, '<video src="assets/a.mp4" controls>Your browser has no video.</video>');
  assert.equal(nodesNamed(fallback, 'video').length, 0, 'text inside the tags: not a plain video');
  assert.equal(getMarkdown(fallback), '<video src="assets/a.mp4" controls>Your browser has no video.</video>');
  fallback.destroy();
});

test('a selected video has a mark, and the mark goes when the selection leaves', () => {
  const editor = makeEditor(createEditor, '<video src="a.mp4" controls></video>\n\ntext');
  const [{ pos }] = nodesNamed(editor, 'video');
  const block = dom(editor).querySelector('.rme-video');
  assert.equal(block.classList.contains('is-selected'), false);
  editor.commands.setNodeSelection(pos);
  assert.equal(block.classList.contains('is-selected'), true);
  editor.commands.setTextSelection(editor.state.doc.content.size - 2);
  assert.equal(block.classList.contains('is-selected'), false);
  editor.destroy();
});

// ---------- The code block ----------

test('the code block has a language button with an arrow, and its picture area is hidden for code that is not drawn', () => {
  const editor = makeEditor(createEditor, '```ts\nconst a = 1;\n```');
  const block = dom(editor).querySelector('.rme-code');
  const button = block.querySelector('.rme-code-lang');
  assert.equal(button.title, 'Change the code language');
  assert.equal(button.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(button.getAttribute('aria-label'), 'Code language: TypeScript');
  assert.ok(button.querySelector('.rme-code-chevron svg'), 'an arrow');
  assert.equal(block.querySelector('.rme-code-header').contentEditable, 'false');
  assert.equal(block.querySelector('.rme-code-preview').hidden, true);
  assert.equal(block.dataset.language, 'ts');
  assert.equal(block.classList.contains('has-language'), true);
  editor.destroy();
});

test('a click on the language button keeps the cursor in the code', () => {
  const editor = makeEditor(createEditor, '```\nx\n```');
  const button = dom(editor).querySelector('.rme-code-lang');
  const event = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  button.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  editor.destroy();
});

test('choosing a language in the picker changes the block, keeps its element, and gives the focus back to the text', () => {
  const editor = makeEditor(createEditor, '```\nx\n```');
  const block = dom(editor).querySelector('.rme-code');
  let focused = 0;
  editor.view.focus = () => focused++;
  dom(editor).querySelector('.rme-code-lang').click();
  const input = document.querySelector('.rme-picker-input');
  input.value = 'rust';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(focused, 1, 'the text gets the focus back');
  assert.ok(dom(editor).querySelector('.rme-code') === block, 'the element is not made again');
  assert.equal(block.dataset.language, 'rust');
  assert.equal(block.querySelector('.rme-code-lang').textContent, 'Rust');
  assert.equal(block.classList.contains('has-language'), true);

  // Plain text again.
  block.querySelector('.rme-code-lang').click();
  const second = document.querySelector('.rme-picker-input');
  second.value = 'plain';
  second.dispatchEvent(new window.Event('input', { bubbles: true }));
  second.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(block.classList.contains('has-language'), false);
  assert.equal(block.dataset.language, '');
  editor.destroy();
});

// ---------- Images ----------

test('an image shows its title, and loses it when the title goes', () => {
  const editor = makeEditor(createEditor, '![A cat](cat.png "My cat")');
  const image = () => dom(editor).querySelector('img:not(.ProseMirror-separator)');
  assert.equal(image().alt, 'A cat');
  assert.equal(image().title, 'My cat');
  const [{ pos, node }] = nodesNamed(editor, 'image');
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: null }));
  assert.equal(image().hasAttribute('title'), false, 'no empty title is left');
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: 'Again', alt: 'New alt' }),
  );
  assert.equal(image().title, 'Again');
  assert.equal(image().alt, 'New alt');
  editor.destroy();
});

// ---------- The settings of the editor extensions ----------

test('the table is not resizable, and pasting an address over selected text makes a link', () => {
  const editor = makeEditor(createEditor, 'a word here');
  const option = (name) => editor.extensionManager.extensions.find((extension) => extension.name === name).options;
  assert.equal(option('table').resizable, false, 'the table has no handles to drag');
  assert.equal(option('link').openOnClick, false, 'a plain click does not open a link');
  assert.equal(option('link').autolink, true);
  assert.equal(option('link').linkOnPaste, true);
  assert.equal(option('link').defaultProtocol, 'https');
  assert.equal(option('taskItem').nested, true);

  editor.commands.setTextSelection({ from: 3, to: 7 });
  const clipboard = {
    getData: (type) => (type === 'text/plain' ? 'https://example.com/page' : ''),
    types: ['text/plain'],
    files: [],
  };
  const event = { clipboardData: clipboard, preventDefault() {}, stopPropagation() {} };
  const pasted = editor.schema.nodeFromJSON({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'https://example.com/page' }] }],
  });
  const handled = editor.view.someProp('handlePaste', (handler) =>
    handler(editor.view, event, pasted.slice(1, pasted.content.size - 1)),
  );
  assert.equal(Boolean(handled), true, 'the paste is handled');
  assert.equal(getMarkdown(editor), 'a [word](https://example.com/page) here');
  editor.destroy();
});

test('inline code with a color gets a swatch that the cursor does not select', async () => {
  const editor = makeEditor(createEditor, 'Use `#0969DA` and `plain`.');
  await frame();
  const swatches = dom(editor).querySelectorAll('.rme-swatch');
  assert.equal(swatches.length, 1);
  assert.equal(swatches[0].getAttribute('aria-hidden'), 'true');
  assert.equal(swatches[0].style.backgroundColor, 'rgb(9, 105, 218)');
  const widgets = [];
  for (const plugin of editor.state.plugins) {
    const set = plugin.props.decorations?.call(plugin, editor.state);
    if (set) widgets.push(...set.find().filter((decoration) => String(decoration.spec?.key).startsWith('swatch-')));
  }
  assert.equal(widgets.length, 1, 'one swatch decoration');
  const widget = widgets[0];
  assert.equal(widget.spec.ignoreSelection, true, 'a click on the swatch does not move the cursor into it');
  assert.equal(widget.spec.side, -1, 'the swatch is before the code');
  editor.destroy();
});
