import { Node, mergeAttributes } from '@tiptap/core';
import { icons } from './icons';

export const ALERT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_TITLES: Record<AlertType, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

const MARKER = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    alert: {
      /** Wrap the selected blocks in an alert, or change the type of the alert around the cursor. */
      setAlert: (type: AlertType) => ReturnType;
      /** Remove the alert and keep its content. */
      unsetAlert: () => ReturnType;
    };
  }
}

/**
 * A GitHub alert. It is a block quote that starts with a marker line:
 *
 *     > [!NOTE]
 *     > Useful information.
 */
export const Alert = Node.create({
  name: 'alert',
  group: 'block',
  content: 'block+',
  defining: true,
  // Run before the block quote, which reads the same Markdown token.
  priority: 1000,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: (element) => normalizeType(element.getAttribute('data-alert')),
        renderHTML: (attributes) => ({ 'data-alert': attributes.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-alert]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: `rme-alert rme-alert-${node.attrs.type}` }), 0];
  },

  markdownTokenName: 'blockquote',

  parseMarkdown(token, helpers) {
    const tokens: any[] = token.tokens ?? [];
    const first = tokens[0];
    const lead = first?.type === 'paragraph' ? first.tokens?.[0] : undefined;
    const marker = lead?.type === 'text' ? MARKER.exec(String(lead.text)) : null;
    if (!marker) {
      // An empty result tells the Markdown parser to use the block quote.
      return [];
    }

    const rest = String(lead.text).slice(marker[0].length);
    const inline = [...first.tokens];
    if (rest.length > 0) {
      inline[0] = { ...lead, text: rest, raw: rest };
    } else {
      inline.shift();
      // A marker with two trailing spaces is followed by a line break token.
      if (inline[0]?.type === 'br') {
        inline.shift();
      }
    }

    const body = [...(inline.length > 0 ? [{ ...first, tokens: inline }] : []), ...tokens.slice(1)].filter(
      (child, index, all) => !(child.type === 'space' && index === 0 && all.length > 0),
    );
    const parseBlockChildren = helpers.parseBlockChildren ?? helpers.parseChildren;
    const children = parseBlockChildren(body);
    return helpers.createNode(
      'alert',
      { type: normalizeType(marker[1]) },
      children.length > 0 ? children : [{ type: 'paragraph' }],
    );
  },

  // The serializer picks this function for plain block quotes too, because both use the token `blockquote`.
  // A block quote has no marker line.
  renderMarkdown(node, h) {
    if (!node.content) {
      return '';
    }
    const lines: string[] = node.type === 'alert' ? [`> [!${normalizeType(node.attrs?.type).toUpperCase()}]`] : [];
    let wroteBlock = false;
    node.content.forEach((child, index) => {
      const rendered = h.renderChild?.(child, index) ?? h.renderChildren([child]);
      if (rendered.trim() === '' && node.type === 'alert') {
        return;
      }
      if (wroteBlock) {
        lines.push('>');
      }
      lines.push(...rendered.split('\n').map((line) => (line.trim() === '' ? '>' : `> ${line}`)));
      wroteBlock = true;
    });
    return lines.join('\n');
  },

  addCommands() {
    return {
      setAlert:
        (type) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) {
            return commands.updateAttributes(this.name, { type });
          }
          return commands.wrapIn(this.name, { type });
        },
      unsetAlert:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the start of the alert takes the content out of the alert.
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty || $from.parentOffset !== 0) {
          return false;
        }
        for (let depth = $from.depth - 1; depth > 0; depth--) {
          if ($from.node(depth).type.name === this.name) {
            // Only when the cursor sits in the first block of the alert.
            return $from.index(depth) === 0 && $from.node(depth).firstChild === $from.parent
              ? editor.commands.lift(this.name)
              : false;
          }
        }
        return false;
      },
    };
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let current = node;

      const dom = document.createElement('div');
      const header = document.createElement('div');
      header.className = 'rme-alert-header';
      header.contentEditable = 'false';

      const icon = document.createElement('span');
      icon.className = 'rme-alert-icon';

      const select = document.createElement('select');
      select.className = 'rme-alert-select';
      select.setAttribute('aria-label', 'Alert type');
      for (const type of ALERT_TYPES) {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = ALERT_TITLES[type];
        select.append(option);
      }

      const body = document.createElement('div');
      body.className = 'rme-alert-body';

      header.append(icon, select);
      dom.append(header, body);

      const show = (type: AlertType): void => {
        dom.className = `rme-alert rme-alert-${type}`;
        dom.setAttribute('data-alert', type);
        icon.innerHTML = alertIcon(type);
        select.value = type;
      };
      show(normalizeType(node.attrs.type));

      select.addEventListener('change', () => {
        const pos = getPos();
        if (pos === undefined) {
          return;
        }
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, type: select.value }));
        editor.view.focus();
      });

      return {
        dom,
        contentDOM: body,
        stopEvent: (event) => header.contains(event.target as globalThis.Node),
        ignoreMutation: (mutation) => (mutation.type === 'selection' ? false : !body.contains(mutation.target)),
        update(updated) {
          if (updated.type !== current.type) {
            return false;
          }
          current = updated;
          show(normalizeType(updated.attrs.type));
          return true;
        },
      };
    };
  },
});

export function normalizeType(value: unknown): AlertType {
  const type = String(value ?? '').toLowerCase();
  return (ALERT_TYPES as readonly string[]).includes(type) ? (type as AlertType) : 'note';
}

function alertIcon(type: AlertType): string {
  switch (type) {
    case 'tip':
      return icons.alertTip;
    case 'important':
      return icons.alertImportant;
    case 'warning':
      return icons.alertWarning;
    case 'caution':
      return icons.alertCaution;
    default:
      return icons.alertNote;
  }
}
