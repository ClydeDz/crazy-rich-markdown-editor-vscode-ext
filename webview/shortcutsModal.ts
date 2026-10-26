import { icons } from './icons';
import { keyParts } from './keys';
import type { ShortcutGroup } from './shortcuts';

export interface ShortcutsModalOptions {
  groups: ShortcutGroup[];
  /** The line at the bottom of the window. An empty address leaves out the link. */
  about: { creator: string; creatorUrl?: string; coffeeUrl?: string };
  /** Runs when the user clicks a link in the window. The host opens the address. */
  openLink: (href: string) => void;
}

export interface ShortcutsModal {
  /** The dark layer that covers the page. It holds the window. */
  readonly element: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Take the window and its key listener off the page. */
  destroy(): void;
}

const TITLE_ID = 'rme-shortcuts-title';
const FOCUSABLE = 'button:not([disabled]), a[href]';

/** A window that lists the keyboard shortcuts. Escape, the close button and a click outside the window close it. */
export function createShortcutsModal(options: ShortcutsModalOptions): ShortcutsModal {
  const backdrop = document.createElement('div');
  backdrop.className = 'rme-modal-backdrop';
  backdrop.hidden = true;

  const dialog = document.createElement('div');
  dialog.className = 'rme-modal';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', TITLE_ID);
  dialog.tabIndex = -1;

  const header = document.createElement('header');
  header.className = 'rme-modal-header';
  const title = document.createElement('h2');
  title.id = TITLE_ID;
  title.className = 'rme-modal-title';
  title.textContent = 'Keyboard shortcuts';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'rme-modal-close';
  closeButton.title = 'Close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.innerHTML = icons.close;
  header.append(title, closeButton);

  const body = document.createElement('div');
  body.className = 'rme-modal-body';
  for (const group of options.groups) {
    const section = document.createElement('section');
    section.className = 'rme-shortcut-group';
    const heading = document.createElement('h3');
    heading.className = 'rme-shortcut-group-title';
    heading.textContent = group.title;
    const list = document.createElement('ul');
    list.className = 'rme-shortcut-list';
    for (const item of group.items) {
      const row = document.createElement('li');
      row.className = 'rme-shortcut';
      const label = document.createElement('span');
      label.className = 'rme-shortcut-label';
      label.textContent = item.label;
      if (item.note) {
        const note = document.createElement('small');
        note.className = 'rme-shortcut-note';
        note.textContent = item.note;
        label.append(note);
      }
      const keys = document.createElement('span');
      keys.className = 'rme-shortcut-keys';
      item.keys.forEach((way, index) => {
        if (index > 0) {
          const or = document.createElement('span');
          or.className = 'rme-shortcut-or';
          or.textContent = 'or';
          keys.append(or);
        }
        const caps = document.createElement('span');
        caps.className = 'rme-shortcut-way';
        for (const part of keyParts(way)) {
          const cap = document.createElement('kbd');
          cap.textContent = part;
          caps.append(cap);
        }
        keys.append(caps);
      });
      row.append(label, keys);
      list.append(row);
    }
    section.append(heading, list);
    body.append(section);
  }

  const footer = document.createElement('footer');
  footer.className = 'rme-modal-footer';
  const link = (text: string, href: string, className: string): HTMLAnchorElement => {
    const anchor = document.createElement('a');
    anchor.className = className;
    anchor.setAttribute('href', href);
    anchor.title = href;
    anchor.textContent = text;
    anchor.addEventListener('click', (event) => {
      // The host opens the address. The page must not follow the link itself.
      event.preventDefault();
      options.openLink(href);
    });
    return anchor;
  };
  const credit = document.createElement('span');
  credit.className = 'rme-modal-credit';
  credit.append('Created by ');
  const { creator, creatorUrl, coffeeUrl } = options.about;
  credit.append(creatorUrl ? link(creator, creatorUrl, 'rme-modal-link') : creator);
  footer.append(credit);
  if (coffeeUrl) {
    footer.append(link('☕ Buy me a coffee', coffeeUrl, 'rme-modal-link rme-modal-coffee'));
  }

  dialog.append(header, body, footer);
  backdrop.append(dialog);
  document.body.append(backdrop);

  let returnFocus: HTMLElement | null = null;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      // Nothing else reacts to this key, for example a menu of the editor.
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === 'Tab') {
      // The focus stays inside the window.
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!first || !dialog.contains(active) || (event.shiftKey && (active === first || active === dialog))) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  function open(): void {
    if (!backdrop.hidden) {
      return;
    }
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    backdrop.hidden = false;
    body.scrollTop = 0;
    document.addEventListener('keydown', onKeyDown, true);
    closeButton.focus();
  }

  function close(): void {
    if (backdrop.hidden) {
      return;
    }
    backdrop.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
    if (returnFocus?.isConnected) {
      returnFocus.focus();
    }
    returnFocus = null;
  }

  closeButton.addEventListener('click', close);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  return {
    element: backdrop,
    open,
    close,
    isOpen: () => !backdrop.hidden,
    destroy() {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
    },
  };
}
