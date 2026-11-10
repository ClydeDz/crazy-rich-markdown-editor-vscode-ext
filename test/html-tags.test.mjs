// Tests of the HTML elements that GitHub allows in Markdown, and that the page draws.
// The chat that the user checked lists these elements: https://chatgpt.com/share/6af2bd71-1f00-83ec-b2c9-2c4bade64a7e
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');

const resolveImageSrc = (src) =>
  src.startsWith('http') || src.startsWith('data:') ? src : `https://example.test/${src}`;

const nodesNamed = (editor, name) => {
  const found = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === name) found.push({ node, pos });
  });
  return found;
};

// An element in a line of text. `<ins>`, `<sub>`, `<sup>` and `<mark>` are marks, and other tests cover them.
const INLINE = [
  ['a', '<a href="#top">top</a>'],
  ['abbr', '<abbr title="HyperText Markup Language">HTML</abbr>'],
  ['b', '<b>bold</b>'],
  ['bdo', '<bdo dir="rtl">abc</bdo>'],
  ['cite', '<cite>A Book</cite>'],
  ['code', '<code>x()</code>'],
  ['del', '<del>old</del>'],
  ['dfn', '<dfn>term</dfn>'],
  ['em', '<em>emphasis</em>'],
  ['i', '<i>italic</i>'],
  ['img', '<img src="badge.svg" alt="Badge">'],
  ['kbd', '<kbd>Ctrl</kbd>'],
  ['q', '<q>quote</q>'],
  ['ruby', '<ruby>漢<rp>(</rp><rt>kan</rt><rp>)</rp></ruby>'],
  ['s', '<s>old</s>'],
  ['samp', '<samp>output</samp>'],
  ['small', '<small>small</small>'],
  ['span', '<span>span</span>'],
  ['strike', '<strike>old</strike>'],
  ['strong', '<strong>strong</strong>'],
  ['time', '<time datetime="2026-11-10">today</time>'],
  ['tt', '<tt>mono</tt>'],
  ['u', '<u>under</u>'],
  ['var', '<var>x</var>'],
  ['wbr', 'long<wbr>word'],
];

test('every inline HTML element that GitHub allows is drawn, and the file keeps it', () => {
  const broken = [];
  for (const [tag, html] of INLINE) {
    const markdown = `Start ${html} end`;
    const editor = makeEditor(createEditor, markdown, { resolveImageSrc });
    const drawn = [...editor.view.dom.querySelectorAll('.rme-html-inline.is-rendered')].some(
      (chip) => chip.querySelector(tag) !== null,
    );
    const out = getMarkdown(editor);
    if (!drawn || out !== markdown) broken.push({ tag, drawn, out });
    editor.destroy();
  }
  assert.deepEqual(broken, [], 'these inline elements are not drawn, or the file does not keep them');
});

test('a mark is a highlight mark in the document, and the file keeps it', () => {
  const markdown = 'Start <mark>highlight **bold**</mark> end';
  const editor = makeEditor(createEditor, markdown);
  const marks = new Set();
  editor.state.doc.descendants((node) => node.marks.forEach((mark) => marks.add(mark.type.name)));
  assert.deepEqual([...marks].sort(), ['bold', 'highlight']);
  const drawn = [...editor.view.dom.querySelectorAll('mark')].map((mark) => mark.textContent).join('');
  assert.equal(drawn, 'highlight bold');
  assert.equal(getMarkdown(editor), markdown);
  editor.destroy();
});

test('an HTML line break is a line break in the page, and the file keeps it', () => {
  const markdown = 'one<br>two';
  const editor = makeEditor(createEditor, markdown);
  assert.ok(editor.view.dom.querySelector('br'), 'the page breaks the line');
  assert.equal(getMarkdown(editor), markdown, 'the file keeps the tag');
  editor.destroy();
});

// An element that stands alone as a block. The selector lists the element and its children.
const BLOCKS = [
  ['details', '<details open>\n<summary>More</summary>\n\nShown.\n\n</details>', 'details, summary'],
  ['pre', '<pre>\nline one\n\nline two\n</pre>', 'pre'],
  [
    'table',
    '<table>\n<caption>Numbers</caption>\n<thead><tr><th>H</th></tr></thead>\n<tbody><tr><td>B</td></tr></tbody>\n<tfoot><tr><td>F</td></tr></tfoot>\n</table>',
    'table, caption, thead, tbody, tfoot, tr, th, td',
  ],
  ['ul', '<ul><li>one</li><li>two</li></ul>', 'ul, li'],
  ['ol', '<ol><li>one</li></ol>', 'ol, li'],
  ['dl', '<dl><dt>Term</dt><dd>Text</dd></dl>', 'dl, dt, dd'],
  ['blockquote', '<blockquote>Words</blockquote>', 'blockquote'],
  [
    'figure',
    '<figure><img src="pic.png" alt="A"><figcaption>A caption</figcaption></figure>',
    'figure, figcaption, img',
  ],
  ['div', '<div>Words</div>', 'div'],
  ['hr', '<hr>', 'hr'],
  [
    'picture',
    '<picture>\n<source media="(prefers-color-scheme: dark)" srcset="dark.png">\n<img src="light.png" alt="Logo">\n</picture>',
    'picture, source, img',
  ],
  ['h1', '<h1>Title</h1>', 'h1'],
  ['h2', '<h2>Title</h2>', 'h2'],
  ['h3', '<h3>Title</h3>', 'h3'],
  ['h4', '<h4>Title</h4>', 'h4'],
  ['h5', '<h5>Title</h5>', 'h5'],
  ['h6', '<h6>Title</h6>', 'h6'],
  ['p', '<p>Words</p>', 'p'],
];

test('every block HTML element that GitHub allows is drawn, and the file keeps it', () => {
  const broken = [];
  for (const [name, markdown, selectors] of BLOCKS) {
    const editor = makeEditor(createEditor, markdown, { resolveImageSrc });
    const blocks = nodesNamed(editor, 'htmlBlock');
    const dom = editor.view.dom.querySelector('.rme-raw');
    const drawn = dom?.classList.contains('has-preview');
    const missing = selectors
      .split(', ')
      .filter((selector) => dom?.querySelector(`.rme-raw-preview ${selector}`) == null);
    const out = getMarkdown(editor);
    if (blocks.length !== 1 || blocks[0].node.attrs.raw !== markdown || !drawn || missing.length || out !== markdown) {
      broken.push({ name, blocks: blocks.length, drawn, missing, out });
    }
    editor.destroy();
  }
  assert.deepEqual(broken, [], 'these block elements are not drawn, or the file does not keep them');
});

// Every element that the chat lists as supported by GitHub. The demo page should use each one at least once.
const ALL_TAGS =
  'a abbr b bdo blockquote br caption cite code dd del details dfn div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p picture pre q rp rt ruby s samp small source span strike strong sub summary sup table tbody td tfoot th thead time tr tt u ul var wbr'.split(
    ' ',
  );

test('the demo page uses every HTML element that GitHub allows', async () => {
  const sample = await readFile(new URL('./harness/sample.md', import.meta.url), 'utf8');
  const missing = ALL_TAGS.filter((tag) => !new RegExp(`<${tag}(?=[\\s/>])`, 'i').test(sample));
  assert.deepEqual(missing, [], 'these elements are missing from the demo page');
});

test('the demo page uses every GitHub alert', async () => {
  const sample = await readFile(new URL('./harness/sample.md', import.meta.url), 'utf8');
  const missing = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'].filter(
    (type) => !new RegExp(`^> \\[!${type}\\]`, 'm').test(sample),
  );
  assert.deepEqual(missing, [], 'these alerts are missing from the demo page');
});

test('a picture keeps its source, and every address points at the file', () => {
  const markdown =
    '<picture>\n<source media="(prefers-color-scheme: dark)" srcset="dark.png 1x">\n<img src="light.png" alt="Logo">\n</picture>';
  const editor = makeEditor(createEditor, markdown, { resolveImageSrc });
  const preview = editor.view.dom.querySelector('.rme-raw-preview');
  assert.equal(preview.querySelector('picture source').getAttribute('srcset'), 'https://example.test/dark.png 1x');
  assert.equal(preview.querySelector('picture img').getAttribute('src'), 'https://example.test/light.png');
  assert.equal(getMarkdown(editor), markdown, 'the file keeps the addresses that the user wrote');
  editor.destroy();
});
