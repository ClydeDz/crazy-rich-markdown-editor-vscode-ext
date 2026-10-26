import { LANGUAGE_OPTIONS, canonicalLanguage } from './languages';

interface PickerItem {
  /** The value to store. An empty string means plain text. */
  value: string;
  label: string;
  hint?: string;
}

export interface LanguagePickerOptions {
  /** The button that opens the picker. The list shows next to it. */
  anchor: HTMLElement;
  /** The language that the block has now. */
  current: string | null | undefined;
  onSelect: (language: string) => void;
  onClose?: () => void;
}

let close: (() => void) | undefined;

/** Close the open picker, if there is one. */
export function closeLanguagePicker(): void {
  close?.();
}

/** Show a list with a filter field. Pick a language, or type a name that is not in the list. */
export function openLanguagePicker(options: LanguagePickerOptions): void {
  closeLanguagePicker();

  const current = canonicalLanguage(options.current);

  const root = document.createElement('div');
  root.className = 'rme-picker';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Code language');

  const input = document.createElement('input');
  input.className = 'rme-picker-input';
  input.type = 'text';
  input.placeholder = 'Search or type a language';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Search languages');

  const list = document.createElement('div');
  list.className = 'rme-picker-list';
  list.setAttribute('role', 'listbox');

  root.append(input, list);
  document.body.append(root);

  let items: PickerItem[] = [];
  let selected = 0;

  const itemsFor = (query: string): PickerItem[] => {
    const q = query.trim().toLowerCase();
    const result: PickerItem[] = [];
    if (!q || 'plain text'.includes(q) || 'text'.includes(q)) {
      result.push({ value: '', label: 'Plain text' });
    }
    for (const option of LANGUAGE_OPTIONS) {
      const haystack = [option.label, option.id, ...(option.aliases ?? [])].join(' ').toLowerCase();
      if (!q || haystack.includes(q)) {
        result.push({ value: option.id, label: option.label, hint: option.id });
      }
    }
    const exact = LANGUAGE_OPTIONS.some(
      (option) => option.id === q || option.label.toLowerCase() === q || option.aliases?.includes(q),
    );
    if (q && !exact) {
      const typed = query.trim();
      result.push({ value: typed, label: `Use “${typed}”`, hint: 'custom' });
    }
    return result;
  };

  const place = (): void => {
    const rect = options.anchor.getBoundingClientRect();
    const gap = 4;
    const height = root.offsetHeight;
    const below = rect.bottom + gap;
    const top = below + height <= window.innerHeight ? below : Math.max(8, rect.top - gap - height);
    const left = Math.max(8, Math.min(rect.right - root.offsetWidth, window.innerWidth - root.offsetWidth - 8));
    root.style.top = `${top}px`;
    root.style.left = `${left}px`;
  };

  const choose = (index: number): void => {
    const item = items[index];
    if (!item) {
      return;
    }
    shutDown();
    options.onSelect(item.value);
  };

  const draw = (): void => {
    list.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'rme-picker-empty';
      empty.textContent = 'No matches';
      list.append(empty);
      return;
    }
    items.forEach((item, index) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'rme-picker-item';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === selected));
      if (index === selected) {
        row.classList.add('is-selected');
      }
      const check = document.createElement('span');
      check.className = 'rme-picker-check';
      const isCurrent = item.value.toLowerCase() === current || (item.value === '' && current === '');
      check.textContent = isCurrent ? '✓' : '';
      const label = document.createElement('span');
      label.className = 'rme-picker-label';
      label.textContent = item.label;
      row.append(check, label);
      if (item.hint) {
        const hint = document.createElement('span');
        hint.className = 'rme-picker-hint';
        hint.textContent = item.hint;
        row.append(hint);
      }
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(index);
      });
      row.addEventListener('mousemove', () => {
        if (selected !== index) {
          selected = index;
          draw();
        }
      });
      list.append(row);
    });
    list.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  };

  const refresh = (): void => {
    items = itemsFor(input.value);
    selected = Math.min(selected, Math.max(items.length - 1, 0));
    draw();
  };

  const onOutside = (event: MouseEvent): void => {
    if (!root.contains(event.target as Node) && !options.anchor.contains(event.target as Node)) {
      shutDown();
    }
  };
  const onResize = (): void => shutDown();

  function shutDown(): void {
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onResize);
    root.remove();
    close = undefined;
    options.onClose?.();
  }
  close = shutDown;

  input.addEventListener('input', () => {
    selected = 0;
    refresh();
  });
  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selected = items.length > 0 ? (selected + 1) % items.length : 0;
        draw();
        break;
      case 'ArrowUp':
        event.preventDefault();
        selected = items.length > 0 ? (selected - 1 + items.length) % items.length : 0;
        draw();
        break;
      case 'Enter':
        event.preventDefault();
        choose(selected);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        shutDown();
        break;
    }
  });

  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('blur', onResize);

  // Start on the language that the block has now.
  items = itemsFor('');
  selected = Math.max(
    0,
    items.findIndex((item) => item.value.toLowerCase() === current),
  );
  draw();
  place();
  input.focus();
}
