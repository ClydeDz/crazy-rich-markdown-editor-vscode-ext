import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';

export interface MenuEntry {
  /** An SVG string, or a short text. */
  icon?: string;
  title: string;
  description?: string;
}

export interface SuggestionRendererOptions<T> {
  describe: (item: T) => MenuEntry;
  /** Show nothing when no item matches. */
  hideWhenEmpty?: boolean;
  /** The class for the menu element. */
  className?: string;
}

interface Renderer<T> {
  onStart: (props: SuggestionProps<T, T>) => void;
  onUpdate: (props: SuggestionProps<T, T>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

/**
 * A pop-up list for the Tiptap suggestion plugin. The slash menu and the emoji menu use it.
 * It shows next to the cursor, and it works with the arrow keys, `Enter`, `Tab` and the mouse.
 */
export function createSuggestionRenderer<T>(options: SuggestionRendererOptions<T>): () => Renderer<T> {
  return () => {
    let root: HTMLElement | undefined;
    let items: T[] = [];
    let selected = 0;
    let current: SuggestionProps<T, T> | undefined;

    const close = (): void => {
      root?.remove();
      root = undefined;
    };

    const choose = (index: number): void => {
      const item = items[index];
      if (item !== undefined && current) {
        current.command(item);
      }
    };

    const position = (): void => {
      const rect = current?.clientRect?.();
      if (!root || !rect) {
        return;
      }
      const gap = 6;
      const menuHeight = root.offsetHeight;
      const below = rect.bottom + gap;
      const fitsBelow = below + menuHeight <= window.innerHeight;
      root.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - root.offsetWidth - 8))}px`;
      root.style.top = `${fitsBelow ? below : Math.max(8, rect.top - gap - menuHeight)}px`;
    };

    const draw = (): void => {
      if (items.length === 0 && options.hideWhenEmpty) {
        close();
        return;
      }
      if (!root) {
        root = document.createElement('div');
        root.className = options.className ? `rme-slash ${options.className}` : 'rme-slash';
        root.setAttribute('role', 'listbox');
        document.body.append(root);
      }
      root.replaceChildren();
      if (items.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'rme-slash-empty';
        empty.textContent = 'No matches';
        root.append(empty);
        return;
      }
      items.forEach((item, index) => {
        const entry = options.describe(item);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'rme-slash-item';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(index === selected));
        if (index === selected) {
          row.classList.add('is-selected');
        }
        const icon = document.createElement('span');
        icon.className = 'rme-slash-icon';
        if (entry.icon?.startsWith('<svg')) {
          icon.innerHTML = entry.icon;
        } else {
          icon.textContent = entry.icon ?? '';
        }
        const text = document.createElement('span');
        text.className = 'rme-slash-text';
        const title = document.createElement('span');
        title.className = 'rme-slash-title';
        title.textContent = entry.title;
        text.append(title);
        if (entry.description) {
          const description = document.createElement('span');
          description.className = 'rme-slash-description';
          description.textContent = entry.description;
          text.append(description);
        }
        row.append(icon, text);
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
        root!.append(row);
      });
      root.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
    };

    return {
      onStart: (props) => {
        current = props;
        items = props.items;
        selected = 0;
        draw();
        position();
      },
      onUpdate: (props) => {
        current = props;
        items = props.items;
        selected = Math.min(selected, Math.max(items.length - 1, 0));
        draw();
        position();
      },
      onKeyDown: ({ event }) => {
        if (event.key === 'Escape') {
          close();
          return true;
        }
        if (!root || items.length === 0) {
          return false;
        }
        if (event.key === 'ArrowDown') {
          selected = (selected + 1) % items.length;
          draw();
          return true;
        }
        if (event.key === 'ArrowUp') {
          selected = (selected - 1 + items.length) % items.length;
          draw();
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          choose(selected);
          return true;
        }
        return false;
      },
      onExit: () => {
        close();
        current = undefined;
      },
    };
  };
}
