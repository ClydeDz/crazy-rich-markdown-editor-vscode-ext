// Tests of the table of contents: the button at the far left of the bar, and the panel with the headings.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leakedListeners, loadModule, makeEditor } from './helpers.mjs';

const { documentHeadings, headingElement, createTableOfContents, UNTITLED_HEADING } = await loadModule(
  'webview/tableOfContents.ts',
  'tableOfContents',
);
const { createEditor } = await loadModule('webview/editor.ts', 'editor');

const created = [];

function makeContents(markdown) {
  const editor = makeEditor(createEditor, markdown);
  const bar = document.createElement('div');
  bar.className = 'rme-stats';
  // The real bar has the facts and the counts before the button arrives, so the button has something to come before.
  const count = document.createElement('span');
  count.className = 'rme-stat';
  count.dataset.stat = 'lines';
  count.textContent = '1 line';
  bar.append(count);
  document.body.append(bar);
  const toc = createTableOfContents({ bar, editor });
  created.push({ toc, editor });
  return { toc, editor, bar };
}

afterEach(() => {
  while (created.length) {
    const { toc, editor } = created.pop();
    toc.destroy();
    editor.destroy();
  }
  document.body.replaceChildren();
  globalThis.__scrolledIntoView.length = 0;
});

const itemsOf = (toc) => [...toc.element.querySelectorAll('.rme-toc-item')];
const visibleItemsOf = (toc) => itemsOf(toc).filter((item) => !item.parentElement.hidden);
const emptyOf = (toc) => toc.element.querySelector('.rme-toc-empty');
const filterOf = (toc) => toc.element.querySelector('.rme-toc-filter');
const headingLabelOf = (bar) => bar.querySelector('.rme-stats-heading');
const currentOf = (toc) => itemsOf(toc).map((item) => item.getAttribute('aria-current'));
/** jsdom has no layout, so a test gives a heading the place that it would have on the page. */
const placeHeading = (element, top) => {
  element.getBoundingClientRect = () => ({ top, bottom: top + 20, left: 0, right: 0, width: 100, height: 20 });
};
const scrollPage = () => window.dispatchEvent(new window.Event('scroll'));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
const typeFilter = (toc, value) => {
  const filter = filterOf(toc);
  filter.value = value;
  filter.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const keydown = (target, init) => {
  const event = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const mousedown = (target) => {
  const event = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};

test('the button sits at the far left of the bar, with an icon and a label', () => {
  const { toc, bar } = makeContents('# Title\n');
  assert.ok(bar.firstElementChild === toc.button, 'the button is the first item of the bar');
  assert.equal(toc.button.tagName, 'BUTTON', 'a real button works with the keyboard');
  assert.equal(toc.button.type, 'button');
  assert.equal(toc.button.textContent, 'Contents');
  assert.equal(toc.button.getAttribute('aria-label'), 'Show the table of contents');
  assert.equal(toc.button.title, 'Show the table of contents');
  assert.equal(toc.button.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(toc.button.getAttribute('aria-expanded'), 'false');
  assert.equal(toc.button.getAttribute('aria-controls'), toc.element.id, 'the button names its panel');
  const icon = toc.button.querySelector('svg');
  assert.ok(icon, 'the icon is a picture in the button');
  assert.equal(icon.getAttribute('aria-hidden'), 'true', 'a screen reader reads the label, not the picture');
  assert.ok(toc.button.querySelector('.rme-stats-button-label'), 'the text has its own element for a narrow page');
});

test('the panel is on the page and hidden until the button opens it, and the button toggles it', () => {
  const { toc } = makeContents('## One\n');
  assert.ok(document.body.contains(toc.element));
  assert.equal(toc.element.hidden, true);
  assert.equal(toc.isOpen(), false);
  assert.equal(toc.element.getAttribute('role'), 'dialog');
  assert.equal(toc.element.getAttribute('aria-label'), 'Table of contents');

  toc.button.click();
  assert.equal(toc.element.hidden, false);
  assert.equal(toc.isOpen(), true);
  assert.equal(toc.button.getAttribute('aria-expanded'), 'true');
  toc.button.click();
  assert.equal(toc.element.hidden, true);
  assert.equal(toc.isOpen(), false);
  assert.equal(toc.button.getAttribute('aria-expanded'), 'false');
});

test('the panel lists the headings of the document in order, with the level of each one', () => {
  const { toc } = makeContents('# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\nText.\n');
  toc.open();
  const items = itemsOf(toc);
  assert.deepEqual(
    items.map((item) => item.textContent),
    ['One', 'Two', 'Three', 'Four', 'Five', 'Six'],
  );
  assert.deepEqual(
    items.map((item) => item.dataset.level),
    ['1', '2', '3', '4', '5', '6'],
  );
  assert.equal(emptyOf(toc).hidden, true, 'the panel has headings, so it has no message');
});

test('a heading inside a quote and a heading with marks are in the list', () => {
  const { toc } = makeContents('# **Bold** heading\n\n> ## Quoted heading\n');
  toc.open();
  assert.deepEqual(
    itemsOf(toc).map((item) => item.textContent),
    ['Bold heading', 'Quoted heading'],
  );
  assert.equal(itemsOf(toc)[0].querySelector('strong'), null, 'the list shows the words, not the markup');
});

test('a heading without text has a name in the list, so no row is blank', () => {
  const { toc, editor } = makeContents('');
  editor.commands.insertContentAt(0, { type: 'heading', attrs: { level: 2 } });
  toc.open();
  assert.deepEqual(
    itemsOf(toc).map((item) => item.textContent),
    [UNTITLED_HEADING],
  );
});

test('a document without headings says so', () => {
  const { toc } = makeContents('Just text, and a [link](https://example.com).\n');
  toc.open();
  assert.deepEqual(itemsOf(toc), []);
  assert.equal(emptyOf(toc).hidden, false);
  assert.equal(emptyOf(toc).textContent, 'No headings in this document');
});

test('the filter hides the headings that do not match, and says when none match', () => {
  const { toc } = makeContents('# Alpha\n\n## Beta\n\n## Gamma\n');
  toc.open();
  assert.equal(itemsOf(toc).length, 3);

  typeFilter(toc, 'et');
  assert.deepEqual(
    visibleItemsOf(toc).map((item) => item.textContent),
    ['Beta'],
  );

  typeFilter(toc, 'AMM');
  assert.deepEqual(
    visibleItemsOf(toc).map((item) => item.textContent),
    ['Gamma'],
    'the filter ignores capital letters',
  );

  typeFilter(toc, 'zzz');
  assert.deepEqual(visibleItemsOf(toc), []);
  assert.equal(emptyOf(toc).hidden, false);
  assert.equal(emptyOf(toc).textContent, 'No headings match');

  typeFilter(toc, '');
  assert.equal(visibleItemsOf(toc).length, 3, 'an empty filter shows every heading again');
  assert.equal(emptyOf(toc).hidden, true);
});

test('the button opens the panel on the headings, with the filter empty and focused', () => {
  const { toc } = makeContents('# Alpha\n');
  toc.open();
  const filter = filterOf(toc);
  typeFilter(toc, 'alp');
  toc.close();
  toc.open();
  assert.equal(filter.value, '', 'the filter starts empty');
  assert.deepEqual(
    visibleItemsOf(toc).map((item) => item.textContent),
    ['Alpha'],
  );
  assert.ok(document.activeElement === filter, 'the user can type a filter at once');
});

test('a click on a heading scrolls it into view and closes the panel', () => {
  const { toc } = makeContents('# First\n\n## Second\n\n### Third\n');
  toc.open();
  itemsOf(toc)[1].click();
  const scrolled = globalThis.__scrolledIntoView.at(-1);
  assert.ok(scrolled, 'the page was asked to scroll');
  assert.equal(scrolled.element.tagName, 'H2');
  assert.equal(scrolled.element.textContent, 'Second');
  assert.equal(scrolled.options.block, 'start', 'the heading goes to the top of the page');
  assert.equal(toc.isOpen(), false, 'the panel closes after the jump');
});

test('a click outside the panel closes it, and a click inside does not', () => {
  const { toc } = makeContents('# Alpha\n');
  toc.open();
  mousedown(toc.element.querySelector('.rme-toc-list'));
  mousedown(filterOf(toc));
  assert.equal(toc.isOpen(), true, 'a click inside leaves the panel open');
  mousedown(document.body);
  assert.equal(toc.isOpen(), false);
});

test('Escape closes the panel, keeps the key from the page, and gives the focus back to the button', () => {
  const { toc } = makeContents('# Alpha\n');
  const seen = [];
  const spy = (event) => seen.push(event.key);
  window.addEventListener('keydown', spy);
  try {
    toc.open();
    const event = keydown(filterOf(toc), { key: 'Escape' });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(seen, [], 'the key did not go on to the page');
    assert.equal(toc.isOpen(), false);
    assert.ok(document.activeElement === toc.button, 'the focus is back on the button');
  } finally {
    window.removeEventListener('keydown', spy);
  }
});

test('the arrow keys move the focus through the headings that the filter shows', () => {
  const { toc } = makeContents('# Alpha\n\n## Beta\n\n## Gamma\n');
  toc.open();
  const filter = filterOf(toc);

  keydown(filter, { key: 'ArrowDown' });
  assert.ok(document.activeElement === visibleItemsOf(toc)[0], 'ArrowDown goes from the filter to the first heading');
  keydown(document.activeElement, { key: 'ArrowDown' });
  assert.ok(document.activeElement === visibleItemsOf(toc)[1], 'ArrowDown goes to the next heading');
  keydown(document.activeElement, { key: 'ArrowUp' });
  assert.ok(document.activeElement === visibleItemsOf(toc)[0], 'ArrowUp goes back');
  keydown(document.activeElement, { key: 'ArrowUp' });
  assert.ok(document.activeElement === visibleItemsOf(toc)[0], 'the focus stays on the first heading');
  keydown(document.activeElement, { key: 'ArrowDown' });
  keydown(document.activeElement, { key: 'ArrowDown' });
  keydown(document.activeElement, { key: 'ArrowDown' });
  assert.ok(document.activeElement === visibleItemsOf(toc)[2], 'the focus stays on the last heading');

  typeFilter(toc, 'gam');
  keydown(filterOf(toc), { key: 'ArrowDown' });
  assert.ok(document.activeElement === visibleItemsOf(toc)[0]);
  assert.equal(document.activeElement.textContent, 'Gamma', 'the hidden headings are skipped');
});

test('the panel reads the headings again when the document changes while it is open', () => {
  const { toc, editor } = makeContents('# One\n');
  toc.open();
  assert.deepEqual(
    itemsOf(toc).map((item) => item.textContent),
    ['One'],
  );

  editor.commands.setContent('# One\n\n## Two\n', { contentType: 'markdown' });
  assert.deepEqual(
    itemsOf(toc).map((item) => item.textContent),
    ['One', 'Two'],
    'the open panel follows the document',
  );

  toc.close();
  editor.commands.setContent('## Three\n', { contentType: 'markdown' });
  toc.open();
  assert.deepEqual(
    itemsOf(toc).map((item) => item.textContent),
    ['Three'],
    'a closed panel reads the headings when it opens',
  );
});

test('the bar shows the heading of the text under it, and follows the scroll', async () => {
  const { toc, editor, bar } = makeContents('# One\n\n## Two\n\n## Three\n');
  const [one, two, three] = [...editor.view.dom.querySelectorAll('h1, h2')];
  placeHeading(one, 200);
  placeHeading(two, 400);
  placeHeading(three, 600);
  scrollPage();
  await nextFrame();
  assert.equal(
    headingLabelOf(bar).textContent,
    'One',
    'at the top of the page the first heading below the bar is in view',
  );

  placeHeading(one, 0);
  placeHeading(two, 200);
  placeHeading(three, 400);
  scrollPage();
  await nextFrame();
  assert.equal(headingLabelOf(bar).textContent, 'One', 'the first heading is at the top of the page');

  placeHeading(two, 4);
  scrollPage();
  await nextFrame();
  assert.equal(headingLabelOf(bar).textContent, 'Two', 'the second heading went under the bar');
  toc.destroy();
});

test('the heading in view is marked in the panel, and the mark follows the scroll', async () => {
  const { toc, editor } = makeContents('# One\n\n## Two\n');
  const [one, two] = [...editor.view.dom.querySelectorAll('h1, h2')];
  placeHeading(one, 0);
  placeHeading(two, 300);
  toc.open();
  assert.deepEqual(currentOf(toc), ['location', null]);

  placeHeading(two, 4);
  scrollPage();
  await nextFrame();
  assert.deepEqual(currentOf(toc), [null, 'location'], 'only one heading is current');
  assert.equal(itemsOf(toc)[1].hasAttribute('aria-current'), true, 'the panel marks the heading in view');
});

test('a document without headings has no text next to the button', () => {
  const { bar } = makeContents('Just text.\n');
  assert.equal(headingLabelOf(bar).textContent, '');
});

test('the bar reads a heading again when its text changes', () => {
  const { toc, editor, bar } = makeContents('# One\n');
  assert.equal(headingLabelOf(bar).textContent, 'One');
  editor.commands.setContent('# Updated\n', { contentType: 'markdown' });
  assert.equal(headingLabelOf(bar).textContent, 'Updated');
  toc.destroy();
});

test('headingElement finds the heading of a position, also inside a quote', () => {
  const { editor } = makeContents('# One\n\n> ## In a quote\n\n## Last\n');
  const headings = documentHeadings(editor);
  assert.deepEqual(
    headings.map((heading) => heading.level),
    [1, 2, 2],
  );
  const found = headings.map((heading) => headingElement(editor, heading.pos));
  assert.deepEqual(
    found.map((element) => element?.textContent),
    ['One', 'In a quote', 'Last'],
  );
  assert.ok(found.every((element) => element?.tagName.startsWith('H')));
});

test('destroy takes the button and the panel off the page, and removes the listeners it added', () => {
  const { toc } = makeContents('# Alpha\n');
  const leaked = leakedListeners(document, () => {
    toc.open();
    toc.open();
    toc.close();
    toc.destroy();
  });
  assert.deepEqual(leaked, [], 'no listener stays on the document');
  assert.equal(document.body.contains(toc.element), false);

  const { toc: second } = makeContents('# Beta\n');
  const leakedOnWindow = leakedListeners(window, () => {
    second.open();
    second.destroy();
  });
  assert.deepEqual(leakedOnWindow, [], 'no listener stays on the window');
  assert.equal(document.body.querySelector('[data-action="contents"]') === null, true, 'the button is off the bar');

  const { editor, bar } = makeContents('# Gamma\n');
  const leakedOnCreate = leakedListeners(window, () => {
    const third = createTableOfContents({ bar, editor });
    third.destroy();
  });
  assert.deepEqual(leakedOnCreate, [], 'the scroll listener of the bar goes away with the panel');
});

test('the panel uses every class that styles.css has for it', () => {
  const css = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'webview', 'styles.css'),
    'utf8',
  );
  const wanted = new Set([...css.matchAll(/\.(rme-toc[\w-]*)/g)].map((match) => match[1]));
  const { toc } = makeContents('# Alpha\n');
  toc.open();
  const used = new Set(
    [toc.element, ...toc.element.querySelectorAll('*')]
      .flatMap((item) => [...item.classList])
      .filter((name) => name.startsWith('rme-toc')),
  );
  assert.deepEqual(
    [...wanted].filter((name) => !used.has(name)),
    [],
    'a class of styles.css that the panel does not use',
  );
  assert.deepEqual(
    [...used].filter((name) => !wanted.has(name)),
    [],
    'a class of the panel that styles.css does not know',
  );
  assert.match(
    css,
    /\.rme-toc-item\[aria-current='location'\][^{]*\{[^}]*font-weight:\s*700/,
    'the heading in view is bold',
  );
});
