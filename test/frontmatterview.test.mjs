// Tests of the front matter panel: YAML colors behind the field, and the trash button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';

const { highlightYaml, enhanceFrontMatter } = await loadModule('webview/frontMatterView.ts', 'frontMatterView');

function panel() {
  document.body.innerHTML =
    '<details id="fm" class="rme-frontmatter"><summary>Front matter</summary><textarea id="fm-input"></textarea></details>';
  return { details: document.getElementById('fm'), input: document.getElementById('fm-input') };
}

test('YAML gets the colors of the code block: keys, strings, numbers, comments and list marks', () => {
  const target = document.createElement('code');
  highlightYaml(target, 'title: Hello\ncount: 3\n# note\ntags:\n  - a');
  const classes = (name) => [...target.querySelectorAll(`.${name}`)].map((node) => node.textContent);
  assert.deepEqual(classes('hljs-attr'), ['title:', 'count:', 'tags:']);
  assert.ok(classes('hljs-string').includes('Hello'));
  assert.ok(classes('hljs-comment')[0].startsWith('# note'));
  assert.ok(classes('hljs-bullet').length === 1);
  assert.ok(target.textContent.startsWith('title: Hello\ncount: 3'), 'the text is the same text');
});

test('the colored copy has the same text as the field, and a last empty line keeps its height', () => {
  const target = document.createElement('code');
  highlightYaml(target, 'a: 1\n');
  assert.equal(target.textContent, 'a: 1\n\n');
  highlightYaml(target, '');
  assert.equal(target.textContent, '\n');
});

test('text with HTML in it stays text', () => {
  const target = document.createElement('code');
  highlightYaml(target, 'x: <img src=x onerror=alert(1)>');
  assert.equal(target.querySelector('img'), null);
  assert.ok(target.textContent.includes('<img'));
});

test('the panel draws the colors behind the field and keeps them in step with the text', () => {
  const { details, input } = panel();
  input.value = 'a: 1';
  enhanceFrontMatter(details, input, { onDelete() {} });
  const colors = details.querySelector('.rme-frontmatter-colors code');
  assert.ok(colors, 'the colored copy exists');
  assert.equal(colors.parentElement.getAttribute('aria-hidden'), 'true', 'a reader of the screen skips it');
  assert.ok(details.querySelector('.rme-frontmatter-field').contains(input), 'the field is still in the panel');
  assert.ok(colors.textContent.startsWith('a: 1'));
  input.value = 'b: 2';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.ok(colors.textContent.startsWith('b: 2'));
});

test('the trash button is in the summary, so that a closed panel has it too', () => {
  const { details, input } = panel();
  enhanceFrontMatter(details, input, { onDelete() {} });
  const trash = details.querySelector('.rme-frontmatter-trash');
  assert.ok(details.querySelector('summary').contains(trash));
  assert.equal(trash.getAttribute('aria-label'), 'Delete the front matter');
});

test('a click on the trash button deletes the front matter and does not open or close the panel', () => {
  const { details, input } = panel();
  let deleted = 0;
  enhanceFrontMatter(details, input, { onDelete: () => deleted++ });
  const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  details.querySelector('.rme-frontmatter-trash').dispatchEvent(click);
  assert.equal(deleted, 1);
  assert.equal(click.defaultPrevented, true, 'the browser does not toggle the panel');
});
