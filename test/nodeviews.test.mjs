// Tests of the contract between ProseMirror and the node views of the editor (alerts, code blocks, math, raw HTML,
// video, images). ProseMirror asks each node view three things:
//   update(node)          Can you show this node? A node of another type must be refused.
//   stopEvent(event)      Is this event yours? The fields inside a node view need their own mouse and keys.
//   ignoreMutation(change) Did you change your own page? Then the editor must not read the change as an edit.
// A wrong answer shows as a field that cannot be used, or as text that comes and goes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, makeEditor } from './helpers.mjs';

const { createEditor } = await loadModule('webview/editor.ts', 'editor');

const MARKDOWN = [
  '> [!NOTE]\n> alert text',
  '```ts\nconst x = 1;\n```',
  'Inline $x$ and <kbd>k</kbd> here.',
  '$$\ny\n$$',
  '<div>raw</div>',
  '[d]: https://example.com',
  '<video src="a.mp4" controls></video>',
  '![alt](a.png)',
].join('\n\n');

function nodeViews() {
  const editor = makeEditor(createEditor, MARKDOWN);
  const find = (selector) => {
    const dom = editor.view.dom.querySelector(selector);
    assert.ok(dom, `${selector} is on the page`);
    const desc = editor.view.docView.nearestDesc(dom);
    assert.ok(desc && desc.spec, `${selector} has a node view`);
    return { dom, desc, spec: desc.spec, type: desc.node.type.name };
  };
  const views = {
    alert: find('.rme-alert'),
    codeBlock: find('.rme-code'),
    mathInline: find('.rme-math'),
    htmlInline: find('.rme-html-inline'),
    mathBlock: find('.rme-math-block'),
    htmlBlock: find('.rme-raw[data-raw-block="htmlBlock"], .rme-raw'),
    video: find('.rme-video'),
    image: find('img:not(.ProseMirror-separator)'),
  };
  const definition = [...editor.view.dom.querySelectorAll('.rme-raw')].find((element) => editor.view.docView.nearestDesc(element).node.type.name === 'linkDefinition');
  assert.ok(definition, 'a link definition is on the page');
  views.linkDefinition = { dom: definition, desc: editor.view.docView.nearestDesc(definition), spec: editor.view.docView.nearestDesc(definition).spec, type: 'linkDefinition' };
  return { editor, views };
}

const mutation = (type, target) => ({ type, target });
const event = (target) => ({ target });

test('every node view refuses a node of another type, and accepts a node of its own type', () => {
  const { editor, views } = nodeViews();
  const paragraph = editor.schema.nodes.paragraph.create();
  for (const [name, { desc, spec }] of Object.entries(views)) {
    assert.equal(typeof spec.update, 'function', `${name} has update`);
    assert.equal(spec.update(paragraph), false, `${name} refuses a paragraph`);
    assert.equal(spec.update(desc.node), true, `${name} accepts a node of its own type`);
  }
  editor.destroy();
});

test('a node view shows the new attributes of a node that it accepts', () => {
  const { editor, views } = nodeViews();
  const copy = (view, attrs) => view.desc.node.type.create({ ...view.desc.node.attrs, ...attrs }, view.desc.node.content);

  assert.equal(views.image.spec.update(copy(views.image, { src: 'b.png', alt: 'new alt', title: 'new title' })), true);
  assert.equal(views.image.dom.alt, 'new alt');
  assert.equal(views.image.dom.title, 'new title');
  assert.ok(views.image.dom.src.endsWith('b.png'));

  assert.equal(views.alert.spec.update(copy(views.alert, { type: 'caution' })), true);
  assert.equal(views.alert.dom.getAttribute('data-alert'), 'caution');

  assert.equal(views.htmlBlock.spec.update(copy(views.htmlBlock, { raw: '<p>changed</p>' })), true);
  assert.equal(views.htmlBlock.dom.querySelector('textarea').value, '<p>changed</p>');

  assert.equal(views.video.spec.update(copy(views.video, { raw: '<video src="other.mp4" controls></video>' })), true);
  assert.ok(views.video.dom.querySelector('video').getAttribute('src').endsWith('other.mp4'));
  assert.equal(views.video.dom.querySelector('.rme-video-caption span').textContent, 'other.mp4');

  assert.equal(views.codeBlock.spec.update(copy(views.codeBlock, { language: 'python' })), true);
  assert.equal(views.codeBlock.dom.dataset.language, 'python');
  editor.destroy();
});

test('the fields inside a node view get their own events, and the rest of the node view does not', () => {
  const { views, editor } = nodeViews();
  const inside = (view, selector) => view.dom.querySelector(selector);

  assert.equal(views.alert.spec.stopEvent(event(inside(views.alert, '.rme-alert-select'))), true, 'the select in the header of an alert');
  assert.equal(views.alert.spec.stopEvent(event(inside(views.alert, '.rme-alert-header'))), true);
  assert.equal(views.alert.spec.stopEvent(event(inside(views.alert, '.rme-alert-body p'))), false, 'the text of the alert is the editor\'s');

  assert.equal(views.codeBlock.spec.stopEvent(event(inside(views.codeBlock, '.rme-code-lang'))), true, 'the language button');
  assert.equal(views.codeBlock.spec.stopEvent(event(inside(views.codeBlock, 'code'))), false, 'the code is the editor\'s');

  assert.equal(views.mathInline.spec.stopEvent(event(inside(views.mathInline, 'input'))), true);
  assert.equal(views.mathInline.spec.stopEvent(event(inside(views.mathInline, '.rme-math-view'))), false);
  assert.equal(views.mathBlock.spec.stopEvent(event(inside(views.mathBlock, 'textarea'))), true);
  assert.equal(views.mathBlock.spec.stopEvent(event(inside(views.mathBlock, '.rme-math-view'))), false);

  for (const name of ['htmlBlock', 'linkDefinition']) {
    assert.equal(views[name].spec.stopEvent(event(inside(views[name], 'textarea'))), true, `${name}: the text area`);
    assert.equal(views[name].spec.stopEvent(event(inside(views[name], '.rme-raw-label'))), false, `${name}: the label`);
  }

  assert.equal(views.video.spec.stopEvent(event(inside(views.video, 'video'))), true, 'the player needs its own events');
  assert.equal(views.video.spec.stopEvent(event(inside(views.video, '.rme-video-caption'))), false);
  editor.destroy();
});

test('a node view that fills its own page tells the editor to ignore the changes', () => {
  const { views, editor } = nodeViews();
  for (const name of ['mathInline', 'mathBlock', 'htmlBlock', 'linkDefinition', 'video']) {
    const view = views[name];
    assert.equal(view.spec.ignoreMutation(mutation('childList', view.dom)), true, `${name}: a change of the page`);
    assert.equal(view.spec.ignoreMutation(mutation('attributes', view.dom.firstElementChild)), true, `${name}: a change of an attribute`);
  }
  editor.destroy();
});

test('an alert and a code block ignore changes outside their text, and read changes in their text', () => {
  const { views, editor } = nodeViews();
  const alert = views.alert;
  const body = alert.dom.querySelector('.rme-alert-body');
  assert.equal(alert.spec.ignoreMutation(mutation('childList', alert.dom.querySelector('.rme-alert-header'))), true, 'the header is not text');
  assert.equal(alert.spec.ignoreMutation(mutation('characterData', body.querySelector('p'))), false, 'the text is read');
  assert.equal(alert.spec.ignoreMutation(mutation('childList', body)), false);
  assert.equal(alert.spec.ignoreMutation(mutation('selection', alert.dom.querySelector('.rme-alert-header'))), false, 'a selection is never ignored');

  const code = views.codeBlock;
  const codeElement = code.dom.querySelector('code');
  assert.equal(code.spec.ignoreMutation(mutation('childList', code.dom.querySelector('.rme-code-header'))), true);
  assert.equal(code.spec.ignoreMutation(mutation('childList', code.dom.querySelector('.rme-code-preview'))), true, 'the picture is not text');
  assert.equal(code.spec.ignoreMutation(mutation('characterData', codeElement)), false);
  assert.equal(code.spec.ignoreMutation(mutation('selection', code.dom.querySelector('.rme-code-header'))), false);
  editor.destroy();
});

test('a node view can be destroyed while its field is open, and then does not save', () => {
  const editor = makeEditor(createEditor, 'a $x$ b\n\n$$\ny\n$$');
  let changes = 0;
  editor.on('transaction', ({ transaction }) => {
    if (transaction.docChanged) changes++;
  });
  for (const selector of ['.rme-math', '.rme-math-block']) {
    const dom = editor.view.dom.querySelector(selector);
    const desc = editor.view.docView.nearestDesc(dom);
    desc.spec.selectNode();
    const field = dom.querySelector('input, textarea');
    field.value = 'changed by the user';
    desc.spec.destroy();
    field.dispatchEvent(new window.Event('blur'));
  }
  assert.equal(changes, 0, 'a destroyed node view does not save');
  editor.destroy();
});
