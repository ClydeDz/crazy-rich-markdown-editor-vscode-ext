// Tests of the language picker (webview/languagePicker.ts): the list that opens from the button of a code block.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leakedListeners, loadModule } from './helpers.mjs';

const { openLanguagePicker, closeLanguagePicker } = await loadModule('webview/languagePicker.ts', 'languagePicker');
const { LANGUAGE_OPTIONS } = await loadModule('webview/languages.ts', 'languages');

/** Open a picker next to a new button. It records the calls of onSelect and onClose. */
function open(current) {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  const selected = [];
  let closed = 0;
  openLanguagePicker({ anchor, current, onSelect: (language) => selected.push(language), onClose: () => closed++ });
  return {
    anchor,
    selected,
    closedCount: () => closed,
    root: () => document.querySelector('.rme-picker'),
    input: () => document.querySelector('.rme-picker-input'),
    rows: () => [...document.querySelectorAll('.rme-picker-item')],
    labels: () => [...document.querySelectorAll('.rme-picker-item .rme-picker-label')].map((label) => label.textContent),
    selectedLabel: () => document.querySelector('.rme-picker-item.is-selected .rme-picker-label')?.textContent,
    type(text) {
      const input = document.querySelector('.rme-picker-input');
      input.value = text;
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    },
    key(key) {
      const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      document.querySelector('.rme-picker-input').dispatchEvent(event);
      return event;
    },
    clean() {
      closeLanguagePicker();
      anchor.remove();
    },
  };
}

test('the picker is a labelled dialog with a search field and a list of every language', () => {
  const picker = open('');
  assert.equal(picker.root().getAttribute('role'), 'dialog');
  assert.equal(picker.root().getAttribute('aria-label'), 'Code language');
  assert.equal(picker.input().getAttribute('aria-label'), 'Search languages');
  assert.equal(picker.input().placeholder, 'Search or type a language');
  assert.equal(document.querySelector('.rme-picker-list').getAttribute('role'), 'listbox');
  assert.equal(picker.rows().length, LANGUAGE_OPTIONS.length + 1, 'plain text and every language');
  assert.equal(picker.labels()[0], 'Plain text');
  for (const row of picker.rows()) {
    assert.equal(row.getAttribute('role'), 'option');
  }
  picker.clean();
});

test('the list starts on the current language, which has a check mark and is the selected option', () => {
  const picker = open('ts');
  assert.equal(picker.selectedLabel(), 'TypeScript', 'an alias is read as the language');
  const checked = picker.rows().filter((row) => row.querySelector('.rme-picker-check').textContent === '✓');
  assert.equal(checked.length, 1);
  assert.equal(checked[0].querySelector('.rme-picker-label').textContent, 'TypeScript');
  const selected = picker.rows().filter((row) => row.getAttribute('aria-selected') === 'true');
  assert.deepEqual(selected, checked, 'only the current language is selected');
  assert.equal(selected[0].querySelector('.rme-picker-hint').textContent, 'typescript', 'the hint is the id of the language');
  picker.clean();

  const plain = open(null);
  assert.equal(plain.selectedLabel(), 'Plain text');
  assert.equal(plain.rows()[0].querySelector('.rme-picker-check').textContent, '✓');
  assert.equal(plain.rows().filter((row) => row.querySelector('.rme-picker-check').textContent === '✓').length, 1);
  assert.equal(plain.rows()[0].querySelector('.rme-picker-hint'), null, 'plain text has no hint');
  plain.clean();
});

test('the arrow keys move the selection, and go round at both ends', () => {
  const picker = open('');
  const last = picker.rows().length - 1;
  assert.equal(picker.selectedLabel(), 'Plain text');
  assert.equal(picker.key('ArrowDown').defaultPrevented, true, 'the key does not move the cursor of the field');
  assert.equal(picker.rows().indexOf(document.querySelector('.is-selected')), 1);
  picker.key('ArrowUp');
  assert.equal(picker.rows().indexOf(document.querySelector('.is-selected')), 0);
  assert.equal(picker.key('ArrowUp').defaultPrevented, true);
  assert.equal(picker.rows().indexOf(document.querySelector('.is-selected')), last, 'up from the first goes to the last');
  picker.key('ArrowDown');
  assert.equal(picker.rows().indexOf(document.querySelector('.is-selected')), 0, 'down from the last goes to the first');
  assert.equal(document.querySelectorAll('.is-selected').length, 1);
  picker.clean();
});

test('Enter picks the selected language, closes the list, and tells the owner once', () => {
  const picker = open('');
  picker.key('ArrowDown');
  const label = picker.selectedLabel();
  const event = picker.key('Enter');
  assert.equal(event.defaultPrevented, true);
  assert.equal(picker.root(), null);
  assert.equal(picker.selected.length, 1);
  assert.equal(LANGUAGE_OPTIONS.find((option) => option.label === label).id, picker.selected[0]);
  assert.equal(picker.closedCount(), 1);
  picker.clean();
});

test('Enter on Plain text picks an empty language', () => {
  const picker = open('rust');
  picker.type('plain');
  assert.equal(picker.selectedLabel(), 'Plain text');
  picker.key('Enter');
  assert.deepEqual(picker.selected, ['']);
  picker.clean();
});

test('typing filters the list by name, id and alias, and puts the selection on the first row', () => {
  const picker = open('rust');
  picker.key('ArrowDown');
  picker.key('ArrowDown');
  picker.type('script');
  const labels = picker.labels();
  assert.ok(labels.includes('TypeScript') && labels.includes('JavaScript'), labels.join());
  assert.ok(!labels.includes('Python'));
  assert.equal(picker.rows().indexOf(document.querySelector('.is-selected')), 0, 'the selection goes back to the top');
  picker.type('yml');
  assert.deepEqual(picker.labels(), ['YAML'], 'an alias finds the language, and an exact alias adds no custom row');
  picker.type('  PYTHON  ');
  assert.deepEqual(picker.labels(), ['Python'], 'spaces and capitals do not matter');
  picker.type('');
  assert.equal(picker.rows().length, LANGUAGE_OPTIONS.length + 1, 'an empty field shows everything again');
  picker.clean();
});

test('a name that is not in the list gets a row of its own, with the name as the user typed it', () => {
  const picker = open('');
  picker.type('  Terraform  ');
  assert.deepEqual(picker.labels(), ['Use “Terraform”']);
  assert.equal(picker.rows()[0].querySelector('.rme-picker-hint').textContent, 'custom');
  picker.key('Enter');
  assert.deepEqual(picker.selected, ['Terraform']);
  picker.clean();

  const partial = open('');
  partial.type('type');
  const labels = partial.labels();
  assert.ok(labels.includes('TypeScript'));
  assert.equal(labels.at(-1), 'Use “type”', 'a part of a name is not an exact match, so the custom row comes last');
  partial.clean();
});

test('a click on a row picks it, and the mouse selects the row under it', () => {
  const picker = open('');
  const row = picker.rows()[3];
  const label = row.querySelector('.rme-picker-label').textContent;
  row.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true }));
  assert.equal(picker.selectedLabel(), label, 'the row under the mouse is selected');
  const click = new window.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  picker.rows()[3].dispatchEvent(click);
  assert.equal(click.defaultPrevented, true, 'the field in the code block keeps its focus');
  assert.equal(picker.root(), null);
  assert.equal(LANGUAGE_OPTIONS.find((option) => option.label === label).id, picker.selected[0]);
  picker.clean();
});

test('Escape closes the list without a choice, and the key goes no further', () => {
  const picker = open('rust');
  let reached = false;
  const spy = () => (reached = true);
  document.addEventListener('keydown', spy);
  try {
    const event = picker.key('Escape');
    assert.equal(event.defaultPrevented, true);
    assert.equal(reached, false, 'the editor must not also see the Escape key');
  } finally {
    document.removeEventListener('keydown', spy);
  }
  assert.equal(picker.root(), null);
  assert.deepEqual(picker.selected, []);
  assert.equal(picker.closedCount(), 1);
  picker.clean();
});

test('other keys do nothing to the list', () => {
  const picker = open('');
  const event = picker.key('a');
  assert.equal(event.defaultPrevented, false);
  assert.ok(picker.root());
  picker.clean();
});

test('a click outside closes the list, and a click inside it or on the button does not', () => {
  const picker = open('');
  const mousedown = (target) => target.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  mousedown(picker.input());
  mousedown(picker.root());
  mousedown(picker.anchor);
  assert.ok(picker.root(), 'still open');
  assert.equal(picker.closedCount(), 0);
  mousedown(document.body);
  assert.equal(picker.root(), null);
  assert.equal(picker.closedCount(), 1);
  assert.deepEqual(picker.selected, [], 'closing is not a choice');
  picker.clean();
});

test('a resize or a lost window focus closes the list', () => {
  for (const type of ['resize', 'blur']) {
    const picker = open('');
    window.dispatchEvent(new window.Event(type));
    assert.equal(picker.root(), null, type);
    assert.equal(picker.closedCount(), 1, type);
    picker.clean();
  }
});

test('a closed picker no longer listens, and it tells the owner only once', () => {
  const picker = open('');
  picker.key('Escape');
  document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
  window.dispatchEvent(new window.Event('resize'));
  window.dispatchEvent(new window.Event('blur'));
  assert.equal(picker.closedCount(), 1);
  picker.clean();
});

test('a new picker closes the old one, and closeLanguagePicker closes the open one', () => {
  const first = open('');
  const second = open('');
  assert.equal(document.querySelectorAll('.rme-picker').length, 1);
  assert.equal(first.closedCount(), 1, 'the first one was told');
  assert.equal(second.closedCount(), 0);
  closeLanguagePicker();
  assert.equal(document.querySelectorAll('.rme-picker').length, 0);
  assert.equal(second.closedCount(), 1);
  closeLanguagePicker();
  assert.equal(second.closedCount(), 1, 'closing when nothing is open does nothing');
  first.clean();
  second.clean();
});

test('the list shows below the button when it fits, above when it does not, and stays on the screen', () => {
  const sizes = Object.getOwnPropertyDescriptors(window.HTMLElement.prototype);
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 300 });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 250 });
  const place = (rect) => {
    const anchor = document.createElement('button');
    anchor.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, ...rect });
    document.body.append(anchor);
    openLanguagePicker({ anchor, current: '', onSelect() {} });
    const root = document.querySelector('.rme-picker');
    const result = { top: root.style.top, left: root.style.left };
    closeLanguagePicker();
    anchor.remove();
    return result;
  };
  try {
    assert.equal(window.innerHeight, 768);
    assert.equal(window.innerWidth, 1024);
    assert.deepEqual(place({ top: 100, bottom: 120, right: 600 }), { top: '124px', left: '350px' }, 'below, and the right edge of the list is the right edge of the button');
    assert.deepEqual(place({ top: 700, bottom: 720, right: 600 }), { top: '396px', left: '350px' }, 'above the button when there is no room below');
    assert.deepEqual(place({ top: 100, bottom: 120, right: 100 }), { top: '124px', left: '8px' }, 'not past the left edge');
    assert.deepEqual(place({ top: 100, bottom: 120, right: 1200 }), { top: '124px', left: '766px' }, 'not past the right edge');
    assert.deepEqual(place({ top: 100, bottom: 460, right: 600 }), { top: '464px', left: '350px' }, 'the list fits exactly');
    assert.deepEqual(place({ top: 100, bottom: 465, right: 600 }), { top: '8px', left: '350px' }, 'one pixel too low: above, but not above the screen');
  } finally {
    for (const name of ['offsetHeight', 'offsetWidth']) {
      if (sizes[name]) Object.defineProperty(window.HTMLElement.prototype, name, sizes[name]);
      else delete window.HTMLElement.prototype[name];
    }
  }
});

test('the picker leaves no listener on the page behind when it closes, however it closes', () => {
  const ways = {
    Escape: (picker) => picker.key('Escape'),
    Enter: (picker) => picker.key('Enter'),
    'a click outside': () => document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })),
    'a resize': () => window.dispatchEvent(new window.Event('resize')),
    'a lost window focus': () => window.dispatchEvent(new window.Event('blur')),
    'a click on a row': (picker) => picker.rows()[0].dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true })),
    'closeLanguagePicker': () => closeLanguagePicker(),
  };
  for (const [name, close] of Object.entries(ways)) {
    for (const target of [document, window]) {
      let picker;
      const leaked = leakedListeners(target, () => {
        picker = open('');
        assert.ok(picker.root(), name);
        close(picker);
        assert.equal(picker.root(), null, name);
      });
      assert.deepEqual(leaked, [], `after ${name}, on the ${target === document ? 'document' : 'window'}`);
      picker.clean();
    }
  }
});
