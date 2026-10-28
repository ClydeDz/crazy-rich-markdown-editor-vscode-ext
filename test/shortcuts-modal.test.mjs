// Tests of the window that lists the keyboard shortcuts.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { leakedListeners, loadModule } from './helpers.mjs';

const { createShortcutsModal } = await loadModule('webview/shortcutsModal.ts', 'shortcutsModal');
const { ABOUT } = await loadModule('webview/about.ts', 'about');

const GROUPS = [
  {
    title: 'Text',
    items: [
      { label: 'Bold', keys: ['Mod-b'] },
      { label: 'Link', keys: ['Mod-k'], note: 'Select text first' },
    ],
  },
  { title: 'Editing', items: [{ label: 'Redo', keys: ['Mod-Shift-z', 'Mod-y'] }] },
];

const created = [];
const openedLinks = [];

function makeModal(
  about = { creator: 'Ada', creatorUrl: 'https://example.com/ada', coffeeUrl: 'https://example.com/coffee' },
) {
  const modal = createShortcutsModal({ groups: GROUPS, about, openLink: (href) => openedLinks.push(href) });
  created.push(modal);
  return modal;
}

afterEach(() => {
  while (created.length) created.pop().destroy();
  openedLinks.length = 0;
  document.body.replaceChildren(document.createElement('div'));
});

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
const dialogOf = (modal) => modal.element.querySelector('.rme-modal');

test('the window is on the page and hidden until it opens', () => {
  const modal = makeModal();
  assert.ok(document.body.contains(modal.element));
  assert.equal(modal.element.hidden, true);
  assert.equal(modal.isOpen(), false);
  modal.open();
  assert.equal(modal.element.hidden, false);
  assert.equal(modal.isOpen(), true);
  modal.close();
  assert.equal(modal.element.hidden, true);
  assert.equal(modal.isOpen(), false);
});

test('the window is a dialog with a title, for a screen reader', () => {
  const dialog = dialogOf(makeModal());
  assert.equal(dialog.getAttribute('role'), 'dialog');
  assert.equal(dialog.getAttribute('aria-modal'), 'true');
  const title = dialog.querySelector('h2');
  assert.equal(title.textContent, 'Keyboard shortcuts');
  assert.equal(dialog.getAttribute('aria-labelledby'), title.id);
  assert.equal(dialog.querySelector('.rme-modal-close').getAttribute('aria-label'), 'Close');
});

test('the window lists each group and each line, with the key caps and the notes', () => {
  const modal = makeModal();
  const titles = [...modal.element.querySelectorAll('h3')].map((heading) => heading.textContent);
  assert.deepEqual(titles, ['Text', 'Editing']);

  const rows = [...modal.element.querySelectorAll('.rme-shortcut')];
  assert.equal(rows.length, 3);
  const labelOf = (row) => row.querySelector('.rme-shortcut-label').firstChild.textContent;
  assert.deepEqual(rows.map(labelOf), ['Bold', 'Link', 'Redo']);

  const caps = (row) => [...row.querySelectorAll('kbd')].map((cap) => cap.textContent);
  assert.deepEqual(caps(rows[0]), ['Ctrl', 'B']);
  assert.equal(rows[1].querySelector('.rme-shortcut-note').textContent, 'Select text first');
  assert.equal(rows[0].querySelector('.rme-shortcut-note'), null, 'a line without a note has no note');

  assert.deepEqual(caps(rows[2]), ['Ctrl', 'Shift', 'Z', 'Ctrl', 'Y']);
  assert.equal(rows[2].querySelectorAll('.rme-shortcut-way').length, 2);
  assert.deepEqual(
    [...rows[2].querySelectorAll('.rme-shortcut-or')].map((or) => or.textContent),
    ['or'],
    'the word "or" is between two ways, and only there',
  );
  assert.equal(rows[0].querySelector('.rme-shortcut-or'), null, 'one way has no "or"');
});

test('Escape closes the window, and no other handler sees the key', () => {
  const modal = makeModal();
  const seen = [];
  const spy = (event) => seen.push(event.key);
  window.addEventListener('keydown', spy);
  try {
    modal.open();
    const event = keydown(modal.element.querySelector('.rme-modal-close'), { key: 'Escape' });
    assert.equal(modal.isOpen(), false);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(seen, [], 'the key did not go on to the page');
  } finally {
    window.removeEventListener('keydown', spy);
  }
});

test('while the window is closed, it leaves every key to others', () => {
  const modal = makeModal();
  modal.open();
  modal.close();
  const event = keydown(document.body, { key: 'Escape' });
  assert.equal(event.defaultPrevented, false);
  const tab = keydown(document.body, { key: 'Tab' });
  assert.equal(tab.defaultPrevented, false);
});

test('a click on the dark layer closes the window, and a click in the window does not', () => {
  const modal = makeModal();
  modal.open();
  mousedown(dialogOf(modal));
  mousedown(dialogOf(modal).querySelector('h2'));
  mousedown(dialogOf(modal).querySelector('.rme-shortcut'));
  assert.equal(modal.isOpen(), true, 'a click inside leaves the window open');
  mousedown(modal.element);
  assert.equal(modal.isOpen(), false);
});

test('the close button closes the window', () => {
  const modal = makeModal();
  modal.open();
  modal.element.querySelector('.rme-modal-close').click();
  assert.equal(modal.isOpen(), false);
});

test('the focus goes to the close button when the window opens, and back when it closes', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  assert.ok(document.activeElement === opener);

  const modal = makeModal();
  modal.open();
  assert.ok(document.activeElement === modal.element.querySelector('.rme-modal-close'), 'the focus is in the window');
  modal.close();
  assert.ok(document.activeElement === opener, 'the focus is back on the button that opened the window');
});

test('the focus does not return to a button that left the page', () => {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();
  const modal = makeModal();
  modal.open();
  opener.remove();
  assert.doesNotThrow(() => modal.close());
  assert.equal(modal.isOpen(), false);
});

test('Tab keeps the focus inside the window', () => {
  const modal = makeModal();
  modal.open();
  const close = modal.element.querySelector('.rme-modal-close');
  const links = [...modal.element.querySelectorAll('a')];
  assert.equal(links.length, 2);
  const [creator, coffee] = links;

  // From the last item to the first.
  coffee.focus();
  let event = keydown(coffee, { key: 'Tab' });
  assert.equal(event.defaultPrevented, true);
  assert.ok(document.activeElement === close, 'Tab on the last item goes to the first');

  // From the first item to the last.
  event = keydown(close, { key: 'Tab', shiftKey: true });
  assert.equal(event.defaultPrevented, true);
  assert.ok(document.activeElement === coffee, 'Shift+Tab on the first item goes to the last');

  // In the middle, the browser moves the focus.
  creator.focus();
  event = keydown(creator, { key: 'Tab' });
  assert.equal(event.defaultPrevented, false, 'the browser does the rest');
  event = keydown(creator, { key: 'Tab', shiftKey: true });
  assert.equal(event.defaultPrevented, false);
});

test('Tab brings the focus back into the window when it is outside', () => {
  const outside = document.createElement('button');
  document.body.append(outside);
  const modal = makeModal();
  modal.open();
  outside.focus();
  const event = keydown(outside, { key: 'Tab' });
  assert.equal(event.defaultPrevented, true);
  assert.ok(document.activeElement === modal.element.querySelector('.rme-modal-close'));
  outside.focus();
  keydown(outside, { key: 'Tab', shiftKey: true });
  assert.ok(document.activeElement === modal.element.querySelectorAll('a')[1], 'Shift+Tab goes to the last item');
});

test('a click on a link asks the host to open the address, and the page does not follow the link', () => {
  const modal = makeModal();
  modal.open();
  const [creator, coffee] = modal.element.querySelectorAll('a');
  assert.equal(creator.getAttribute('href'), 'https://example.com/ada');
  assert.equal(creator.textContent, 'Ada');
  assert.equal(coffee.getAttribute('href'), 'https://example.com/coffee');
  assert.match(coffee.textContent, /Buy me a coffee/);
  assert.equal(creator.title, 'https://example.com/ada', 'the pointer over a link shows its address');
  assert.equal(coffee.title, 'https://example.com/coffee');

  const click = (anchor) => {
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    return event;
  };
  assert.equal(click(creator).defaultPrevented, true);
  assert.deepEqual(openedLinks, ['https://example.com/ada']);
  assert.equal(click(coffee).defaultPrevented, true);
  assert.deepEqual(openedLinks, ['https://example.com/ada', 'https://example.com/coffee']);
  assert.equal(modal.isOpen(), true, 'a link leaves the window open');
});

test('without an address, the creator is plain text and the coffee link is not there', () => {
  const modal = makeModal({ creator: 'Ada', creatorUrl: '', coffeeUrl: '' });
  assert.equal(modal.element.querySelectorAll('a').length, 0);
  assert.equal(modal.element.querySelector('.rme-modal-credit').textContent, 'Created by Ada');
  assert.equal(modal.element.querySelector('.rme-modal-coffee'), null);

  const onlyCoffee = makeModal({ creator: 'Ada', coffeeUrl: 'https://example.com/coffee' });
  assert.equal(onlyCoffee.element.querySelectorAll('a').length, 1);
  assert.equal(onlyCoffee.element.querySelector('.rme-modal-credit a'), null, 'the creator has no address');
});

test('the footer says who made it, and the coffee link comes after it', () => {
  const footer = makeModal().element.querySelector('footer');
  assert.equal(footer.firstElementChild.textContent, 'Created by Ada');
  assert.match(footer.lastElementChild.textContent, /Buy me a coffee/);
  assert.equal(footer.lastElementChild.classList.contains('rme-modal-coffee'), true);
});

test('the window adds one key listener while it is open, and none after it closes', () => {
  const modal = makeModal();
  const leaked = leakedListeners(document, () => {
    modal.open();
    modal.open();
    modal.close();
    modal.close();
    modal.open();
    modal.close();
  });
  assert.deepEqual(leaked, [], 'no listener stays on the page');

  const whileOpen = leakedListeners(document, () => modal.open());
  assert.equal(whileOpen.length, 1, 'one listener while the window is open');
  assert.match(whileOpen[0], /^keydown\|capture\|/);
  modal.close();
});

test('destroy takes the window and its listener off the page', () => {
  const modal = makeModal();
  const leaked = leakedListeners(document, () => {
    modal.open();
    modal.destroy();
  });
  assert.deepEqual(leaked, []);
  assert.equal(document.body.contains(modal.element), false);
});

test('opening the window again starts at the top of the list', () => {
  const modal = makeModal();
  const body = modal.element.querySelector('.rme-modal-body');
  modal.open();
  body.scrollTop = 120;
  modal.close();
  modal.open();
  assert.equal(body.scrollTop, 0);
});

test('the names and links in ABOUT are empty or a full https address, so a typo does not ship', () => {
  assert.equal(typeof ABOUT.creator, 'string');
  assert.ok(ABOUT.creator.length > 0, 'the creator has a name');
  for (const [name, value] of [
    ['creatorUrl', ABOUT.creatorUrl],
    ['coffeeUrl', ABOUT.coffeeUrl],
  ]) {
    if (value === '' || value === undefined) continue;
    const url = new URL(value);
    assert.equal(url.protocol, 'https:', `${name} uses https`);
    assert.ok(url.hostname.includes('.'), `${name} has a host name`);
  }
});

test('the window uses every class that styles.css has for it, so no part of the window is left without its style', () => {
  const css = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'webview', 'styles.css'),
    'utf8',
  );
  const wanted = new Set([...css.matchAll(/\.(rme-(?:modal|shortcut)[\w-]*)/g)].map((match) => match[1]));
  const modal = makeModal();
  const used = new Set([modal.element, ...modal.element.querySelectorAll('*')].flatMap((item) => [...item.classList]));
  assert.deepEqual(
    [...wanted].filter((name) => !used.has(name)),
    [],
    'a class of styles.css that the window does not use',
  );
  // These classes are only marks for the tests and for a theme. They have no style.
  const marks = new Set(['rme-modal-credit', 'rme-modal-coffee', 'rme-shortcut-group']);
  assert.deepEqual(
    [...used].filter((name) => !wanted.has(name) && !marks.has(name)),
    [],
    'a class of the window that styles.css does not know',
  );
});

test('the close button has an icon', () => {
  const button = makeModal().element.querySelector('.rme-modal-close');
  assert.ok(button.querySelector('svg'), 'a picture of a cross, and not an empty button');
  assert.equal(button.textContent, '');
});
