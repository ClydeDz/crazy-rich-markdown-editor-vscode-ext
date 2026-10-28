import { Extension, InputRule, Node } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { EMOJI_DATA } from './emojiData';
import { createSuggestionRenderer } from './suggestionMenu';

export interface EmojiEntry {
  emoji: string;
  /** The codes that GitHub uses, without the colons. The first one is the main code. */
  names: string[];
}

export const EMOJI: EmojiEntry[] = EMOJI_DATA.split('\n').map((line) => {
  const [emoji, ...names] = line.split(' ');
  return { emoji, names };
});

const BY_NAME = new Map<string, string>();
for (const entry of EMOJI) {
  for (const name of entry.names) {
    BY_NAME.set(name, entry.emoji);
  }
}

/** The emoji for a code such as `smile`, or undefined when GitHub has no such code. */
export function emojiFor(name: string): string | undefined {
  return BY_NAME.get(name);
}

export interface EmojiMatch {
  name: string;
  emoji: string;
}

/** Find emoji for the text after a colon. Codes that start with the text come first. */
export function searchEmoji(query: string, limit = 8): EmojiMatch[] {
  const q = query.toLowerCase();
  if (q.length < 2) {
    return [];
  }
  const starts: EmojiMatch[] = [];
  const contains: EmojiMatch[] = [];
  for (const entry of EMOJI) {
    const startsWith = entry.names.find((name) => name.startsWith(q));
    if (startsWith) {
      starts.push({ name: startsWith, emoji: entry.emoji });
      continue;
    }
    const includes = entry.names.find((name) => name.includes(q));
    if (includes) {
      contains.push({ name: includes, emoji: entry.emoji });
    }
  }
  return [...starts, ...contains].slice(0, limit);
}

/** An emoji code such as `:smile:`. The editor shows the emoji. The file keeps the code, as GitHub does. */
export const Emoji = Node.create({
  name: 'emoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { name: { default: 'smile' } };
  },

  parseHTML() {
    return [{ tag: 'span[data-emoji]', getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute('data-emoji') }) }];
  },

  renderHTML({ node }) {
    return [
      'span',
      { class: 'rme-emoji', 'data-emoji': node.attrs.name, title: `:${node.attrs.name}:` },
      emojiFor(node.attrs.name) ?? `:${node.attrs.name}:`,
    ];
  },

  markdownTokenName: 'emoji',

  markdownTokenizer: {
    name: 'emoji',
    level: 'inline',
    start(src: string) {
      return src.indexOf(':');
    },
    tokenize(src: string): any {
      const match = /^:([a-z0-9_+-]+):/.exec(src);
      return match && BY_NAME.has(match[1]) ? { type: 'emoji', raw: match[0], name: match[1] } : undefined;
    },
  } as any,

  parseMarkdown(token: any, helpers: any) {
    return helpers.createNode('emoji', { name: token.name });
  },

  renderMarkdown(node) {
    return `:${node.attrs?.name ?? ''}:`;
  },

  addInputRules() {
    return [
      new InputRule({
        // The closing colon of a code, for example the last colon in ":tada:".
        find: /:([a-z0-9_+-]+):$/,
        handler: ({ state, range, match }) => {
          const name = match[1];
          if (!BY_NAME.has(name)) {
            return null;
          }
          const code = state.schema.marks.code;
          if (code && state.doc.rangeHasMark(range.from, range.to, code)) {
            return null;
          }
          state.tr.replaceWith(range.from, range.to, this.type.create({ name }));
          return undefined;
        },
      }),
    ];
  },
});

/** A list of emoji that opens when the user types a colon and two letters. */
export function createEmojiMenu(): Extension {
  return Extension.create({
    name: 'rmeEmojiMenu',
    addProseMirrorPlugins() {
      return [
        Suggestion<EmojiMatch, EmojiMatch>({
          editor: this.editor,
          pluginKey: new PluginKey('rmeEmojiMenu'),
          char: ':',
          allowSpaces: false,
          items: ({ query }) => searchEmoji(query),
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent({ type: 'emoji', attrs: { name: props.name } })
              .run();
          },
          render: createSuggestionRenderer<EmojiMatch>({
            describe: (item) => ({ icon: item.emoji, title: `:${item.name}:` }),
            hideWhenEmpty: true,
            className: 'rme-emoji-menu',
          }),
        }),
      ];
    },
  });
}
