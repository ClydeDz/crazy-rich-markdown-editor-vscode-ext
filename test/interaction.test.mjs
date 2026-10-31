// Tests of what the user does with the mouse and the keyboard: paste and drop, footnotes, alerts, emoji search.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
const { createMediaInput, isMediaFile } = await loadModule('webview/mediaInput.ts', 'mediaInput');
const { escapeMarkdownText } = await loadModule('webview/markdownText.ts', 'markdownText');
const { markdownSlice } = await loadModule('webview/pasteMarkdown.ts', 'pasteMarkdown');
const { searchEmoji, EMOJI } = await loadModule('webview/emoji.ts', 'emoji');

const press = (editor, key) =>
  Boolean(
    editor.view.someProp('handleKeyDown', (handler) =>
      handler(editor.view, new window.KeyboardEvent('keydown', { key, cancelable: true })),
    ),
  );

function positionOf(editor, text) {
  let found;
  editor.state.doc.descendants((node, pos) => {
    if (found === undefined && node.isText && node.text.includes(text)) found = pos + node.text.indexOf(text);
  });
  return found;
}

const namesOf = (editor) => {
  const names = [];
  editor.state.doc.descendants((node) => {
    names.push(node.type.name);
  });
  return names;
};

// ---------- Paste of Markdown source ----------

/** A paste of the clipboard, as the editor reads it. The event carries both flavours of the clipboard. */
function pasteClipboard(editor, { text = '', html = '' }) {
  const data = {
    getData: (type) => (type === 'text/plain' ? text : type === 'text/html' ? html : ''),
    types: html ? ['text/html', 'text/plain'] : ['text/plain'],
    files: [],
  };
  const event = new window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: data });
  editor.view.dom.dispatchEvent(event);
  return event;
}

const imagesIn = (editor) => {
  const found = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') found.push(node);
  });
  return found;
};

test('a paste of Markdown source shows it formatted', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.focus('end');
  const event = pasteClipboard(editor, { text: '# big reveal' });
  assert.equal(event.defaultPrevented, true, 'the editor takes the paste');
  const [first] = editor.getJSON().content;
  assert.equal(first.type, 'heading');
  assert.equal(first.attrs.level, 1, 'the pasted heading is a heading of level 1');
  assert.equal(first.content[0].text, 'big reveal');
  assert.equal(getMarkdown(editor), '# big reveal', 'the file holds the Markdown that was pasted');
  editor.destroy();
});

test('a pasted code block of Markdown is read as Markdown in an MDX file too', () => {
  const editor = makeEditor(createEditor, '', { mdx: true });
  editor.commands.focus('end');
  pasteClipboard(editor, {
    text: '# big reveal',
    html: '<pre><code class="language-markdown"># big reveal</code></pre>',
  });
  assert.equal(editor.getJSON().content[0].type, 'heading', 'the Markdown shows as a heading');
  assert.equal(namesOf(editor).includes('codeBlock'), false, 'no code block holds the Markdown');
  editor.destroy();
});

test('a paste of a badge shows the badge and not a code block', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.focus('end');
  pasteClipboard(editor, { text: '[![build](https://img.shields.io/badge/build-passing)](https://example.com)' });
  const badges = imagesIn(editor);
  assert.equal(badges.length, 1, 'the badge is a picture');
  assert.equal(badges[0].attrs.src, 'https://img.shields.io/badge/build-passing');
  assert.equal(namesOf(editor).includes('codeBlock'), false, 'no code block holds the badge');
  editor.destroy();
});

test('a pasted code block of Markdown is read as Markdown', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.focus('end');
  pasteClipboard(editor, {
    text: '# big reveal',
    html: '<p></p><div><pre><code class="language-markdown"># big reveal</code></pre></div><p></p>',
  });
  const [first] = editor.getJSON().content;
  assert.equal(first.type, 'heading', 'the Markdown shows as a heading');
  assert.equal(namesOf(editor).includes('codeBlock'), false, 'no code block holds the Markdown');
  assert.equal(getMarkdown(editor), '# big reveal');
  editor.destroy();
});

test('a pasted code block of another language stays a code block', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.focus('end');
  pasteClipboard(editor, { text: 'print(1)', html: '<pre><code class="language-python">print(1)</code></pre>' });
  const [first] = editor.getJSON().content;
  assert.equal(first.type, 'codeBlock');
  assert.equal(first.attrs.language, 'python');
  assert.equal(getMarkdown(editor), '```python\nprint(1)\n```');
  editor.destroy();
});

test('a pasted fence of another language becomes a code block in that language', () => {
  const editor = makeEditor(createEditor, '');
  editor.commands.focus('end');
  pasteClipboard(editor, { text: '```python\nprint(1)\n```' });
  const [first] = editor.getJSON().content;
  assert.equal(first.type, 'codeBlock');
  assert.equal(first.attrs.language, 'python');
  editor.destroy();
});

test('a paste inside a code block stays text', () => {
  const code = 'const x = 1;';
  const editor = makeEditor(createEditor, `\`\`\`js\n${code}\n\`\`\``);
  editor.commands.setTextSelection(positionOf(editor, code) + code.length);
  pasteClipboard(editor, { text: '# not a heading' });
  const [first] = editor.getJSON().content;
  assert.equal(first.type, 'codeBlock');
  assert.equal(first.attrs.language, 'js');
  assert.equal(first.content[0].text, `${code}# not a heading`, 'the code keeps the text as it is');
  assert.equal(namesOf(editor).includes('heading'), false, 'the text is not read as Markdown');
  editor.destroy();
});

test('a paste of files is left to the media handler', () => {
  const editor = makeEditor(createEditor, 'Some text here.');
  const plugin = editor.state.plugins.find(
    (candidate) => candidate.props.handlePaste && String(candidate.key).startsWith('rmePasteMarkdown'),
  );
  assert.ok(plugin, 'the editor has the plugin for Markdown paste');
  // A paste of files has no text on the clipboard, so this one carries files only.
  const event = {
    clipboardData: { files: [new window.File(['x'], 'a.png', { type: 'image/png' })] },
    preventDefault() {
      throw new Error('the paste must not be taken');
    },
  };
  assert.equal(plugin.props.handlePaste(editor.view, event), false);
  editor.destroy();
});

test('a paste into a raw text box is not read as Markdown', () => {
  const editor = makeEditor(createEditor, 'Some text here.');
  const plugin = editor.state.plugins.find(
    (candidate) => candidate.props.handlePaste && String(candidate.key).startsWith('rmePasteMarkdown'),
  );
  assert.ok(plugin, 'the editor has the plugin for Markdown paste');
  // The box of a raw block, an MDX box or the front matter holds its own text.
  const event = {
    target: document.createElement('textarea'),
    clipboardData: { files: [], getData: (type) => (type === 'text/plain' ? '# nope' : '') },
    preventDefault() {
      throw new Error('the paste must not be taken');
    },
  };
  assert.equal(plugin.props.handlePaste(editor.view, event), false);
  editor.destroy();
});

test('one paragraph of pasted Markdown joins the line, and a block lands beside it', () => {
  const editor = makeEditor(createEditor, 'Some text.');
  const { schema } = editor.state;
  const manager = editor.markdown;
  assert.equal(markdownSlice(manager.parse('a word'), schema).openStart, 1, 'a paragraph joins the line');
  assert.equal(markdownSlice(manager.parse('# title'), schema).openStart, 0, 'a heading lands as a block');
  assert.equal(
    markdownSlice(manager.parse('```js\nconst x = 1;\n```'), schema).openStart,
    0,
    'a code block lands as a block',
  );
  editor.destroy();
});

test('Markdown that holds no block gives no slice, so the paste is not taken', () => {
  const editor = makeEditor(createEditor, 'Some text.');
  assert.equal(markdownSlice({ type: 'doc', content: [] }, editor.state.schema), null);
  editor.destroy();
});

// ---------- Paste and drop of images and videos ----------

const file = (name, type) => new window.File(['x'], name, { type });

test('isMediaFile looks at the file type, and at the extension when the type is empty', () => {
  assert.equal(isMediaFile({ name: 'a', type: 'image/png' }), true);
  assert.equal(isMediaFile({ name: 'a', type: 'IMAGE/JPEG' }), true);
  assert.equal(isMediaFile({ name: 'a', type: 'video/quicktime' }), true);
  for (const name of [
    'a.png',
    'a.JPG',
    'a.jpeg',
    'a.gif',
    'a.svg',
    'a.webp',
    'a.avif',
    'a.bmp',
    'a.mp4',
    'a.MOV',
    'a.webm',
    'a.m4v',
    'a.ogv',
  ]) {
    assert.equal(isMediaFile({ name, type: '' }), true, name);
  }
  assert.equal(isMediaFile({ name: 'notes.txt', type: 'text/plain' }), false);
  assert.equal(isMediaFile({ name: 'a.png.txt', type: '' }), false);
  assert.equal(isMediaFile({ name: 'png', type: '' }), false);
  assert.equal(isMediaFile({ name: 'a.pdf', type: 'application/pdf' }), false);
  assert.equal(
    isMediaFile({ name: 'a', type: 'application/image' }),
    false,
    'the type must start with image/ or video/',
  );
});

function mediaEditor() {
  const received = [];
  const editor = makeEditor(createEditor, 'Some text here.', {
    extensions: [createMediaInput({ onFiles: (files) => received.push(files.map((item) => item.name)) })],
  });
  // The plugin of this feature on its own. The other plugins of the editor also read a paste and a drop.
  const plugin = editor.state.plugins.find(
    (candidate) => candidate.props.handlePaste && String(candidate.key).startsWith('rmeMediaInput'),
  );
  assert.ok(plugin, 'the editor has the plugin for media');
  return {
    editor,
    received,
    paste: (event) => Boolean(plugin.props.handlePaste(editor.view, event)),
    drop: (event) => Boolean(plugin.props.handleDrop(editor.view, event)),
  };
}

function pasteEvent(files) {
  return {
    clipboardData: { files },
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

test('a paste of images and videos goes to the host, and the editor does not paste it', () => {
  const { editor, received, paste } = mediaEditor();
  const event = pasteEvent([file('a.png', 'image/png'), file('b.mp4', 'video/mp4')]);
  assert.equal(paste(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(received, [['a.png', 'b.mp4']]);
  editor.destroy();
});

test('a paste with other files too sends only the images and videos', () => {
  const { editor, received, paste } = mediaEditor();
  paste(pasteEvent([file('notes.txt', 'text/plain'), file('a.gif', 'image/gif')]));
  assert.deepEqual(received, [['a.gif']]);
  editor.destroy();
});

test('a paste without a media file is left to the editor', () => {
  const { editor, received, paste } = mediaEditor();
  for (const files of [[], [file('notes.txt', 'text/plain')], undefined]) {
    const event =
      files === undefined
        ? {
            clipboardData: null,
            preventDefault() {
              throw new Error('must not prevent');
            },
          }
        : pasteEvent(files);
    assert.equal(paste(event), false);
    assert.equal(event.defaultPrevented ?? false, false);
  }
  assert.deepEqual(received, []);
  editor.destroy();
});

test('a drop of media goes to the host, and the cursor moves to the place of the drop', () => {
  const { editor, received, drop } = mediaEditor();
  editor.view.posAtCoords = () => ({ pos: 6, inside: -1 });
  editor.commands.setTextSelection(1);
  const event = {
    dataTransfer: { files: [file('a.png', 'image/png'), file('x.txt', 'text/plain')] },
    clientX: 5,
    clientY: 5,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  assert.equal(drop(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(received, [['a.png']]);
  assert.equal(editor.state.selection.from, 6, 'the cursor is at the place of the drop');
  editor.destroy();
});

test('a drop outside the text still goes to the host, and a drop without media is left to the editor', () => {
  const { editor, received, drop: handleDrop } = mediaEditor();
  editor.view.posAtCoords = () => null;
  editor.commands.setTextSelection(3);
  const drop = (files) => {
    const event = {
      dataTransfer: { files },
      clientX: 0,
      clientY: 0,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    return { handled: handleDrop(event), event };
  };
  const media = drop([file('b.webm', 'video/webm')]);
  assert.equal(media.handled, true);
  assert.deepEqual(received, [['b.webm']]);
  assert.equal(editor.state.selection.from, 3, 'no place, so the cursor stays');

  const other = drop([file('x.txt', 'text/plain')]);
  assert.equal(other.handled, false);
  assert.equal(other.event.defaultPrevented, false);
  const empty = drop([]);
  assert.equal(empty.handled, false);
  assert.deepEqual(received, [['b.webm']]);
  editor.destroy();
});

// ---------- Footnote marks in text ----------

test('escapeMarkdownText keeps the brackets of a footnote label and escapes other brackets', () => {
  assert.equal(escapeMarkdownText('see [^note] here', false), 'see [^note] here');
  assert.equal(escapeMarkdownText('see [^1] here', false), 'see [^1] here');
  assert.equal(escapeMarkdownText('[^a][^bc]', false), '[^a][^bc]', 'two labels next to each other');
  assert.equal(escapeMarkdownText('[^note]: text', true), '[^note]: text');
  // The text has a link, so its brackets need an escape. The brackets of the labels do not.
  assert.equal(escapeMarkdownText('see [^note] and [x](y)', false), 'see [^note] and \\[x\\](y)');
  assert.equal(escapeMarkdownText('[x](y) and [^1] and [^long-label]', false), '\\[x\\](y) and [^1] and [^long-label]');
  assert.equal(escapeMarkdownText('[^ not a label](u)', false), '\\[^ not a label\\](u)', 'a label has no space');
  assert.equal(escapeMarkdownText('[^](u)', false), '\\[^\\](u)', 'a label is not empty');
});

// ---------- Footnote commands and clicks ----------

test('a footnote definition with no text gets an empty paragraph', () => {
  const editor = makeEditor(createEditor, 'Text[^1]\n\n[^1]:');
  const definition = editor.getJSON().content.find((node) => node.type === 'footnoteDefinition');
  assert.deepEqual(
    definition.content.map((node) => node.type),
    ['paragraph'],
  );
  editor.destroy();
});

test('insertFootnote takes the first free number, and puts the cursor in the new note', () => {
  const editor = makeEditor(createEditor, 'One[^1] two[^3].\n\n[^1]: First.\n\n[^3]: Third.\n\nEnd');
  editor.commands.setTextSelection(positionOf(editor, 'End') + 3);
  editor.commands.insertFootnote();
  const ids = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteRef' || node.type.name === 'footnoteDefinition')
      ids.push(`${node.type.name}:${node.attrs.id}`);
  });
  assert.deepEqual(
    ids,
    [
      'footnoteRef:1',
      'footnoteRef:3',
      'footnoteDefinition:1',
      'footnoteDefinition:3',
      'footnoteRef:2',
      'footnoteDefinition:2',
    ],
    'the number 2 is free',
  );
  const { $from } = editor.state.selection;
  assert.equal($from.node(1).type.name, 'footnoteDefinition');
  assert.equal($from.node(1).attrs.id, '2', 'the cursor is in the new note');
  assert.equal($from.parent.type.name, 'paragraph');
  editor.destroy();

  const first = makeEditor(createEditor, 'Text');
  first.commands.focus('end');
  first.commands.insertFootnote();
  const numbers = [];
  first.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteRef') numbers.push(node.attrs.id);
  });
  assert.deepEqual(numbers, ['1']);
  assert.equal(getMarkdown(first), 'Text[^1]\n\n[^1]:');
  first.destroy();
});

test('insertFootnote scrolls the new note into view', () => {
  const editor = makeEditor(createEditor, 'Text');
  editor.commands.focus('end');
  let scrolled = false;
  editor.on('transaction', ({ transaction }) => {
    if (transaction.scrolledIntoView) scrolled = true;
  });
  editor.commands.insertFootnote();
  assert.equal(scrolled, true, 'the page scrolls to the cursor, which is in the new note');
  editor.destroy();
});

test('the footnote mark does not take the bold or italic of the text before it', () => {
  const editor = makeEditor(createEditor, '**bold text**');
  editor.commands.focus('end');
  editor.commands.insertFootnote();
  let ref;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'footnoteRef') ref = node;
  });
  assert.equal(ref.marks.length, 0);
  editor.destroy();
});

test('Ctrl or Cmd plus a click on a footnote mark scrolls to its note, and a plain click does nothing', () => {
  const editor = makeEditor(createEditor, 'Text[^a] and more[^zz].\n\n[^a]: Note A.');
  let ref;
  let at;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteRef' && node.attrs.id === 'a') {
      ref = node;
      at = pos;
    }
  });
  const click = (node, pos, init) =>
    Boolean(
      editor.view.someProp('handleClickOn', (handler) =>
        handler(editor.view, pos, node, pos, new window.MouseEvent('click', init), true),
      ),
    );
  globalThis.__scrolledIntoView.length = 0;

  assert.equal(click(ref, at, {}), false, 'a plain click');
  assert.equal(globalThis.__scrolledIntoView.length, 0);

  assert.equal(click(ref, at, { metaKey: true }), true, 'Cmd+click');
  assert.equal(globalThis.__scrolledIntoView.length, 1);
  const scrolled = globalThis.__scrolledIntoView[0];
  assert.equal(scrolled.element.getAttribute('data-n'), '1');
  assert.ok(
    scrolled.element.classList.contains('rme-fn-def') ||
      scrolled.element.dataset.footnoteDefinition !== undefined ||
      scrolled.element.textContent.includes('Note A.'),
    'it scrolls to the note',
  );
  assert.deepEqual(scrolled.options, { block: 'center', behavior: 'smooth' });

  assert.equal(click(ref, at, { ctrlKey: true }), true, 'Ctrl+click');
  assert.equal(globalThis.__scrolledIntoView.length, 2);

  let lost;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteRef' && node.attrs.id === 'zz') lost = { node, pos };
  });
  assert.equal(click(lost.node, lost.pos, { metaKey: true }), false, 'a mark without a note has nothing to scroll to');
  assert.equal(globalThis.__scrolledIntoView.length, 2);

  const text = editor.state.doc.firstChild.firstChild;
  assert.equal(click(text, 1, { metaKey: true }), false, 'a click on text is not a click on a mark');
  editor.destroy();
});

// ---------- Alerts ----------

test('Backspace at the start of an alert takes the first block out of the alert', () => {
  const editor = makeEditor(createEditor, '> [!NOTE]\n> First\n>\n> Second');
  editor.commands.setTextSelection(positionOf(editor, 'First'));
  assert.equal(press(editor, 'Backspace'), true);
  assert.equal(getMarkdown(editor), 'First\n\n> [!NOTE]\n> Second');
  editor.destroy();
});

test('Backspace does not take anything out of an alert in the other cases', () => {
  const source = '> [!NOTE]\n> First\n>\n> Second';
  const cases = {
    'in the middle of a word': (editor) => editor.commands.setTextSelection(positionOf(editor, 'First') + 2),
    'at the start of the second block': (editor) => editor.commands.setTextSelection(positionOf(editor, 'Second')),
    'with a selection': (editor) =>
      editor.commands.setTextSelection({ from: positionOf(editor, 'First'), to: positionOf(editor, 'First') + 3 }),
  };
  for (const [name, place] of Object.entries(cases)) {
    const editor = makeEditor(createEditor, source);
    place(editor);
    press(editor, 'Backspace');
    const alerts = editor.getJSON().content.filter((node) => node.type === 'alert');
    assert.equal(alerts.length, 1, `${name}: the alert is still there`);
    assert.ok(getMarkdown(editor).startsWith('> [!NOTE]'), name);
    editor.destroy();
  }
});

test('the alert has a header with an icon and a select of the five types, and a body for the blocks', () => {
  const editor = makeEditor(createEditor, '> [!TIP]\n> Text');
  const alert = editor.view.dom.querySelector('.rme-alert');
  assert.equal(alert.className, 'rme-alert rme-alert-tip');
  assert.equal(alert.getAttribute('data-alert'), 'tip');
  const header = alert.querySelector('.rme-alert-header');
  assert.equal(header.contentEditable, 'false');
  assert.ok(header.querySelector('.rme-alert-icon svg'), 'an icon');
  const select = header.querySelector('select');
  assert.equal(select.getAttribute('aria-label'), 'Alert type');
  assert.equal(select.value, 'tip');
  assert.deepEqual(
    [...select.options].map((option) => [option.value, option.textContent]),
    [
      ['note', 'Note'],
      ['tip', 'Tip'],
      ['important', 'Important'],
      ['warning', 'Warning'],
      ['caution', 'Caution'],
    ],
  );
  const body = alert.querySelector('.rme-alert-body');
  assert.equal(body.querySelector('p').textContent, 'Text', 'the blocks are in the body');
  editor.destroy();
});

test('a change of the alert type updates the same element: the icon, the class and the select', () => {
  const editor = makeEditor(createEditor, '> [!NOTE]\n> Text');
  const before = editor.view.dom.querySelector('.rme-alert');
  const noteIcon = before.querySelector('.rme-alert-icon').innerHTML;
  editor.commands.setTextSelection(3);
  editor.commands.setAlert('warning');
  const after = editor.view.dom.querySelector('.rme-alert');
  assert.ok(after === before, 'the element is not made again');
  assert.equal(after.className, 'rme-alert rme-alert-warning');
  assert.equal(after.getAttribute('data-alert'), 'warning');
  assert.equal(after.querySelector('select').value, 'warning');
  assert.notEqual(after.querySelector('.rme-alert-icon').innerHTML, noteIcon, 'another icon');
  editor.destroy();
});

test('an unknown alert type is shown as a note', () => {
  const editor = makeEditor(createEditor, '> [!NOTE]\n> Text');
  editor.commands.setTextSelection(3);
  editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { type: 'nonsense' }));
  assert.equal(editor.view.dom.querySelector('.rme-alert').className, 'rme-alert rme-alert-note');
  editor.destroy();
});

// ---------- Emoji search ----------

test('searchEmoji needs two letters, ignores capitals, and puts the codes that start with the text first', () => {
  assert.deepEqual(searchEmoji('s'), []);
  assert.deepEqual(searchEmoji(''), []);
  const found = searchEmoji('SMI', 200);
  assert.ok(found.length > 8);
  const startsWith = found.map((match) => match.name.startsWith('smi'));
  const firstOther = startsWith.indexOf(false);
  assert.ok(firstOther > 0, 'some codes start with the text, and some only contain it');
  assert.ok(
    startsWith.slice(0, firstOther).every(Boolean) && startsWith.slice(firstOther).every((value) => !value),
    'all that start with it come first',
  );
  assert.ok(
    found.slice(firstOther).every((match) => match.name.includes('smi')),
    'the others contain the text',
  );
  assert.ok(found.some((match) => match.name === 'smile'));
  assert.equal(new Set(found.map((match) => match.name)).size, found.length, 'no code twice');
});

test('searchEmoji gives at most eight matches, or the limit that the caller asks for', () => {
  assert.equal(searchEmoji('sm').length, 8);
  assert.equal(searchEmoji('sm', 3).length, 3);
  assert.equal(searchEmoji('sm', 1000).length > 8, true);
  assert.deepEqual(searchEmoji('zzzzqq'), []);
});

test('searchEmoji finds a code by a part in the middle, and gives the emoji for each match', () => {
  const found = searchEmoji('ile', 500);
  const smile = found.find((match) => match.name === 'smile');
  assert.ok(smile, 'smile contains ile');
  assert.equal(smile.emoji, EMOJI.find((entry) => entry.names.includes('smile')).emoji);
  assert.ok(found.every((match) => match.name.includes('ile')));
});

// ---------- The custom nodes keep their settings ----------

test('the custom nodes are atoms or selectable as designed', () => {
  const editor = makeEditor(createEditor, 'x');
  const spec = (name) => editor.schema.nodes[name].spec;
  for (const name of ['emoji', 'footnoteRef', 'mathInline', 'htmlInline']) {
    assert.equal(spec(name).inline, true, `${name} is inline`);
    assert.equal(spec(name).atom, true, `${name} is an atom: the cursor cannot go inside`);
  }
  for (const name of ['mathBlock', 'htmlBlock', 'linkDefinition', 'video']) {
    assert.equal(spec(name).atom, true, `${name} is an atom`);
  }
  assert.equal(spec('footnoteDefinition').defining, true, 'a note keeps its type when its content is replaced');
  assert.equal(spec('footnoteDefinition').group, 'block');
  for (const name of ['htmlInline', 'htmlBlock', 'video', 'mathInline', 'mathBlock']) {
    assert.equal(spec(name).selectable, true, `${name} can be selected`);
  }
  editor.destroy();
});
