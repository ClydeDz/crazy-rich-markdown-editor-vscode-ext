// Tests of links that point at an image file, and of turning one into a picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
const { isImageAddress, imageLinkAt, embedImageLink } = await loadModule('webview/imageLinks.ts', 'imageLinks');

const GIPHY =
  'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcW9lZDN3em80MzdkN3Ewa2Ezc2hldTVxbmZzYjJvNzUxcHp4ZnpmZSZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/R6gvnAxj2ISzJdbA63/giphy.gif';

function linkRange(editor) {
  let found;
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.isText && node.marks.some((mark) => mark.type.name === 'link')) {
      found = { from: pos, to: pos + node.nodeSize };
    }
  });
  assert.ok(found, 'the document has a link');
  return found;
}

test('isImageAddress looks at the end of the path, not at the host or the query', () => {
  assert.equal(isImageAddress(GIPHY), true, 'a Giphy media address');
  assert.equal(isImageAddress(`${GIPHY}?cid=abc`), true, 'the query comes after the extension');
  assert.equal(isImageAddress('https://example.com/photo.JPG'), true, 'the extension is not case sensitive');
  assert.equal(isImageAddress('https://example.com/a.webp'), true);
  assert.equal(isImageAddress('assets/pic.svg'), true, 'a relative path');
  assert.equal(isImageAddress('//example.com/pic.png'), true, 'a protocol-relative address');
  assert.equal(isImageAddress('data:image/png;base64,AAAA'), true);
  assert.equal(isImageAddress('https://giphy.com/gifs/cat-123'), false, 'a page that shows a GIF');
  assert.equal(isImageAddress('https://example.com/a.gif.html'), false);
  assert.equal(isImageAddress('mailto:cat.gif'), false);
  assert.equal(isImageAddress('#cat.gif'), false);
  assert.equal(isImageAddress('javascript:alert(1)'), false);
  assert.equal(isImageAddress(''), false);
});

test('the image link at the cursor is found inside the link and just after it', () => {
  const editor = makeEditor(createEditor, `see [cute cat](${GIPHY}) now`);
  const { from, to } = linkRange(editor);

  editor.commands.setTextSelection(from + 2);
  const inside = imageLinkAt(editor.state);
  assert.ok(inside, 'the cursor inside the link');
  assert.deepEqual({ from: inside.from, to: inside.to }, { from, to });
  assert.equal(inside.href, GIPHY);
  assert.equal(inside.text, 'cute cat');

  editor.commands.setTextSelection(to);
  const after = imageLinkAt(editor.state);
  assert.ok(after, 'a paste leaves the cursor after the link');
  assert.equal(after.from, from);
  assert.equal(after.href, GIPHY);

  editor.commands.setTextSelection(to + 1);
  assert.equal(imageLinkAt(editor.state), undefined, 'the cursor left the link');
  editor.destroy();
});

test('a link to a page, and a selection inside a link, are not offered', () => {
  const page = makeEditor(createEditor, 'see [the GIF](https://giphy.com/gifs/cat-123) now');
  const range = linkRange(page);
  page.commands.setTextSelection(range.to);
  assert.equal(imageLinkAt(page.state), undefined, 'a page address is not an image file');
  page.destroy();

  const selected = makeEditor(createEditor, `see [cute cat](${GIPHY}) now`);
  const selectedRange = linkRange(selected);
  selected.commands.setTextSelection(selectedRange);
  assert.equal(imageLinkAt(selected.state), undefined, 'a selection would change more than it shows');
  selected.destroy();
});

test('embedding an image link keeps the text as alt and the title, and selects the picture', () => {
  const editor = makeEditor(createEditor, `see [cute cat](${GIPHY} "On the web") now`);
  editor.commands.setTextSelection(linkRange(editor).to);
  const link = imageLinkAt(editor.state);
  assert.ok(link);
  assert.equal(embedImageLink(editor, link), true);

  assert.equal(getMarkdown(editor), `see ![cute cat](${GIPHY} "On the web") now`);
  assert.equal(editor.state.selection.node?.type.name, 'image');
  assert.equal(editor.state.selection.node?.attrs.src, GIPHY);
  assert.equal(editor.state.selection.node?.attrs.alt, 'cute cat');
  assert.equal(editor.state.selection.node?.attrs.title, 'On the web');
  editor.destroy();
});

test('a link whose text is its address becomes a picture with no alt text', () => {
  const editor = makeEditor(createEditor, `[${GIPHY}](${GIPHY})`);
  const link = imageLinkAt(editor.state);
  assert.ok(link);
  embedImageLink(editor, link);
  assert.equal(getMarkdown(editor), `![](${GIPHY})`);
  editor.destroy();
});

test('the picture and its attributes come back after the Markdown is read again', () => {
  const first = makeEditor(createEditor, `[cute cat](${GIPHY} "On the web")`);
  first.commands.setTextSelection(linkRange(first).to);
  embedImageLink(first, imageLinkAt(first.state));
  const markdown = getMarkdown(first);
  first.destroy();

  const second = makeEditor(createEditor, markdown);
  const image = second.state.doc.firstChild.firstChild;
  assert.equal(image.type.name, 'image');
  assert.equal(image.attrs.src, GIPHY);
  assert.equal(image.attrs.alt, 'cute cat');
  assert.equal(image.attrs.title, 'On the web');
  second.destroy();
});
