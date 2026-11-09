import type { Editor } from '@tiptap/core';
import { icons } from './icons';

/** A heading of the document, as the table of contents shows it. */
export interface TocHeading {
  /** The level of the heading, from 1 to 6. */
  level: number;
  /** The text of the heading. */
  text: string;
  /** Where the heading node starts in the document. */
  pos: number;
}

/** What a heading without text says in the list. */
export const UNTITLED_HEADING = 'Untitled heading';

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';
/**
 * The line that decides which heading is in view sits this far under the bar. A jump puts the heading under the bar
 * with the space of `scroll-padding-top` and its own top margin, and that heading must count as the one in view.
 */
const UNDER_BAR = 56;
let nextId = 0;

/** The headings of the document, in order. A heading inside a quote or a list counts too. */
export function documentHeadings(editor: Editor): TocHeading[] {
  const headings: TocHeading[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') {
      return true;
    }
    headings.push({
      level: Number(node.attrs.level),
      text: node.textContent.trim() || UNTITLED_HEADING,
      pos,
    });
    // A heading has no heading inside it.
    return false;
  });
  return headings;
}

/** The element of the heading at `pos`, also when the heading sits in a quote or a list. */
export function headingElement(editor: Editor, pos: number): HTMLElement | undefined {
  const inside = editor.view.domAtPos(pos + 1);
  const node = inside.node instanceof HTMLElement ? inside.node : inside.node.parentElement;
  const near = node?.closest<HTMLElement>(HEADING_SELECTOR);
  if (near) {
    return near;
  }
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) {
    return undefined;
  }
  return dom.matches(HEADING_SELECTOR) ? dom : (dom.querySelector<HTMLElement>(HEADING_SELECTOR) ?? undefined);
}

export interface TableOfContentsOptions {
  /** The bar at the top of the page. The button goes at the far left of it. */
  bar: HTMLElement;
  editor: Editor;
}

export interface TableOfContents {
  /** The button at the far left of the bar. */
  readonly button: HTMLButtonElement;
  /** The panel that lists the headings. It is on the page, and hidden while it is closed. */
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Read the headings again. The list keeps the filter that the user typed. */
  refresh(): void;
  destroy(): void;
}

/**
 * The table of contents: a button at the far left of the bar, and a panel below it with the headings of the
 * document. The panel also has a filter. A click on a heading scrolls to it. Escape, a click outside the panel
 * and the button close it.
 */
export function createTableOfContents(options: TableOfContentsOptions): TableOfContents {
  const { bar, editor } = options;
  const panelId = `rme-toc-${++nextId}`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rme-stats-button';
  button.dataset.action = 'contents';
  button.title = 'Show the table of contents';
  button.setAttribute('aria-label', 'Show the table of contents');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', panelId);
  button.innerHTML = icons.toc;
  const buttonLabel = document.createElement('span');
  buttonLabel.className = 'rme-stats-button-label';
  buttonLabel.textContent = 'Contents';
  button.append(buttonLabel);

  // The heading of the text that is under the bar. It stays empty in a document without headings.
  const headingLabel = document.createElement('span');
  headingLabel.className = 'rme-stats-heading';

  const panel = document.createElement('div');
  panel.className = 'rme-toc';
  panel.id = panelId;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Table of contents');
  panel.hidden = true;

  const filterRow = document.createElement('div');
  filterRow.className = 'rme-toc-filter-row';
  const filterIcon = document.createElement('span');
  filterIcon.className = 'rme-toc-filter-icon';
  filterIcon.innerHTML = icons.filter;
  const filter = document.createElement('input');
  filter.className = 'rme-toc-filter';
  filter.type = 'text';
  filter.spellcheck = false;
  filter.placeholder = 'Filter headings';
  filter.setAttribute('aria-label', 'Filter headings');
  filterRow.append(filterIcon, filter);

  const list = document.createElement('ul');
  list.className = 'rme-toc-list';

  const empty = document.createElement('p');
  empty.className = 'rme-toc-empty';
  empty.hidden = true;

  panel.append(filterRow, list, empty);
  bar.prepend(headingLabel);
  bar.prepend(button);
  document.body.append(panel);

  let headings: TocHeading[] = [];
  let elements: (HTMLElement | undefined)[] = [];
  /** The index of the heading of the text at the top of the page, or -1 above the first heading. */
  let active = -1;
  let signature = '';
  /** The signature of the list that the panel shows. A closed panel waits for its next open. */
  let renderedSignature = '';
  let frame = 0;

  const visibleItems = (): HTMLButtonElement[] =>
    [...list.querySelectorAll<HTMLButtonElement>('.rme-toc-item')].filter(
      (item) => !(item.parentElement?.hidden ?? false),
    );

  function applyFilter(): void {
    const query = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const entry of [...list.children]) {
      const item = entry.querySelector('.rme-toc-item');
      const match = query === '' || (item?.textContent ?? '').toLowerCase().includes(query);
      if (entry instanceof HTMLElement) {
        entry.hidden = !match;
      }
      if (match) {
        shown++;
      }
    }
    empty.hidden = shown > 0;
    empty.textContent = headings.length === 0 ? 'No headings in this document' : 'No headings match';
  }

  function select(heading: TocHeading): void {
    headingElement(editor, heading.pos)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    close();
  }

  /** Mark the heading that contains the text under the bar, in the bar and in the open panel. */
  function applyActive(): void {
    const text = active >= 0 ? headings[active].text : '';
    if (headingLabel.textContent !== text) {
      headingLabel.textContent = text;
      headingLabel.title = text;
    }
    if (panel.hidden) {
      return;
    }
    for (const [index, item] of [...list.querySelectorAll<HTMLButtonElement>('.rme-toc-item')].entries()) {
      if (index === active) {
        item.setAttribute('aria-current', 'location');
      } else {
        item.removeAttribute('aria-current');
      }
    }
  }

  /** Find the heading of the text at the top of the page. The headings are in document order. */
  function measure(): void {
    const limit = bar.getBoundingClientRect().bottom + UNDER_BAR;
    let found = -1;
    for (let index = 0; index < headings.length; index += 1) {
      const element = elements[index];
      if (!element) {
        continue;
      }
      if (element.getBoundingClientRect().top > limit) {
        break;
      }
      found = index;
    }
    // At the top of a page the first heading is still below the bar. It is the heading of the text in view.
    if (found === -1 && elements[0] && elements[0].getBoundingClientRect().top < window.innerHeight) {
      found = 0;
    }
    active = found;
  }

  function render(): void {
    const entries = headings.map((heading) => {
      const entry = document.createElement('li');
      entry.className = 'rme-toc-entry';
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'rme-toc-item';
      item.dataset.level = String(heading.level);
      item.dataset.pos = String(heading.pos);
      item.textContent = heading.text;
      item.title = heading.text;
      // Keep the caret in the document when the user clicks a heading.
      item.addEventListener('mousedown', (event) => event.preventDefault());
      item.addEventListener('click', () => select(heading));
      entry.append(item);
      return entry;
    });
    list.replaceChildren(...entries);
    renderedSignature = signature;
    applyFilter();
    applyActive();
  }

  function refresh(): void {
    const next = documentHeadings(editor);
    const key = JSON.stringify(next);
    if (key === signature) {
      return;
    }
    signature = key;
    headings = next;
    elements = headings.map((heading) => headingElement(editor, heading.pos));
    measure();
    // A closed panel shows no list. The bar label moves, and the list follows at the next open.
    if (panel.hidden) {
      applyActive();
    } else {
      render();
    }
  }

  /** The scroll event runs many times; one frame of work is enough to move the marks. */
  function onScroll(): void {
    if (frame !== 0) {
      return;
    }
    frame = requestAnimationFrame(() => {
      frame = 0;
      measure();
      applyActive();
    });
  }

  /** Put the heading of the text in view at the top of the list, where the user looks first. */
  function revealActive(): void {
    const item = list.querySelector<HTMLElement>('.rme-toc-item[aria-current]');
    if (!item) {
      return;
    }
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + item.offsetHeight - list.clientHeight;
    }
  }

  /** Put the panel below the button. A narrow page keeps it inside the window. */
  function position(): void {
    const rect = button.getBoundingClientRect();
    const width = panel.getBoundingClientRect().width;
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
    panel.style.top = `${rect.bottom + 4}px`;
    panel.style.left = `${left}px`;
  }

  function onOutside(event: MouseEvent): void {
    const target = event.target as Node;
    if (!panel.contains(target) && !button.contains(target)) {
      close();
    }
  }

  function open(): void {
    if (!panel.hidden) {
      return;
    }
    filter.value = '';
    refresh();
    if (renderedSignature !== signature) {
      render();
    }
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    syncActive();
    applyFilter();
    position();
    revealActive();
    document.addEventListener('mousedown', onOutside, true);
    window.addEventListener('resize', position);
    filter.focus();
  }

  /** Read the page again when the panel opens, because the text may have moved since the last scroll. */
  function syncActive(): void {
    measure();
    applyActive();
  }

  function close(): void {
    if (panel.hidden) {
      return;
    }
    const hadFocus = panel.contains(document.activeElement);
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onOutside, true);
    window.removeEventListener('resize', position);
    // The hidden panel has no focus, so a keyboard user keeps the button. The focus must not scroll the page,
    // because the user may have just jumped to a heading far down the document.
    if (hadFocus) {
      button.focus({ preventScroll: true });
    }
  }

  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  filter.addEventListener('input', applyFilter);

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      // VS Code must not see this key, and no menu of the editor runs its Escape.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const items = visibleItems();
    if (items.length === 0) {
      return;
    }
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      index === -1
        ? items[step === 1 ? 0 : items.length - 1]
        : items[Math.min(items.length - 1, Math.max(0, index + step))];
    event.preventDefault();
    next?.focus();
  });

  const onUpdate = (): void => {
    // The bar shows the heading too, so a closed panel still reads the headings after an edit.
    refresh();
    syncActive();
  };
  editor.on('update', onUpdate);
  window.addEventListener('scroll', onScroll, { passive: true });
  refresh();

  return {
    button,
    element: panel,
    open,
    close,
    isOpen: () => !panel.hidden,
    refresh,
    destroy() {
      close();
      cancelAnimationFrame(frame);
      editor.off('update', onUpdate);
      window.removeEventListener('scroll', onScroll);
      button.remove();
      headingLabel.remove();
      panel.remove();
    },
  };
}
