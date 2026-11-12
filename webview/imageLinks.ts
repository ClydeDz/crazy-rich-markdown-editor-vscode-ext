import { getMarkRange } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { NodeSelection } from '@tiptap/pm/state';

const IMAGE_EXTENSION = /\.(?:apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i;

/**
 * True when a link address points at an image file rather than a page that shows one.
 * The extension is the only test, so a Giphy page URL stays a link.
 */
export function isImageAddress(href: string): boolean {
  const address = href.trim();
  if (!address || address.startsWith('#')) {
    return false;
  }
  if (/^data:image\//i.test(address)) {
    return true;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(address) && !/^https?:/i.test(address)) {
    return false;
  }
  let path: string;
  try {
    path = new URL(address, 'https://rme.invalid/').pathname;
  } catch {
    return false;
  }
  try {
    path = decodeURIComponent(path);
  } catch {
    // A broken escape still has a readable end, so keep the path as it is.
  }
  return IMAGE_EXTENSION.test(path);
}

export interface ImageLink {
  /** The start of the link text. */
  from: number;
  /** The end of the link text. */
  to: number;
  href: string;
  title: string;
  text: string;
}

/**
 * The image link at the cursor, when nothing is selected. A cursor just after a link counts,
 * because a paste leaves it there and ProseMirror keeps the link marks at the end of its text.
 * Text selected inside a link does not: the whole link would change.
 */
export function imageLinkAt(state: EditorState): ImageLink | undefined {
  const linkType = state.schema.marks.link;
  if (!linkType || !state.selection.empty) {
    return undefined;
  }
  const $pos = state.doc.resolve(state.selection.from);
  const mark = $pos.marks().find((candidate) => candidate.type === linkType);
  if (!mark) {
    return undefined;
  }
  const range = getMarkRange($pos, linkType, mark.attrs);
  if (!range || range.from >= range.to) {
    return undefined;
  }
  const href = String(mark.attrs.href ?? '');
  if (!isImageAddress(href)) {
    return undefined;
  }
  return {
    ...range,
    href,
    title: String(mark.attrs.title ?? ''),
    text: state.doc.textBetween(range.from, range.to, ' '),
  };
}

/** Replace an image link with an image node. The link text becomes the alt text. */
export function embedImageLink(editor: Editor, link: ImageLink): boolean {
  const imageType = editor.state.schema.nodes.image;
  if (!imageType) {
    return false;
  }
  const attrs: Record<string, string> = {
    src: link.href,
    alt: link.text === link.href ? '' : link.text,
  };
  if (link.title) {
    attrs.title = link.title;
  }
  const transaction = editor.state.tr.replaceWith(link.from, link.to, imageType.create(attrs));
  // Select the new picture, so its toolbar can edit the alt text and the title.
  transaction.setSelection(NodeSelection.create(transaction.doc, link.from));
  editor.view.dispatch(transaction.scrollIntoView());
  editor.view.focus();
  return true;
}
