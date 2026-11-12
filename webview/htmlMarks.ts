import { Mark } from '@tiptap/core';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Underline from '@tiptap/extension-underline';
import { withoutKeys } from './keymap';

/**
 * GitHub writes underline, subscript and superscript with HTML tags.
 * Markdown has no syntax for them. A custom tokenizer reads `<tag>text</tag>`
 * and keeps the Markdown that sits inside the tag.
 */
function createTokenizer(name: string, tag: string) {
  const open = new RegExp(`<${tag}>`, 'i');
  // The text in the tag needs at least one character that is not a space. A tag with only a space stays HTML.
  const match = new RegExp(`^<${tag}>(\\s*\\S[\\s\\S]*?)</${tag}>`, 'i');
  return {
    name,
    level: 'inline' as const,
    start(src: string) {
      return src.search(open);
    },
    tokenize(src: string, _tokens: unknown, lexer: { inlineTokens(src: string): any[] }): any {
      const found = match.exec(src);
      if (!found) {
        return undefined;
      }
      return {
        type: name,
        raw: found[0],
        text: found[1],
        tokens: lexer.inlineTokens(found[1]),
      };
    },
  };
}

function markdownFor(name: string, tag: string): any {
  return {
    markdownTokenName: name,
    markdownTokenizer: createTokenizer(name, tag),
    parseMarkdown(token: any, helpers: any) {
      return helpers.applyMark(name, helpers.parseInline(token.tokens || []));
    },
    renderMarkdown(node: any, helpers: any) {
      return `<${tag}>${helpers.renderChildren(node)}</${tag}>`;
    },
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    highlight: {
      /** Turn the highlight mark on or off. The file keeps the text in `<mark>`. */
      toggleHighlight: () => ReturnType;
    };
    kbd: {
      /** Turn the keyboard key mark on or off. The file keeps the text in `<kbd>`. */
      toggleKbd: () => ReturnType;
    };
  }
}

/** Highlight. It is written as `<mark>text</mark>`, the form that GitHub shows with a yellow background. */
export const HighlightMark = Mark.create({
  name: 'highlight',
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', HTMLAttributes, 0];
  },
  addCommands() {
    return {
      toggleHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark('highlight'),
    };
  },
  ...markdownFor('highlight', 'mark'),
});

/**
 * A keyboard key. It is written as `<kbd>text</kbd>`, the form that GitHub shows as a key of a keyboard.
 * A `<kbd>` that is already in the file is this mark, so the text can be selected and the key taken away again.
 * The tags around other HTML, such as `<kbd class="x">`, stay an `htmlInline` chip as written.
 */
export const KbdMark = Mark.create({
  name: 'kbd',
  parseHTML() {
    return [{ tag: 'kbd' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['kbd', HTMLAttributes, 0];
  },
  addCommands() {
    return {
      toggleKbd:
        () =>
        ({ commands }) =>
          commands.toggleMark('kbd'),
    };
  },
  ...markdownFor('kbd', 'kbd'),
});

/** Underline. It is written as `<ins>text</ins>`, the form that GitHub shows as underlined text. */
export const UnderlineMark = withoutKeys(Underline).extend({
  parseHTML() {
    return [
      { tag: 'u' },
      { tag: 'ins' },
      {
        style: 'text-decoration',
        consuming: false,
        getAttrs: (style) => ((style as string).includes('underline') ? {} : false),
      },
    ];
  },
  ...markdownFor('underline', 'ins'),
});

/** Subscript. It is written as `<sub>text</sub>`. Text cannot have both subscript and superscript. */
export const SubscriptMark = withoutKeys(Subscript).extend({
  excludes: 'superscript',
  ...markdownFor('subscript', 'sub'),
});

/** Superscript. It is written as `<sup>text</sup>`. */
export const SuperscriptMark = withoutKeys(Superscript).extend({
  excludes: 'subscript',
  ...markdownFor('superscript', 'sup'),
});
