import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown, setMarkdown } = await loadModule('webview/editor.ts', 'editor');
const { createFloatingToolbars } = await loadModule('webview/toolbar.ts', 'toolbar');
const { videoHtml, videoSource } = await loadModule('webview/media.ts', 'media');
const { canonicalLanguage, languageLabel, languageName } = await loadModule('webview/languages.ts', 'languages');
const { headingSlug, findHeadingForAnchor } = await loadModule('webview/anchors.ts', 'anchors');
const { isMediaFile } = await loadModule('webview/mediaInput.ts', 'mediaInput');
const { EMOJI, emojiFor, searchEmoji } = await loadModule('webview/emoji.ts', 'emoji');
const { isColor } = await loadModule('webview/colorSwatches.ts', 'colorSwatches');
const { renderMath } = await loadModule('webview/math.ts', 'math');
const { looksLikeMath } = await loadModule('webview/markdownText.ts', 'markdownTextForMath');
const { configureDiagrams } = await loadModule('webview/diagrams.ts', 'diagrams');

/** Documents that are already in the canonical form that the editor writes. */
const canonical = {
  headings: '# One\n\n## Two\n\n### Three\n\n#### Four',
  marks: 'Some **bold**, *italic*, ~~strike~~ and `code` and a [link](https://example.com).',
  nestedMarks: '***bold italic*** and **bold with *italic* inside**',
  bulletList: '- one\n- two\n  - nested\n  - nested two\n- three',
  orderedList: '1. a\n2. b\n3. c',
  taskList: '- [ ] todo\n- [x] done',
  quote: '> quoted text\n>\n> second paragraph',
  codeBlock: '```js\nconst x = 1;\n\nconst y = 2;\n```',
  rule: 'above\n\n---\n\nbelow',
  table: '| a   | b   |\n| --- | --- |\n| 1   | 2   |',
  image: '![alt text](img/pic.png)',
  htmlBlock: 'Before\n\n<details>\n<summary>More</summary>\n\nhidden **text**\n\n</details>\n\nAfter',
  htmlComment: '<!-- keep me -->\n\ntext',
  linkDefinition: 'See [docs](https://example.com).\n\n[d]: https://example.com',
  hardBreak: 'Line one  \nLine two',
  plainSymbols: 'snake_case_word, a < b, R&D, 2 * 3 * 4, ~/code, array[0]',
  subSupIns: 'H<sub>2</sub>O and E=mc<sup>2</sup> and <ins>under</ins>.',
  nestedInsideTag: '<ins>underlined **bold** text</ins> and *<sup>x</sup>*',
  alertNote: '> [!NOTE]\n> Useful information.',
  alertAll: '> [!TIP]\n> Tip.\n\n> [!IMPORTANT]\n> Important.\n\n> [!WARNING]\n> Warning.\n\n> [!CAUTION]\n> Caution.',
  alertBlocks:
    '> [!TIP]\n> First paragraph\n>\n> - a list in the alert\n> - second item\n>\n> ```js\n> const x = 1;\n> ```',
  plainQuote: '> plain quote\n>\n> > nested quote',
  unknownMarker: '> [!UNKNOWN]\n> stays a quote',
  video: 'before\n\n<video src="assets/demo.mp4" controls></video>\n\nafter',
  codeLanguages: '```ts\nconst a: number = 1;\n```\n\n```\nplain\n```\n\n```mermaid\ngraph TD;\n```',
  longFence: '````md\n```js\nx\n```\n````',
  footnote: 'A note[^1] and another[^second].\n\n[^1]: The note text.\n\n[^second]: More text.',
  inlineHtml: 'Press <kbd>Ctrl</kbd> + <kbd>C</kbd>, see <a name="top"></a>the top <!-- hidden --> done',
  htmlImage: '<img src="x.png" width="10">',
  autolinks: 'See https://example.com/a_b and www.example.com and me@example.com.',
  linkTitle: '[label](https://x.com "Title") and ![alt](a.png "Image title")',
  backtickCode: 'Use `` `git status` `` to list.',
  tableAlign: '| a   | b   | c   |\n| :--- | :---: | ---: |\n| 1   | 2   | 3   |',
  nbsp: 'a&nbsp;b',
  inlineMath: 'Inline $E = mc^2$ and $a_b$ here.',
  backtickMath: 'Use $`a_b + c_d`$ when the TeX has underscores.',
  blockMath: '$$\n\\int_0^1 x\\,dx\n$$',
  oneLineMath: '$$x^2 + y^2$$',
  notMath: 'It costs $5 and $6, or $10-$20.',
  escapedDollars: 'Literal \\$x\\$ stays text.',
  mathFence: '```math\nx^2\n```',
  mermaidFence: '```mermaid\ngraph TD\n  A --> B\n```',
  footnoteMultiBlock:
    'Text[^a].\n\n[^a]: First paragraph.\n    continued line\n\n    Second paragraph.\n\n    - list in note\n\nAfter the notes.',
  footnoteUrl: 'See[^1].\n\n[^1]: https://example.com',
  emojiCodes: 'Great :+1: and :tada: and :smile:. Not an emoji :nosuchcode: or 10:30:45.',
  emojiInCode: 'Code `:smile:` stays.',
  colorCodes: 'Use `#0969DA`, `rgb(9,105,218)` and `hsl(212,92%,43%)` and `notacolor`.',
  mentions: 'Thanks @octocat and @org/team for #123 and org/repo#45.',
  entities: 'Copyright © 2026 — done',
  escapes: '\\# not a heading\n\n\\- not a list\n\n1\\. not ordered\n\nmid line # - 1. stay plain',
};

for (const [name, markdown] of Object.entries(canonical)) {
  test(`round trip keeps ${name}`, () => {
    const editor = makeEditor(createEditor, markdown);
    assert.equal(getMarkdown(editor), markdown);
    // A second pass must not change the text again.
    const again = makeEditor(createEditor, getMarkdown(editor));
    assert.equal(getMarkdown(again), markdown);
    editor.destroy();
    again.destroy();
  });
}

test('round trip normalizes other bullet styles and setext headings', () => {
  const editor = makeEditor(createEditor, '* star\n* list\n\nTitle\n=====\n\n__bold__ and _em_');
  assert.equal(getMarkdown(editor), '- star\n- list\n\n# Title\n\n**bold** and *em*');
  editor.destroy();
});

test('extra blank lines between blocks go away, blank lines in code stay', () => {
  const editor = makeEditor(createEditor, 'a\n\n\n\nb\n\n```\nx\n\n\ny\n```');
  assert.equal(getMarkdown(editor), 'a\n\nb\n\n```\nx\n\n\ny\n```');
  editor.destroy();
});

test('typed text that looks like syntax is escaped and reads back as text', () => {
  const editor = makeEditor(createEditor, '');
  const samples = [
    '# not heading',
    '- not list',
    '1. not ordered',
    '> not quote',
    '+ plus',
    '---',
    'a*b*c',
    '_x_',
    '`tick`',
    '<div>x</div>',
    '&amp;',
    '[a](b)',
    'C:\\Users\\me\\',
    '~~x~~',
  ];
  for (const text of samples) {
    editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
    const markdown = getMarkdown(editor);
    setMarkdown(editor, markdown);
    assert.equal(
      editor.state.doc.childCount,
      1,
      `one block for ${JSON.stringify(text)} via ${JSON.stringify(markdown)}`,
    );
    assert.equal(
      editor.state.doc.firstChild.type.name,
      'paragraph',
      `paragraph for ${JSON.stringify(text)} via ${JSON.stringify(markdown)}`,
    );
    assert.equal(editor.state.doc.textContent, text, `text for ${JSON.stringify(markdown)}`);
  }
  editor.destroy();
});

test('text after a hard break is escaped like the start of a line', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.setContent({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'first' }, { type: 'hardBreak' }, { type: 'text', text: '# second' }],
      },
    ],
  });
  const markdown = getMarkdown(editor);
  assert.ok(markdown.includes('\\# second'), markdown);
  editor.destroy();
});

test('table cells that hold a pipe survive', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.setContent({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a|b' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
            ],
          },
        ],
      },
    ],
  });
  const markdown = getMarkdown(editor);
  setMarkdown(editor, markdown);
  const header = editor.state.doc.firstChild.firstChild.firstChild;
  assert.equal(header.textContent, 'a|b', markdown);
  editor.destroy();
});

test('an image keeps its relative src in the document', () => {
  const editor = makeEditor(createEditor, '![alt](img/pic.png)', {
    resolveImageSrc: (src) => `https://webview.test/base/${src}`,
  });
  assert.equal(getMarkdown(editor), '![alt](img/pic.png)');
  const img = editor.view.dom.querySelector('img:not(.ProseMirror-separator)');
  assert.equal(img.getAttribute('src'), 'https://webview.test/base/img/pic.png');
  editor.destroy();
});

test('raw HTML blocks are editable and write back the new text', () => {
  const editor = makeEditor(createEditor, '<div>old</div>\n\ntext');
  const area = editor.view.dom.querySelector('textarea.rme-raw-input');
  assert.ok(area, 'raw block shows a text box');
  assert.equal(area.value, '<div>old</div>');
  area.value = '<div>new</div>';
  area.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(getMarkdown(editor), '<div>new</div>\n\ntext');
  editor.destroy();
});

test('setMarkdown does not emit an update event', () => {
  const editor = makeEditor(createEditor, 'one');
  let updates = 0;
  editor.on('update', () => updates++);
  setMarkdown(editor, 'two');
  assert.equal(updates, 0);
  assert.equal(getMarkdown(editor), 'two');
  editor.commands.insertContent('x');
  assert.equal(updates, 1);
  editor.destroy();
});

function selectText(editor, text) {
  let found;
  editor.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return;
    const index = node.text.indexOf(text);
    if (index >= 0) found = { from: pos + index, to: pos + index + text.length };
  });
  assert.ok(found, `text ${text} exists`);
  editor.commands.setTextSelection(found);
}

function setup(markdown) {
  const toolbars = createFloatingToolbars();
  const editor = makeEditor(createEditor, markdown, { extensions: toolbars.extensions });
  toolbars.bind(editor);
  const click = (id) => toolbars.textBar.querySelector(`[data-action="${id}"]`).click();
  const button = (id) => toolbars.textBar.querySelector(`[data-action="${id}"]`);
  return { editor, toolbars, click, button };
}

test('toolbar buttons format the selected text', () => {
  const cases = [
    ['bold', '**word**'],
    ['italic', '*word*'],
    ['strike', '~~word~~'],
    ['code', '`word`'],
  ];
  for (const [id, expected] of cases) {
    const { editor, click } = setup('a word here');
    selectText(editor, 'word');
    click(id);
    assert.equal(getMarkdown(editor), `a ${expected} here`, id);
    editor.destroy();
  }
});

test('toolbar bold button toggles and shows its state', () => {
  const { editor, click, button } = setup('a word here');
  selectText(editor, 'word');
  assert.equal(button('bold').getAttribute('aria-pressed'), 'false');
  click('bold');
  assert.equal(button('bold').classList.contains('is-active'), true);
  assert.equal(button('bold').getAttribute('aria-pressed'), 'true');
  click('bold');
  assert.equal(getMarkdown(editor), 'a word here');
  assert.equal(button('bold').classList.contains('is-active'), false);
  editor.destroy();
});

test('toolbar block buttons change the block type', () => {
  const cases = [
    ['h1', '# word'],
    ['h2', '## word'],
    ['h3', '### word'],
    ['bulletList', '- word'],
    ['orderedList', '1. word'],
    ['taskList', '- [ ] word'],
    ['blockquote', '> word'],
    ['codeBlock', '```\nword\n```'],
  ];
  for (const [id, expected] of cases) {
    const { editor, click } = setup('word');
    selectText(editor, 'word');
    click(id);
    assert.equal(getMarkdown(editor), expected, id);
    editor.destroy();
  }
});

test('toolbar clear formatting removes marks and block styles', () => {
  const { editor, click } = setup('## a **bold** word');
  selectText(editor, 'bold word'.slice(0, 4));
  editor.commands.selectAll();
  click('clear');
  assert.equal(getMarkdown(editor), 'a bold word');
  editor.destroy();
});

test('toolbar link form sets and removes a link', () => {
  const { editor, toolbars, click } = setup('a word here');
  selectText(editor, 'word');
  click('link');
  const input = toolbars.textBar.querySelector('.rme-link-input');
  assert.equal(toolbars.textBar.classList.contains('is-link-mode'), true);
  input.value = 'example.com';
  toolbars.textBar.querySelector('.rme-link-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  assert.equal(getMarkdown(editor), 'a [word](https://example.com) here');
  assert.equal(toolbars.textBar.classList.contains('is-link-mode'), false);

  selectText(editor, 'word');
  click('link');
  assert.equal(input.value, 'https://example.com');
  toolbars.textBar.querySelector('[data-unlink]').click();
  assert.equal(getMarkdown(editor), 'a word here');
  editor.destroy();
});

test('toolbar link form cancel leaves the text alone', () => {
  const { editor, toolbars, click } = setup('a word here');
  selectText(editor, 'word');
  click('link');
  toolbars.textBar.querySelector('[data-cancel]').click();
  assert.equal(toolbars.textBar.classList.contains('is-link-mode'), false);
  assert.equal(getMarkdown(editor), 'a word here');
  editor.destroy();
});

// ---------- GitHub Flavored Markdown ----------

test('a link whose text is its address is written as a bare address', () => {
  const editor = makeEditor(
    createEditor,
    '<https://example.com/path> and [https://example.com/a](https://example.com/a) and [other text](https://example.com)',
  );
  assert.equal(
    getMarkdown(editor),
    'https://example.com/path and https://example.com/a and [other text](https://example.com)',
  );
  editor.destroy();
});

test('a bare address that ends with punctuation uses angle brackets', () => {
  const editor = makeEditor(createEditor, '<https://example.com/a.>');
  assert.equal(getMarkdown(editor), '<https://example.com/a.>');
  editor.destroy();
});

test('a mailto link with a title keeps its title', () => {
  const editor = makeEditor(createEditor, '[me@example.com](mailto:me@example.com "Boss")');
  assert.equal(getMarkdown(editor), '[me@example.com](mailto:me@example.com "Boss")');
  editor.destroy();
});

test('underline, subscript and superscript are marks in the document', () => {
  const editor = makeEditor(createEditor, 'H<sub>2</sub>O E=mc<sup>2</sup> <ins>under</ins>');
  const marks = new Set();
  editor.state.doc.descendants((node) => node.marks.forEach((mark) => marks.add(mark.type.name)));
  assert.deepEqual([...marks].sort(), ['subscript', 'superscript', 'underline']);
  assert.equal(editor.view.dom.querySelectorAll('sub, sup, u').length, 3);
  editor.destroy();
});

test('alerts are alert nodes with a type, and plain quotes are not', () => {
  const editor = makeEditor(createEditor, '> [!WARNING]\n> Careful\n\n> plain');
  const types = editor.state.doc.content.content
    .filter((node) => node.type.name !== 'paragraph')
    .map((node) => `${node.type.name}:${node.attrs.type ?? ''}`);
  assert.deepEqual(types, ['alert:warning', 'blockquote:']);
  assert.equal(editor.view.dom.querySelectorAll('.rme-alert-warning').length, 1);
  editor.destroy();
});

test('an alert marker in lower case is read, and written in upper case', () => {
  const editor = makeEditor(createEditor, '> [!note]\n> text');
  assert.equal(getMarkdown(editor), '> [!NOTE]\n> text');
  editor.destroy();
});

test('an alert with only a marker has an empty paragraph, and is written as the marker alone', () => {
  const editor = makeEditor(createEditor, '> [!CAUTION]');
  assert.equal(editor.state.doc.firstChild.type.name, 'alert');
  assert.equal(getMarkdown(editor), '> [!CAUTION]');
  editor.destroy();
});

test('the alert type can change, and the alert can be removed', () => {
  const editor = makeEditor(createEditor, '> [!NOTE]\n> text');
  editor.commands.setTextSelection(3);
  editor.commands.setAlert('tip');
  assert.equal(getMarkdown(editor), '> [!TIP]\n> text');
  editor.commands.unsetAlert();
  assert.equal(getMarkdown(editor), 'text');
  editor.destroy();
});

test('the alert select in the editor changes the type', () => {
  const editor = makeEditor(createEditor, '> [!NOTE]\n> text');
  const select = editor.view.dom.querySelector('.rme-alert-select');
  select.value = 'important';
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(getMarkdown(editor), '> [!IMPORTANT]\n> text');
  editor.destroy();
});

test('code blocks keep the language, and only a named language gets colors', () => {
  const editor = makeEditor(
    createEditor,
    '```ts\nconst a = 1;\n```\n\n```\nconst b = 2;\n```\n\n```mermaid\nconst c = 3;\n```',
  );
  const blocks = [...editor.view.dom.querySelectorAll('.rme-code')];
  assert.equal(blocks.length, 3);
  assert.ok(blocks[0].querySelector('.hljs-keyword'), 'ts block has colors');
  assert.equal(blocks[1].querySelector('[class^="hljs"]'), null, 'a block without a language stays plain');
  assert.equal(blocks[2].querySelector('[class^="hljs"]'), null, 'an unknown language stays plain');
  assert.deepEqual(
    blocks.map((b) => b.querySelector('.rme-code-lang').textContent),
    ['TypeScript', 'Plain text', 'Mermaid'],
  );
  editor.destroy();
});

test('the language of a code block can change', () => {
  const editor = makeEditor(createEditor, '```\nprint(1)\n```');
  const pos = 0;
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { language: 'python' }));
  assert.equal(getMarkdown(editor), '```python\nprint(1)\n```');
  assert.equal(editor.view.dom.querySelector('.rme-code-lang').textContent, 'Python');
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { language: null }));
  assert.equal(getMarkdown(editor), '```\nprint(1)\n```');
  editor.destroy();
});

test('the language button opens a picker that sets the language', () => {
  const editor = makeEditor(createEditor, '```\nx\n```');
  editor.view.dom.querySelector('.rme-code-lang').click();
  const picker = document.querySelector('.rme-picker');
  assert.ok(picker, 'picker is open');
  const input = picker.querySelector('input');
  input.value = 'rust';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('.rme-picker'), null, 'picker closes');
  assert.equal(getMarkdown(editor), '```rust\nx\n```');
  editor.destroy();
});

test('the picker accepts a language that is not in the list', () => {
  const editor = makeEditor(createEditor, '```\nx\n```');
  editor.view.dom.querySelector('.rme-code-lang').click();
  const input = document.querySelector('.rme-picker input');
  input.value = 'terraform';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  const rows = [...document.querySelectorAll('.rme-picker-label')].map((row) => row.textContent);
  assert.deepEqual(rows, ['Use “terraform”']);
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(getMarkdown(editor), '```terraform\nx\n```');
  editor.destroy();
});

test('the picker closes on Escape and keeps the language', () => {
  const editor = makeEditor(createEditor, '```js\nx\n```');
  editor.view.dom.querySelector('.rme-code-lang').click();
  const input = document.querySelector('.rme-picker input');
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('.rme-picker'), null);
  assert.equal(getMarkdown(editor), '```js\nx\n```');
  editor.destroy();
});

test('language helpers know aliases and labels', () => {
  assert.equal(canonicalLanguage('ts'), 'typescript');
  assert.equal(canonicalLanguage('JS'), 'javascript');
  assert.equal(canonicalLanguage('yml'), 'yaml');
  assert.equal(canonicalLanguage('terraform'), 'terraform');
  assert.equal(canonicalLanguage(''), '');
  assert.equal(languageLabel('py'), 'Python');
  assert.equal(languageLabel(null), 'Plain text');
  assert.equal(languageLabel('terraform'), 'terraform');
  assert.equal(languageName('js {1,3}'), 'js');
});

test('a code block with extra words after the language still gets colors', () => {
  const editor = makeEditor(createEditor, '```js {1,3} title="a.js"\nconst a = 1;\n```');
  assert.ok(editor.view.dom.querySelector('.hljs-keyword'));
  assert.equal(getMarkdown(editor), '```js {1,3} title="a.js"\nconst a = 1;\n```');
  editor.destroy();
});

test('typing a fence with a language makes a code block with that language', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.insertContent({
    type: 'codeBlock',
    attrs: { language: 'bash' },
    content: [{ type: 'text', text: 'echo hi' }],
  });
  assert.equal(getMarkdown(editor), '```bash\necho hi\n```');
  editor.destroy();
});

test('a fence is longer than any run of backticks in the code', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.insertContent({
    type: 'codeBlock',
    attrs: { language: 'md' },
    content: [{ type: 'text', text: '```js\nx\n```' }],
  });
  assert.equal(getMarkdown(editor), '````md\n```js\nx\n```\n````');
  const again = makeEditor(createEditor, getMarkdown(editor));
  assert.equal(again.state.doc.firstChild.textContent, '```js\nx\n```');
  editor.destroy();
  again.destroy();
});

test('HTML in a line is kept as a chip that holds the HTML', () => {
  const editor = makeEditor(createEditor, 'a <kbd>Ctrl</kbd> b <!-- c --> d');
  const chips = [...editor.view.dom.querySelectorAll('.rme-html-inline')].map((chip) => chip.textContent);
  assert.deepEqual(chips, ['<kbd>Ctrl</kbd>', '<!-- c -->']);
  assert.equal(getMarkdown(editor), 'a <kbd>Ctrl</kbd> b <!-- c --> d');
  editor.destroy();
});

test('named entities are read as characters, and the file gets the character', () => {
  const editor = makeEditor(
    createEditor,
    'Copyright &copy; 2026 &mdash; a&nbsp;b &amp; c &lt;tag&gt; &#169; AT&T; R&D',
  );
  assert.equal(editor.state.doc.textContent, 'Copyright © 2026 — a\u00a0b & c <tag> © AT&T; R&D');
  assert.equal(getMarkdown(editor), 'Copyright © 2026 — a&nbsp;b & c \\<tag> © AT&T; R&D');
  editor.destroy();
});

test('an escaped entity stays literal text', () => {
  const editor = makeEditor(createEditor, 'Write \\&nbsp; to get a space');
  assert.equal(editor.state.doc.textContent, 'Write &nbsp; to get a space');
  assert.equal(getMarkdown(editor), 'Write \\&nbsp; to get a space');
  editor.destroy();
});

test('a line break tag is still a line break', () => {
  const editor = makeEditor(createEditor, 'one<br>two<br/>three');
  assert.equal(getMarkdown(editor), 'one  \ntwo  \nthree');
  editor.destroy();
});

test('video HTML becomes a video node with a player', () => {
  const editor = makeEditor(createEditor, '<video src="assets/demo.mp4" controls></video>', {
    resolveImageSrc: (src) => `https://webview.test/base/${src}`,
  });
  assert.equal(editor.state.doc.firstChild.type.name, 'video');
  const player = editor.view.dom.querySelector('video');
  assert.equal(player.getAttribute('src'), 'https://webview.test/base/assets/demo.mp4');
  editor.destroy();
});

test('a video with other attributes is kept as it is', () => {
  const html = '<video src="a.mp4" width="400" controls autoplay muted></video>';
  const editor = makeEditor(createEditor, html);
  assert.equal(editor.state.doc.firstChild.type.name, 'video');
  assert.equal(getMarkdown(editor), html);
  editor.destroy();
});

test('other HTML blocks are not videos', () => {
  const editor = makeEditor(createEditor, '<div><video src="a.mp4"></video></div>');
  assert.equal(editor.state.doc.firstChild.type.name, 'htmlBlock');
  editor.destroy();
});

test('video helpers read and write the tag', () => {
  assert.equal(videoSource('<video src="a b.mp4" controls></video>'), 'a b.mp4');
  assert.equal(videoSource("<video controls src='x.webm'></video>"), 'x.webm');
  assert.equal(videoSource('<video controls></video>'), undefined);
  assert.equal(videoSource('<div></div>'), undefined);
  assert.equal(videoHtml('assets/demo.mp4'), '<video src="assets/demo.mp4" controls></video>');
});

test('inserting media adds an image and a video', () => {
  const editor = makeEditor(createEditor, 'text');
  editor.commands.focus('end');
  editor.commands.insertContent([
    { type: 'image', attrs: { src: 'assets/a%20b.png', alt: 'a b' } },
    { type: 'video', attrs: { raw: videoHtml('assets/demo.mp4') } },
  ]);
  assert.equal(getMarkdown(editor), 'text![a b](assets/a%20b.png)\n\n<video src="assets/demo.mp4" controls></video>');
  editor.destroy();
});

test('media files are found by type or by extension', () => {
  assert.equal(isMediaFile({ name: 'a.png', type: 'image/png' }), true);
  assert.equal(isMediaFile({ name: 'clip', type: 'video/mp4' }), true);
  assert.equal(isMediaFile({ name: 'clip.MOV', type: '' }), true);
  assert.equal(isMediaFile({ name: 'notes.txt', type: 'text/plain' }), false);
  assert.equal(isMediaFile({ name: 'run.sh', type: '' }), false);
});

test('heading anchors follow the GitHub rules', () => {
  assert.equal(headingSlug('Hello, World!'), 'hello-world');
  assert.equal(headingSlug('  My Section  '), 'my-section');
  assert.equal(headingSlug('API v2.0 (beta)'), 'api-v20-beta');
  assert.equal(headingSlug('snake_case and-dash'), 'snake_case-and-dash');
  assert.equal(headingSlug('Über Café'), 'über-café');

  const root = document.createElement('div');
  root.innerHTML = '<h1>Intro</h1><h2>Setup</h2><h2>Setup</h2><h3>Setup</h3>';
  const headings = root.querySelectorAll('h1, h2, h3');
  assert.equal(findHeadingForAnchor(root, '#intro'), headings[0]);
  assert.equal(findHeadingForAnchor(root, '#setup'), headings[1]);
  assert.equal(findHeadingForAnchor(root, '#setup-1'), headings[2]);
  assert.equal(findHeadingForAnchor(root, '#setup-2'), headings[3]);
  assert.equal(findHeadingForAnchor(root, '#missing'), undefined);
  assert.equal(findHeadingForAnchor(root, '#INTRO'), headings[0]);
});

test('toolbar underline button writes an ins tag', () => {
  const { editor, click, button } = setup('a word here');
  selectText(editor, 'word');
  click('underline');
  assert.equal(getMarkdown(editor), 'a <ins>word</ins> here');
  assert.equal(button('underline').classList.contains('is-active'), true);
  click('underline');
  assert.equal(getMarkdown(editor), 'a word here');
  editor.destroy();
});

test('the More menu opens, shows the state of formats, and closes after a choice', () => {
  const { editor, toolbars, click, button } = setup('a word here');
  selectText(editor, 'word');
  const menu = toolbars.textBar.querySelector('.rme-menu');
  assert.equal(menu.hidden, true);
  click('more');
  assert.equal(menu.hidden, false);
  assert.equal(button('more').getAttribute('aria-expanded'), 'true');
  click('superscript');
  assert.equal(getMarkdown(editor), 'a <sup>word</sup> here');
  assert.equal(menu.hidden, true);
  assert.equal(button('superscript').getAttribute('aria-checked'), 'true');
  click('more');
  click('subscript');
  // Subscript and superscript exclude each other, so the new choice replaces the old one.
  assert.equal(getMarkdown(editor), 'a <sub>word</sub> here');
  editor.destroy();
});

test('the More menu closes on Escape and when the selection changes', () => {
  const { editor, toolbars, click } = setup('a word here');
  selectText(editor, 'word');
  const menu = toolbars.textBar.querySelector('.rme-menu');
  click('more');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(menu.hidden, true);
  click('more');
  selectText(editor, 'here');
  assert.equal(menu.hidden, true);
  editor.destroy();
});

test('the More menu wraps the selection in an alert, and the same choice removes it', () => {
  const { editor, click, button } = setup('a word here');
  selectText(editor, 'word');
  click('more');
  click('alert-warning');
  assert.equal(getMarkdown(editor), '> [!WARNING]\n> a word here');
  assert.equal(button('alert-warning').classList.contains('is-active'), true);
  click('more');
  click('alert-tip');
  assert.equal(getMarkdown(editor), '> [!TIP]\n> a word here');
  click('more');
  click('alert-tip');
  assert.equal(getMarkdown(editor), 'a word here');
  editor.destroy();
});

test('the More menu clears formatting', () => {
  const { editor, click } = setup('## a **bold** <ins>word</ins>');
  editor.commands.selectAll();
  click('more');
  click('clear');
  assert.equal(getMarkdown(editor), 'a bold word');
  editor.destroy();
});

test('undo does not remove the loaded document', () => {
  const editor = makeEditor(createEditor, '# Title\n\ntext');
  editor.commands.undo();
  assert.equal(getMarkdown(editor), '# Title\n\ntext');
  editor.commands.insertContentAt(editor.state.doc.content.size, ' more');
  editor.commands.undo();
  assert.equal(getMarkdown(editor), '# Title\n\ntext');
  editor.destroy();
});

// ---------- Footnotes, emoji and colors ----------

/** Type text the way a user does, so the input rules run. */
function type(editor, text) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (handler) => handler(editor.view, from, to, char));
    if (!handled) {
      editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    }
  }
}

test('footnote marks are numbered in the order they appear', () => {
  const editor = makeEditor(
    createEditor,
    'Second[^b] then first[^a] then second again[^b].\n\n[^a]: Text A.\n\n[^b]: Text B.\n\n[^c]: Unused.',
  );
  const refs = [...editor.view.dom.querySelectorAll('.rme-fn-ref')].map((el) => el.getAttribute('data-n'));
  assert.deepEqual(refs, ['1', '2', '1']);
  const defs = [...editor.view.dom.querySelectorAll('.rme-fn-def')].map((el) => [
    el.getAttribute('data-footnote-definition'),
    el.getAttribute('data-n'),
    el.classList.contains('is-unused'),
  ]);
  assert.deepEqual(defs, [
    ['a', '2', false],
    ['b', '1', false],
    ['c', '', true],
  ]);
  editor.destroy();
});

test('footnote numbers update when the document changes', () => {
  const editor = makeEditor(createEditor, 'One[^a].\n\n[^a]: A.');
  editor.commands.focus('start');
  editor.commands.insertContentAt(1, { type: 'footnoteRef', attrs: { id: 'z' } });
  const refs = [...editor.view.dom.querySelectorAll('.rme-fn-ref')].map((el) => [
    el.getAttribute('data-footnote-ref'),
    el.getAttribute('data-n'),
  ]);
  assert.deepEqual(refs, [
    ['z', '1'],
    ['a', '2'],
  ]);
  editor.destroy();
});

test('a footnote definition holds several blocks', () => {
  const editor = makeEditor(createEditor, 'Text[^a].\n\n[^a]: First.\n\n    - item');
  const definition = editor.state.doc.content.content.find((node) => node.type.name === 'footnoteDefinition');
  assert.deepEqual(
    definition.content.content.map((node) => node.type.name),
    ['paragraph', 'bulletList'],
  );
  editor.destroy();
});

test('insert footnote adds a mark and a definition, with the cursor in the definition', () => {
  const editor = makeEditor(createEditor, 'A sentence.');
  editor.commands.focus('end');
  editor.commands.insertFootnote();
  type(editor, 'The note.');
  assert.equal(getMarkdown(editor), 'A sentence.[^1]\n\n[^1]: The note.');
  editor.commands.focus(1);
  editor.commands.insertFootnote();
  type(editor, 'Another.');
  assert.equal(getMarkdown(editor), '[^2]A sentence.[^1]\n\n[^1]: The note.\n\n[^2]: Another.');
  editor.destroy();
});

test('a footnote mark is a node, not text', () => {
  const editor = makeEditor(createEditor, 'A note[^1].');
  let refs = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteRef') refs++;
  });
  assert.equal(refs, 1);
  assert.equal(editor.state.doc.textContent, 'A note.');
  editor.destroy();
});

test('emoji codes become emoji nodes and are written as codes', () => {
  const editor = makeEditor(createEditor, 'a :tada: b');
  const emoji = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'emoji') emoji.push(node.attrs.name);
  });
  assert.deepEqual(emoji, ['tada']);
  assert.equal(editor.view.dom.querySelector('.rme-emoji').textContent, '🎉');
  assert.equal(getMarkdown(editor), 'a :tada: b');
  editor.destroy();
});

test('typing an emoji code makes an emoji, and an unknown code stays text', () => {
  const editor = makeEditor(createEditor, '');
  type(editor, 'Hi :smile:');
  assert.equal(editor.view.dom.querySelectorAll('.rme-emoji').length, 1);
  assert.equal(getMarkdown(editor), 'Hi :smile:');
  type(editor, ' and :nosuchcode:');
  assert.equal(editor.view.dom.querySelectorAll('.rme-emoji').length, 1);
  assert.equal(getMarkdown(editor), 'Hi :smile: and :nosuchcode:');
  editor.destroy();
});

test('emoji codes in inline code stay text', () => {
  const editor = makeEditor(createEditor, 'Code `:smile:` stays.');
  assert.equal(editor.view.dom.querySelectorAll('.rme-emoji').length, 0);
  editor.destroy();
});

test('emoji data and search work', () => {
  assert.ok(EMOJI.length > 1500);
  assert.equal(emojiFor('+1'), '👍');
  assert.equal(emojiFor('thumbsup'), '👍');
  assert.equal(emojiFor('nosuchcode'), undefined);
  assert.deepEqual(searchEmoji('s'), []);
  const found = searchEmoji('smil');
  assert.ok(found.length > 0 && found.length <= 8);
  assert.ok(found.every((item) => item.name.includes('smil')));
  assert.equal(found[0].name.startsWith('smil'), true);
  assert.equal(searchEmoji('tad')[0].emoji, '🎉');
});

test('inline code that holds a color shows a swatch', () => {
  const editor = makeEditor(
    createEditor,
    'Use `#0969DA`, `rgb(9,105,218)`, `hsl(212,92%,43%)` and `notacolor` and #ff0000 plain.',
  );
  const swatches = [...editor.view.dom.querySelectorAll('.rme-swatch')];
  assert.equal(swatches.length, 3);
  assert.equal(swatches[0].style.backgroundColor !== '', true);
  editor.destroy();
});

test('color detection follows the GitHub forms', () => {
  for (const value of ['#fff', '#0969DA', '#0969da80', 'rgb(1, 2, 3)', 'hsl(212, 92%, 43%)']) {
    assert.equal(isColor(value), true, value);
  }
  for (const value of ['red', '#ggg', '#12345', 'rgb(1,2)', 'hsl(1,2,3)', 'color: #fff']) {
    assert.equal(isColor(value), false, value);
  }
});

// ---------- Math and diagrams ----------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('math in a line becomes a math node with the TeX, and the file keeps the dollars', () => {
  const editor = makeEditor(createEditor, 'Inline $E = mc^2$ and $`a_b`$ here.');
  const nodes = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mathInline') nodes.push([node.attrs.tex, node.attrs.backtick]);
  });
  assert.deepEqual(nodes, [
    ['E = mc^2', false],
    ['a_b', true],
  ]);
  assert.equal(editor.view.dom.querySelectorAll('.rme-math .katex').length, 2);
  assert.equal(getMarkdown(editor), 'Inline $E = mc^2$ and $`a_b`$ here.');
  editor.destroy();
});

test('dollar signs that are not math stay text', () => {
  const editor = makeEditor(createEditor, 'It costs $5 and $6, or $10-$20, or $ x $ here.');
  let math = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name.startsWith('math')) math++;
  });
  assert.equal(math, 0);
  assert.equal(getMarkdown(editor), 'It costs $5 and $6, or $10-$20, or $ x $ here.');
  editor.destroy();
});

test('typed text that looks like math is escaped, so it reads back as text', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.setContent({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write $x$ and $y$ as text' }] }],
  });
  assert.equal(getMarkdown(editor), 'Write \\$x\\$ and \\$y\\$ as text');
  setMarkdown(editor, getMarkdown(editor));
  assert.equal(editor.state.doc.textContent, 'Write $x$ and $y$ as text');
  assert.equal(looksLikeMath('a $x$ b'), true);
  assert.equal(looksLikeMath('a $5 and $6'), false);
  editor.destroy();
});

test('a $$ block is a math block, in one line or in lines', () => {
  const editor = makeEditor(createEditor, '$$\n\\int_0^1 x\\,dx\n$$\n\ntext\n\n$$a^2$$');
  const blocks = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mathBlock') blocks.push([node.attrs.tex, node.attrs.oneLine]);
  });
  assert.deepEqual(blocks, [
    ['\\int_0^1 x\\,dx', false],
    ['a^2', true],
  ]);
  assert.equal(editor.view.dom.querySelectorAll('.rme-math-block .katex-display').length, 2);
  assert.equal(getMarkdown(editor), '$$\n\\int_0^1 x\\,dx\n$$\n\ntext\n\n$$a^2$$');
  editor.destroy();
});

test('TeX with an error shows the TeX and the message, and the file keeps it', () => {
  const editor = makeEditor(createEditor, 'Bad $\\frac{1$ here.\n\n$$\\frac{$$');
  const inline = editor.view.dom.querySelector('.rme-math');
  assert.equal(inline.classList.contains('is-error'), true);
  assert.equal(inline.querySelector('.rme-math-view').textContent, '$\\frac{1$');
  assert.ok(inline.title.length > 0);
  assert.equal(editor.view.dom.querySelector('.rme-math-block').classList.contains('is-error'), true);
  assert.equal(getMarkdown(editor), 'Bad $\\frac{1$ here.\n\n$$\\frac{$$');
  assert.ok(renderMath('x^2', false).html.includes('katex'));
  assert.ok(renderMath('\\frac{', false).error);
  editor.destroy();
});

test('clicking inline math opens its TeX for editing, and leaving it saves the change', () => {
  const editor = makeEditor(createEditor, 'a $x^2$ b');
  let pos;
  editor.state.doc.descendants((node, at) => {
    if (node.type.name === 'mathInline') pos = at;
  });
  editor.commands.setNodeSelection(pos);
  const input = editor.view.dom.querySelector('.rme-math-input');
  assert.equal(input.hidden, false);
  assert.equal(input.value, 'x^2');
  input.value = 'y^3';
  input.dispatchEvent(new window.Event('blur'));
  assert.equal(getMarkdown(editor), 'a $y^3$ b');
  editor.destroy();
});

test('an empty TeX field removes the inline math', () => {
  const editor = makeEditor(createEditor, 'a $x$ b');
  let pos;
  editor.state.doc.descendants((node, at) => {
    if (node.type.name === 'mathInline') pos = at;
  });
  editor.commands.setNodeSelection(pos);
  const input = editor.view.dom.querySelector('.rme-math-input');
  input.value = '   ';
  input.dispatchEvent(new window.Event('blur'));
  assert.equal(getMarkdown(editor), 'a  b');
  editor.destroy();
});

test('a math block opens for editing, and the change shows in the file', () => {
  const editor = makeEditor(createEditor, '$$\nx\n$$');
  editor.commands.setNodeSelection(0);
  const area = editor.view.dom.querySelector('textarea.rme-math-input');
  assert.equal(area.hidden, false);
  area.value = 'a + b\n= c';
  area.dispatchEvent(new window.Event('blur'));
  assert.equal(getMarkdown(editor), '$$\na + b\n= c\n$$');
  editor.destroy();
});

test('insert math block adds a block that is open for editing', () => {
  const editor = makeEditor(createEditor, 'text');
  editor.commands.focus('end');
  editor.commands.insertMathBlock();
  assert.equal(getMarkdown(editor), 'text\n\n$$\nx^2 + y^2 = z^2\n$$');
  assert.equal(editor.view.dom.querySelector('.rme-math-block').classList.contains('is-editing'), true);
  editor.destroy();
});

test('typing $x$ makes inline math, but not after a letter or in code', () => {
  const editor = makeEditor(createEditor, '');
  type(editor, 'Use $x^2$');
  assert.equal(editor.view.dom.querySelectorAll('.rme-math').length, 1);
  assert.equal(getMarkdown(editor), 'Use $x^2$');
  editor.destroy();

  const second = makeEditor(createEditor, '');
  type(second, 'a$b$');
  assert.equal(second.view.dom.querySelectorAll('.rme-math').length, 0);
  second.destroy();
});

test('a math code block shows the formula under its text', async () => {
  const editor = makeEditor(createEditor, '```math\nx^2 + y^2\n```');
  await wait(450);
  const preview = editor.view.dom.querySelector('.rme-code-preview');
  assert.equal(preview.hidden, false);
  assert.ok(preview.querySelector('.katex-display'));
  assert.equal(editor.view.dom.querySelector('.rme-code-lang').textContent, 'Math (TeX)');
  assert.equal(getMarkdown(editor), '```math\nx^2 + y^2\n```');
  editor.destroy();
});

test('a code block of another language has no picture', async () => {
  const editor = makeEditor(createEditor, '```js\nconst a = 1;\n```');
  await wait(350);
  assert.equal(editor.view.dom.querySelector('.rme-code-preview').hidden, true);
  editor.destroy();
});

test('a mermaid code block shows the picture that the library draws', async () => {
  const calls = [];
  window.mermaid = {
    initialize: (options) => calls.push(['initialize', options.securityLevel, options.theme]),
    render: async (id, text) => {
      calls.push(['render', text]);
      return { svg: '<svg data-test="diagram"><text>drawn</text></svg>' };
    },
  };
  try {
    const editor = makeEditor(createEditor, '```mermaid\ngraph TD\n  A --> B\n```');
    await wait(500);
    const preview = editor.view.dom.querySelector('.rme-code-preview');
    assert.equal(preview.hidden, false);
    assert.ok(preview.querySelector('svg[data-test="diagram"]'));
    assert.deepEqual(calls[0], ['initialize', 'strict', 'dark']);
    assert.deepEqual(calls[1], ['render', 'graph TD\n  A --> B']);
    assert.equal(getMarkdown(editor), '```mermaid\ngraph TD\n  A --> B\n```');

    // A change of the text draws the diagram again.
    let end;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'codeBlock') end = pos + node.nodeSize - 1;
    });
    editor.commands.insertContentAt(end, '\n  B --> C');
    await wait(500);
    assert.ok(calls.some((call) => call[0] === 'render' && call[1].includes('B --> C')));
    editor.destroy();
  } finally {
    delete window.mermaid;
  }
});

test('a mermaid error shows its message and keeps the text', async () => {
  window.mermaid = {
    initialize: () => {},
    render: async () => {
      throw new Error('Parse error on line 1\nmore details');
    },
  };
  try {
    const editor = makeEditor(createEditor, '```mermaid\nnot a diagram\n```');
    await wait(500);
    const preview = editor.view.dom.querySelector('.rme-code-preview');
    assert.equal(preview.classList.contains('is-error'), true);
    assert.equal(preview.textContent, 'Parse error on line 1');
    assert.equal(getMarkdown(editor), '```mermaid\nnot a diagram\n```');
    editor.destroy();
  } finally {
    delete window.mermaid;
  }
});

test('without the diagram library a mermaid block still shows its text and a message', async () => {
  configureDiagrams({});
  const editor = makeEditor(createEditor, '```mermaid\ngraph TD\n```');
  await wait(450);
  const preview = editor.view.dom.querySelector('.rme-code-preview');
  assert.equal(preview.classList.contains('is-error'), true);
  assert.match(preview.textContent, /not available/);
  assert.equal(getMarkdown(editor), '```mermaid\ngraph TD\n```');
  editor.destroy();
});

// ---------- Problems that the examples of the GitHub page found ----------

test('a line break tag at the end of a line makes one break, not two', () => {
  const editor = makeEditor(createEditor, 'This example<br/>\nWill span two lines');
  let breaks = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'hardBreak') breaks++;
  });
  assert.equal(breaks, 1);
  assert.equal(editor.state.doc.textContent, 'This exampleWill span two lines', 'no new line character in the text');
  assert.equal(getMarkdown(editor), 'This example  \nWill span two lines');
  editor.destroy();
});

test('a tag pair with only a space stays HTML', () => {
  const editor = makeEditor(createEditor, 'Use <sub> </sub> and <sup> </sup> and <ins> </ins> here.');
  let marks = 0;
  editor.state.doc.descendants((node) => {
    marks += node.marks.length;
  });
  assert.equal(marks, 0);
  assert.equal(getMarkdown(editor), 'Use <sub> </sub> and <sup> </sup> and <ins> </ins> here.');
  const again = makeEditor(createEditor, getMarkdown(editor));
  assert.deepEqual(again.getJSON(), editor.getJSON());
  editor.destroy();
  again.destroy();
});

test('bullet lists that follow each other stay separate lists', () => {
  const editor = makeEditor(createEditor, '- George\n* John\n+ Thomas');
  const count = (e) => {
    let n = 0;
    e.state.doc.descendants((node) => {
      if (node.type.name === 'bulletList') n++;
    });
    return n;
  };
  assert.equal(count(editor), 3);
  const written = getMarkdown(editor);
  assert.equal(written, '- George\n\n* John\n\n+ Thomas');
  const again = makeEditor(createEditor, written);
  assert.equal(count(again), 3);
  assert.equal(getMarkdown(again), written);
  editor.destroy();
  again.destroy();
});

test('one list, and lists with other text between them, keep the usual marker', () => {
  const editor = makeEditor(createEditor, '- a\n- b\n\ntext\n\n- c');
  assert.equal(getMarkdown(editor), '- a\n- b\n\ntext\n\n- c');
  editor.destroy();
});

test('numbered lists that follow each other stay separate lists', () => {
  const count = (e) => {
    let n = 0;
    e.state.doc.descendants((node) => {
      if (node.type.name === 'orderedList') n++;
    });
    return n;
  };
  const editor = makeEditor(createEditor, '1. a\n\n1) b');
  assert.equal(count(editor), 2);
  const written = getMarkdown(editor);
  assert.equal(written, '1. a\n\n1) b');
  const again = makeEditor(createEditor, written);
  assert.equal(count(again), 2);
  assert.equal(getMarkdown(again), written);

  // A change of the delimiter starts a new list even when no blank line is between the items.
  const tight = makeEditor(createEditor, '1. a\n2) b');
  assert.equal(count(tight), 2);
  assert.equal(getMarkdown(tight), '1. a\n\n2) b');

  // Three lists in a row use the delimiters in turn.
  const three = makeEditor(createEditor, '1. a\n\n1) b\n\n1. c');
  assert.equal(count(three), 3);
  assert.equal(getMarkdown(three), '1. a\n\n1) b\n\n1. c');
  for (const e of [editor, again, tight, three]) e.destroy();
});

test('one numbered list, and numbered lists with text between them, keep the usual delimiter', () => {
  const editor = makeEditor(createEditor, '1. a\n2. b\n\ntext\n\n1. c');
  assert.equal(getMarkdown(editor), '1. a\n2. b\n\ntext\n\n1. c');
  editor.destroy();
});

test('a list item without text is kept', () => {
  const editor = makeEditor(createEditor, '100.');
  const list = editor.state.doc.firstChild;
  assert.equal(list.type.name, 'orderedList');
  assert.equal(list.attrs.start, 100);
  assert.equal(list.firstChild.firstChild.type.name, 'paragraph');
  const again = makeEditor(createEditor, getMarkdown(editor));
  assert.deepEqual(again.getJSON(), editor.getJSON());
  editor.destroy();
  again.destroy();
});
