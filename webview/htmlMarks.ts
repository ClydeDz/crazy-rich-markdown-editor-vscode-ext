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
