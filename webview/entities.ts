import type { Editor } from '@tiptap/core';

const NAMED_ENTITY = /&(?!(?:lt|gt|quot|amp);)([A-Za-z][A-Za-z0-9]{1,31});/g;

let decoder: HTMLTextAreaElement | undefined;

/** Turn named entities such as `&copy;` and `&mdash;` into their characters. */
export function decodeNamedEntities(text: string): string {
  if (!text.includes('&')) {
    return text;
  }
  decoder ??= document.createElement('textarea');
  return text.replace(NAMED_ENTITY, (entity) => {
    // A text area reads entities but does not make tags, so this is safe.
    decoder!.innerHTML = entity;
    const decoded = decoder!.value;
    return decoded === entity ? entity : decoded;
  });
}

/**
 * The Markdown parser decodes only a few entities. Others such as `&nbsp;` and `&copy;` stay as text,
 * and the editor would show the entity code. This change decodes them when the text is read.
 * Call this before the editor reads Markdown.
 */
export function patchEntities(editor: Editor): void {
  const manager = editor.markdown as any;
  if (!manager || typeof manager.parseInlineTokens !== 'function') {
    return;
  }
  const original = manager.parseInlineTokens.bind(manager);
  manager.parseInlineTokens = (tokens: any[]) =>
    original(
      tokens.map((token) =>
        token.type === 'text' && typeof token.text === 'string' && token.text.includes('&')
          ? { ...token, text: decodeNamedEntities(token.text) }
          : token,
      ),
    );
}
