import { Extension, Node } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseNode } from '@tiptap/pm/model';

const DEFINITION_START = /^\[\^([^\]\s]+)\]:[ \t]*/;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    footnote: {
      /** Put a new footnote mark at the cursor and add its text at the end of the document. */
      insertFootnote: () => ReturnType;
    };
  }
}

/** A footnote mark in the text, written `[^id]`. The editor shows the number of the footnote. */
export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { id: { default: '1' } };
  },

  parseHTML() {
    return [
      {
        tag: 'sup[data-footnote-ref]',
        getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-footnote-ref') }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['sup', { class: 'rme-fn-ref', 'data-footnote-ref': node.attrs.id, title: `Footnote ${node.attrs.id}` }];
  },

  markdownTokenName: 'footnoteRef',

  markdownTokenizer: {
    name: 'footnoteRef',
    level: 'inline',
    start(src: string) {
      return src.indexOf('[^');
    },
    tokenize(src: string): any {
      const match = /^\[\^([^\]\s]+)\](?!:)/.exec(src);
      return match ? { type: 'footnoteRef', raw: match[0], id: match[1] } : undefined;
    },
  } as any,

  parseMarkdown(token: any, helpers: any) {
    return helpers.createNode('footnoteRef', { id: token.id });
  },

  renderMarkdown(node) {
    return `[^${node.attrs?.id ?? ''}]`;
  },
});

/**
 * The text of a footnote, written `[^id]: text`.
 * Lines that are indented by two or more spaces belong to the footnote.
 */
export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return { id: { default: '1' } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-footnote-definition]',
        getAttrs: (el) => ({ id: (el as HTMLElement).getAttribute('data-footnote-definition') }),
      },
    ];
  },

  renderHTML({ node }) {
    return ['div', { class: 'rme-fn-def', 'data-footnote-definition': node.attrs.id }, 0];
  },

  markdownTokenName: 'footnoteDefinition',

  markdownTokenizer: {
    name: 'footnoteDefinition',
    level: 'block',
    start(src: string) {
      return src.search(/^\[\^[^\]\s]+\]:/m);
    },
    tokenize(src: string, _tokens: unknown, lexer: { blockTokens(src: string): any[] }): any {
      const first = DEFINITION_START.exec(src);
      if (!first) {
        return undefined;
      }
      const lines = src.split('\n');
      const content: string[] = [lines[0].slice(first[0].length)];
      let consumed = 1;
      // Add the lines that are indented. A blank line belongs to the footnote when an indented line follows.
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') {
          const next = lines.slice(i + 1).find((candidate) => candidate.trim() !== '');
          if (next !== undefined && /^(?: {2,}|\t)/.test(next)) {
            content.push('');
            continue;
          }
          break;
        }
        if (!/^(?: {2,}|\t)/.test(line)) {
          break;
        }
        content.push(line.replace(/^(?: {1,4}|\t)/, ''));
        consumed = i + 1;
      }
      const raw = lines.slice(0, consumed).join('\n') + (consumed < lines.length ? '\n' : '');
      return {
        type: 'footnoteDefinition',
        raw,
        id: first[1],
        tokens: lexer.blockTokens(content.join('\n')),
      };
    },
  } as any,

  parseMarkdown(token: any, helpers: any) {
    const parseBlockChildren = helpers.parseBlockChildren ?? helpers.parseChildren;
    const children = parseBlockChildren(token.tokens ?? []);
    return helpers.createNode(
      'footnoteDefinition',
      { id: token.id },
      children.length > 0 ? children : [{ type: 'paragraph' }],
    );
  },

  renderMarkdown(node, h) {
    if (!node.content) {
      return `[^${node.attrs?.id ?? ''}]:`;
    }
    const out: string[] = [];
    node.content.forEach((child, index) => {
      const lines = (h.renderChild?.(child, index) ?? h.renderChildren([child])).split('\n');
      if (index === 0) {
        // A note that has no text yet is written without a space at the end of the line.
        const head = `[^${node.attrs?.id ?? ''}]:`;
        out.push(lines[0] === '' ? head : `${head} ${lines[0]}`);
        out.push(...lines.slice(1).map((line) => (line === '' ? '' : `    ${line}`)));
      } else {
        out.push('', ...lines.map((line) => (line === '' ? '' : `    ${line}`)));
      }
    });
    return out.join('\n');
  },

  addCommands() {
    return {
      insertFootnote:
        () =>
        ({ state, dispatch, tr }) => {
          const ids = new Set<string>();
          state.doc.descendants((node) => {
            if (node.type.name === 'footnoteRef' || node.type.name === 'footnoteDefinition') {
              ids.add(String(node.attrs.id));
            }
          });
          let n = 1;
          while (ids.has(String(n))) {
            n++;
          }
          const id = String(n);
          const refType = state.schema.nodes.footnoteRef;
          const defType = state.schema.nodes.footnoteDefinition;
          const paragraph = state.schema.nodes.paragraph;
          if (!dispatch) {
            return true;
          }
          tr.replaceSelectionWith(refType.create({ id }), false);
          const end = tr.doc.content.size;
          tr.insert(end, defType.create({ id }, paragraph.create()));
          // The cursor goes into the new footnote, ready for the text.
          tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size - 2), -1));
          dispatch(tr.scrollIntoView());
          return true;
        },
    };
  },
});

const numbering = new PluginKey<DecorationSet>('rmeFootnoteNumbers');

function buildDecorations(doc: ProseNode): DecorationSet {
  // The first mark of an id gets the next number. This is how GitHub counts footnotes.
  const numbers = new Map<string, number>();
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteRef') {
      const id = String(node.attrs.id);
      if (!numbers.has(id)) {
        numbers.set(id, numbers.size + 1);
      }
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-n': String(numbers.get(id)) }));
    }
  });
  doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteDefinition') {
      const number = numbers.get(String(node.attrs.id));
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          'data-n': number === undefined ? '' : String(number),
          class: number === undefined ? 'is-unused' : '',
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/** Show the number of each footnote. A click on a mark goes to its text, and a click on the number goes back. */
export const FootnoteNumbers = Extension.create({
  name: 'footnoteNumbers',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: numbering,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations: (state) => numbering.getState(state),
          handleClickOn: (view, _pos, node, nodePos, event) => {
            const scrollTo = (type: string, id: string): boolean => {
              let target: number | undefined;
              view.state.doc.descendants((child, pos) => {
                if (target === undefined && child.type.name === type && String(child.attrs.id) === id) {
                  target = pos;
                }
                return target === undefined;
              });
              const dom = target === undefined ? null : view.nodeDOM(target);
              if (dom instanceof HTMLElement) {
                dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
                return true;
              }
              return false;
            };
            if (node.type.name === 'footnoteRef' && (event.metaKey || event.ctrlKey)) {
              return scrollTo('footnoteDefinition', String(node.attrs.id));
            }
            void nodePos;
            return false;
          },
        },
      }),
    ];
  },
});
