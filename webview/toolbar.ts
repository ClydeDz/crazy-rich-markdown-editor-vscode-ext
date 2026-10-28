import { Editor, Extension } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/extension-bubble-menu';
import { TextSelection } from '@tiptap/pm/state';
import { ALERT_TITLES, ALERT_TYPES, AlertType } from './alert';
import { icons } from './icons';
import { formatShortcut } from './keys';
import { FORMAT_KEYS } from './shortcuts';

/** The shortcut that opens the link field. It works when text is selected. */
export const LINK_SHORTCUT = FORMAT_KEYS.link;

interface ToolbarAction {
  id: string;
  title: string;
  /** Keyboard shortcut. `Mod` becomes the Command key on macOS and Ctrl elsewhere. */
  shortcut?: string;
  icon?: string;
  label?: string;
  isActive?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

const formatActions: ToolbarAction[][] = [
  [
    {
      id: 'bold',
      title: 'Bold',
      shortcut: FORMAT_KEYS.bold,
      icon: icons.bold,
      isActive: (e) => e.isActive('bold'),
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      id: 'italic',
      title: 'Italic',
      shortcut: FORMAT_KEYS.italic,
      icon: icons.italic,
      isActive: (e) => e.isActive('italic'),
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      id: 'underline',
      title: 'Underline',
      shortcut: FORMAT_KEYS.underline,
      icon: icons.underline,
      isActive: (e) => e.isActive('underline'),
      run: (e) => e.chain().focus().toggleUnderline().run(),
    },
    {
      id: 'strike',
      title: 'Strikethrough',
      shortcut: FORMAT_KEYS.strike,
      icon: icons.strike,
      isActive: (e) => e.isActive('strike'),
      run: (e) => e.chain().focus().toggleStrike().run(),
    },
    {
      id: 'code',
      title: 'Inline code',
      shortcut: FORMAT_KEYS.code,
      icon: icons.code,
      isActive: (e) => e.isActive('code'),
      run: (e) => e.chain().focus().toggleCode().run(),
    },
  ],
  [
    {
      id: 'h1',
      title: 'Heading 1',
      shortcut: FORMAT_KEYS.h1,
      label: 'H1',
      isActive: (e) => e.isActive('heading', { level: 1 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: 'h2',
      title: 'Heading 2',
      shortcut: FORMAT_KEYS.h2,
      label: 'H2',
      isActive: (e) => e.isActive('heading', { level: 2 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: 'h3',
      title: 'Heading 3',
      shortcut: FORMAT_KEYS.h3,
      label: 'H3',
      isActive: (e) => e.isActive('heading', { level: 3 }),
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      id: 'bulletList',
      title: 'Bulleted list',
      shortcut: FORMAT_KEYS.bulletList,
      icon: icons.bulletList,
      isActive: (e) => e.isActive('bulletList'),
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: 'orderedList',
      title: 'Numbered list',
      shortcut: FORMAT_KEYS.orderedList,
      icon: icons.orderedList,
      isActive: (e) => e.isActive('orderedList'),
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      id: 'taskList',
      title: 'Task list',
      shortcut: FORMAT_KEYS.taskList,
      icon: icons.taskList,
      isActive: (e) => e.isActive('taskList'),
      run: (e) => e.chain().focus().toggleTaskList().run(),
    },
  ],
  [
    {
      id: 'blockquote',
      title: 'Quote',
      shortcut: FORMAT_KEYS.blockquote,
      icon: icons.quote,
      isActive: (e) => e.isActive('blockquote'),
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      id: 'codeBlock',
      title: 'Code block',
      shortcut: FORMAT_KEYS.codeBlock,
      icon: icons.codeBlock,
      isActive: (e) => e.isActive('codeBlock'),
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
  ],
];

const alertIcons: Record<AlertType, string> = {
  note: icons.alertNote,
  tip: icons.alertTip,
  important: icons.alertImportant,
  warning: icons.alertWarning,
  caution: icons.alertCaution,
};

/** The menu behind the "More" button. A `null` item is a line between groups. */
const moreItems: (ToolbarAction | null)[] = [
  {
    id: 'superscript',
    title: 'Superscript',
    shortcut: FORMAT_KEYS.superscript,
    icon: icons.superscript,
    isActive: (e) => e.isActive('superscript'),
    run: (e) => e.chain().focus().toggleSuperscript().run(),
  },
  {
    id: 'subscript',
    title: 'Subscript',
    shortcut: FORMAT_KEYS.subscript,
    icon: icons.subscript,
    isActive: (e) => e.isActive('subscript'),
    run: (e) => e.chain().focus().toggleSubscript().run(),
  },
  null,
  ...ALERT_TYPES.map((type): ToolbarAction => ({
    id: `alert-${type}`,
    title: `${ALERT_TITLES[type]} alert`,
    icon: alertIcons[type],
    isActive: (e) => e.isActive('alert', { type }),
    run: (e) =>
      e.isActive('alert', { type }) ? e.chain().focus().unsetAlert().run() : e.chain().focus().setAlert(type).run(),
  })),
  null,
  {
    id: 'mathBlock',
    title: 'Math block',
    icon: icons.math,
    run: (e) => e.chain().focus().setMathBlock().run(),
  },
  {
    id: 'diagram',
    title: 'Diagram',
    icon: icons.diagram,
    run: (e) => e.chain().focus().setDiagram().run(),
  },
  null,
  {
    id: 'clear',
    title: 'Clear formatting',
    icon: icons.clear,
    run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
  },
];

/** A shortcut of a toolbar button, as the list of shortcuts shows it. */
export interface ToolbarShortcut {
  title: string;
  /** The key name, for example `Mod-Shift-s`. */
  shortcut: string;
  note?: string;
}

/**
 * The shortcuts of the toolbar, in the order of the toolbar. A group is a row of buttons between two dividers.
 * The first group also has the link and the buttons of the "More" menu that have a shortcut.
 */
export function toolbarShortcutGroups(): ToolbarShortcut[][] {
  const withShortcut = (actions: (ToolbarAction | null)[]): ToolbarShortcut[] =>
    actions.flatMap((action) => (action?.shortcut ? [{ title: action.title, shortcut: action.shortcut }] : []));
  const [marks, ...others] = formatActions;
  return [
    [
      ...withShortcut(marks),
      { title: 'Link', shortcut: LINK_SHORTCUT, note: 'Select text first' },
      ...withShortcut(moreItems),
    ],
    ...others.map(withShortcut),
  ];
}

const tableActions: ToolbarAction[] = [
  { id: 'addRow', title: 'Add row below', label: '+ Row', run: (e) => e.chain().focus().addRowAfter().run() },
  { id: 'addColumn', title: 'Add column right', label: '+ Col', run: (e) => e.chain().focus().addColumnAfter().run() },
  { id: 'deleteRow', title: 'Delete row', label: '− Row', run: (e) => e.chain().focus().deleteRow().run() },
  { id: 'deleteColumn', title: 'Delete column', label: '− Col', run: (e) => e.chain().focus().deleteColumn().run() },
  { id: 'deleteTable', title: 'Delete table', icon: icons.trash, run: (e) => e.chain().focus().deleteTable().run() },
];

/** Add a protocol to bare domains. Leave relative paths and anchors as they are. */
export function normalizeHref(value: string): string {
  const href = value.trim();
  if (!href) {
    return '';
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || /^[/#.?]/.test(href)) {
    return href;
  }
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(href)) {
    return `mailto:${href}`;
  }
  if (/^[^\s/]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(href)) {
    return `https://${href}`;
  }
  return href;
}

function createButton(action: ToolbarAction): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rme-btn';
  button.dataset.action = action.id;
  const hint = action.shortcut ? ` (${formatShortcut(action.shortcut)})` : '';
  button.title = `${action.title}${hint}`;
  button.setAttribute('aria-label', action.title);
  if (action.icon) {
    button.innerHTML = action.icon;
  } else {
    button.textContent = action.label ?? action.title;
    button.classList.add('rme-btn-text');
  }
  // Keep the text selection and the editor focus when the user clicks a button.
  button.addEventListener('mousedown', (event) => event.preventDefault());
  return button;
}

function createMenuItem(action: ToolbarAction): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'rme-menu-item';
  item.dataset.action = action.id;
  item.setAttribute('role', 'menuitemcheckbox');
  item.setAttribute('aria-checked', 'false');

  const icon = document.createElement('span');
  icon.className = 'rme-menu-icon';
  icon.innerHTML = action.icon ?? '';
  const label = document.createElement('span');
  label.className = 'rme-menu-label';
  label.textContent = action.title;
  item.append(icon, label);
  if (action.shortcut) {
    const hint = document.createElement('span');
    hint.className = 'rme-menu-hint';
    hint.textContent = formatShortcut(action.shortcut);
    item.append(hint);
  }
  // Keep the text selection and the editor focus when the user clicks an item.
  item.addEventListener('mousedown', (event) => event.preventDefault());
  return item;
}

function createDivider(): HTMLElement {
  const divider = document.createElement('span');
  divider.className = 'rme-divider';
  divider.setAttribute('role', 'separator');
  return divider;
}

function isFocusInside(editor: Editor, element: HTMLElement): boolean {
  return editor.view.hasFocus() || element.contains(document.activeElement);
}

export interface FloatingToolbars {
  /** The element of the text toolbar. */
  textBar: HTMLElement;
  /** Extensions that mount the floating toolbars on an editor. */
  extensions: Extension[];
  /** Connect the toolbars to the editor after it exists. */
  bind(editor: Editor): void;
}

/**
 * The floating toolbar. It shows above the selected text and has the format buttons.
 * A second toolbar shows above a table when the cursor sits in a table cell.
 */
export function createFloatingToolbars(): FloatingToolbars {
  const textBar = document.createElement('div');
  textBar.className = 'rme-toolbar';
  textBar.setAttribute('role', 'toolbar');
  textBar.setAttribute('aria-label', 'Text formatting');

  const tableBar = document.createElement('div');
  tableBar.className = 'rme-toolbar rme-table-toolbar';
  tableBar.setAttribute('role', 'toolbar');
  tableBar.setAttribute('aria-label', 'Table');

  const actionsRow = document.createElement('div');
  actionsRow.className = 'rme-actions';

  const linkForm = document.createElement('form');
  linkForm.className = 'rme-link-form';
  linkForm.innerHTML = `
    <input class="rme-link-input" type="text" spellcheck="false" placeholder="Paste or type a link" aria-label="Link address" />
    <button type="submit" class="rme-btn" title="Apply link" aria-label="Apply link">${icons.check}</button>
    <button type="button" class="rme-btn" data-unlink title="Remove link" aria-label="Remove link">${icons.unlink}</button>
    <button type="button" class="rme-btn" data-cancel title="Cancel" aria-label="Cancel">${icons.close}</button>`;
  textBar.append(actionsRow, linkForm);

  const linkInput = linkForm.querySelector<HTMLInputElement>('.rme-link-input')!;
  let linkMode = false;
  let boundEditor: Editor | undefined;

  const buttons = new Map<string, { button: HTMLButtonElement; action: ToolbarAction }>();

  // Link button sits in the first group, after the inline marks.
  const linkAction: ToolbarAction = {
    id: 'link',
    title: 'Link',
    shortcut: LINK_SHORTCUT,
    icon: icons.link,
    isActive: (e) => e.isActive('link'),
    run: () => openLinkMode(),
  };

  formatActions.forEach((group, index) => {
    if (index > 0) {
      actionsRow.append(createDivider());
    }
    const items = index === 0 ? [...group, linkAction] : group;
    for (const action of items) {
      const button = createButton(action);
      buttons.set(action.id, { button, action });
      actionsRow.append(button);
    }
  });

  // The "More" button opens a menu with the less common formats.
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'rme-btn';
  moreButton.dataset.action = 'more';
  moreButton.title = 'More formats';
  moreButton.setAttribute('aria-label', 'More formats');
  moreButton.setAttribute('aria-haspopup', 'menu');
  moreButton.setAttribute('aria-expanded', 'false');
  moreButton.innerHTML = icons.more;
  moreButton.addEventListener('mousedown', (event) => event.preventDefault());
  actionsRow.append(createDivider(), moreButton);

  const moreMenu = document.createElement('div');
  moreMenu.className = 'rme-menu';
  moreMenu.setAttribute('role', 'menu');
  moreMenu.hidden = true;
  for (const item of moreItems) {
    if (item === null) {
      moreMenu.append(createDivider());
      continue;
    }
    const element = createMenuItem(item);
    buttons.set(item.id, { button: element, action: item });
    moreMenu.append(element);
  }
  textBar.append(moreMenu);

  const closeMenu = (): void => {
    if (moreMenu.hidden) {
      return;
    }
    moreMenu.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
    moreButton.classList.remove('is-active');
    document.removeEventListener('mousedown', onOutsideMenu, true);
    document.removeEventListener('keydown', onMenuKey, true);
  };
  const openMenu = (): void => {
    moreMenu.hidden = false;
    moreButton.setAttribute('aria-expanded', 'true');
    moreButton.classList.add('is-active');
    document.addEventListener('mousedown', onOutsideMenu, true);
    document.addEventListener('keydown', onMenuKey, true);
  };
  function onOutsideMenu(event: MouseEvent): void {
    const target = event.target as Node;
    if (!moreMenu.contains(target) && !moreButton.contains(target)) {
      closeMenu();
    }
  }
  function onMenuKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    }
  }

  for (const action of tableActions) {
    const button = createButton(action);
    buttons.set(action.id, { button, action });
    tableBar.append(button);
  }

  const refreshPosition = (): void => {
    if (!boundEditor) {
      return;
    }
    boundEditor.view.dispatch(boundEditor.state.tr.setMeta('rmeTextBar', 'updatePosition'));
  };

  function openLinkMode(): void {
    if (!boundEditor || boundEditor.state.selection.empty) {
      return;
    }
    closeMenu();
    linkMode = true;
    textBar.classList.add('is-link-mode');
    linkInput.value = (boundEditor.getAttributes('link').href as string | undefined) ?? '';
    refreshPosition();
    requestAnimationFrame(() => {
      linkInput.focus();
      linkInput.select();
    });
  }

  function closeLinkMode(refocus: boolean): void {
    linkMode = false;
    textBar.classList.remove('is-link-mode');
    if (refocus) {
      boundEditor?.chain().focus().run();
    }
    refreshPosition();
  }

  linkForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!boundEditor) {
      return;
    }
    const href = normalizeHref(linkInput.value);
    const chain = boundEditor.chain().focus().extendMarkRange('link');
    if (href) {
      chain.setLink({ href }).run();
    } else {
      chain.unsetLink().run();
    }
    closeLinkMode(false);
  });

  linkForm.querySelector('[data-unlink]')!.addEventListener('click', () => {
    boundEditor?.chain().focus().extendMarkRange('link').unsetLink().run();
    closeLinkMode(false);
  });

  linkForm.querySelector('[data-cancel]')!.addEventListener('click', () => closeLinkMode(true));

  linkInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeLinkMode(true);
    }
  });

  const onButtonClick = (event: Event): void => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (!target || !boundEditor) {
      return;
    }
    if (target === moreButton) {
      if (moreMenu.hidden) {
        openMenu();
      } else {
        closeMenu();
      }
      return;
    }
    if (moreMenu.contains(target)) {
      closeMenu();
    }
    buttons.get(target.dataset.action!)?.action.run(boundEditor);
  };
  textBar.addEventListener('click', onButtonClick);
  tableBar.addEventListener('click', onButtonClick);

  const syncActiveState = (): void => {
    if (!boundEditor) {
      return;
    }
    for (const { button, action } of buttons.values()) {
      if (!action.isActive) {
        continue;
      }
      const active = action.isActive(boundEditor);
      button.classList.toggle('is-active', active);
      button.setAttribute(
        button.getAttribute('role') === 'menuitemcheckbox' ? 'aria-checked' : 'aria-pressed',
        String(active),
      );
    }
  };

  const textBubble = BubbleMenu.configure({
    element: textBar,
    pluginKey: 'rmeTextBar',
    updateDelay: 40,
    options: {
      placement: 'top',
      offset: 8,
      flip: true,
      shift: { padding: 8 },
    },
    shouldShow: ({ editor, state, from, to, element }) => {
      if (linkMode) {
        return true;
      }
      const { selection } = state;
      if (!editor.isEditable || selection.empty || !(selection instanceof TextSelection)) {
        return false;
      }
      if (state.doc.textBetween(from, to, ' ').trim().length === 0) {
        return false;
      }
      if (editor.isActive('codeBlock')) {
        return false;
      }
      return isFocusInside(editor, element);
    },
  });

  // A second menu needs its own extension name.
  const tableBubble = BubbleMenu.extend({ name: 'tableBubbleMenu' }).configure({
    element: tableBar,
    pluginKey: 'rmeTableBar',
    updateDelay: 40,
    options: {
      placement: 'top-start',
      offset: 6,
      flip: true,
      shift: { padding: 8 },
    },
    getReferencedVirtualElement: () => {
      if (!boundEditor) {
        return null;
      }
      const { node } = boundEditor.view.domAtPos(boundEditor.state.selection.from);
      const origin = node instanceof Element ? node : node.parentElement;
      const table = origin?.closest('table');
      return table ? { getBoundingClientRect: () => table.getBoundingClientRect(), contextElement: table } : null;
    },
    shouldShow: ({ editor, state, element }) => {
      return editor.isEditable && state.selection.empty && editor.isActive('table') && isFocusInside(editor, element);
    },
  });

  // Cmd+K and Ctrl+K open the link field when text is selected.
  const linkShortcut = Extension.create({
    name: 'rmeLinkShortcut',
    addKeyboardShortcuts() {
      return {
        [LINK_SHORTCUT]: () => {
          if (this.editor.state.selection.empty) {
            return false;
          }
          openLinkMode();
          return true;
        },
      };
    },
  });

  return {
    textBar,
    extensions: [textBubble, tableBubble, linkShortcut],
    bind(editor: Editor) {
      boundEditor = editor;
      editor.on('transaction', syncActiveState);
      editor.on('selectionUpdate', () => {
        closeMenu();
        // A new selection ends link editing.
        if (linkMode && editor.state.selection.empty) {
          closeLinkMode(false);
        }
      });
      syncActiveState();
    },
  };
}
