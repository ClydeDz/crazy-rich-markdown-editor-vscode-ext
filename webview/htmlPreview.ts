/**
 * HTML from the file, shown as HTML the way GitHub and the VS Code preview show it.
 * The editor shows a clean copy in the page and keeps the text of the HTML in the document,
 * so the file comes back as the user wrote it.
 *
 * The copy is parsed in a document that has no window: a script does not run there and a picture
 * does not load. Only the clean nodes move into the page.
 */

/** Elements whose content the page must not show. */
const HIDDEN_TAGS = new Set([
  'applet',
  'base',
  'body',
  'button',
  'embed',
  'form',
  'frame',
  'frameset',
  'head',
  'html',
  'iframe',
  'input',
  'link',
  'meta',
  'noscript',
  'object',
  'option',
  'script',
  'select',
  'style',
  'template',
  'textarea',
  'title',
]);

/** Elements that show something even when they hold no text. Anything else needs text. */
const SHOWING_TAGS = ['img', 'picture', 'video', 'audio', 'canvas', 'svg', 'hr', 'table'];

/** Attributes that hold an address. */
const URL_ATTRIBUTES = new Set(['action', 'formaction', 'href', 'poster', 'src', 'srcset']);

/** An address that must not load in the page. The content security policy blocks these too. */
const UNSAFE_ADDRESS = /^\s*(?:javascript|vbscript|data:text\/html)/i;

const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;

export interface HtmlPreviewOptions {
  /** Map the address of an image or a video to one that the page can load. */
  resolveSrc?: (src: string) => string;
}

/** Resolve the address of each part of a `srcset`. A part is an address and an optional width. */
function resolveSrcset(value: string, resolve: (src: string) => string): string {
  return value
    .split(',')
    .map((part) => {
      const [address, ...rest] = part.trim().split(/\s+/);
      return [resolve(address ?? ''), ...rest].join(' ');
    })
    .join(', ');
}

function cleanAttributes(element: Element, resolve: ((src: string) => string) | undefined): void {
  // Copy the names first: an attribute that goes away changes the list.
  for (const { name, value } of [...element.attributes]) {
    const lower = name.toLowerCase();
    // An event handler would run code from the document on a click or a load.
    if (lower.startsWith('on') || lower === 'srcdoc') {
      element.removeAttribute(name);
      continue;
    }
    if (URL_ATTRIBUTES.has(lower) && UNSAFE_ADDRESS.test(value)) {
      element.removeAttribute(name);
      continue;
    }
    if (!resolve) {
      continue;
    }
    if (lower === 'src') {
      element.setAttribute(name, resolve(value));
    } else if (lower === 'srcset') {
      element.setAttribute(name, resolveSrcset(value, resolve));
    }
  }
}

function cleanParent(parent: Element, resolve: ((src: string) => string) | undefined): void {
  for (const child of [...parent.childNodes]) {
    if (child.nodeType === COMMENT_NODE) {
      // A comment shows nothing, and the editor still keeps it in the text of the document.
      child.remove();
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = child as Element;
    if (HIDDEN_TAGS.has(element.tagName.toLowerCase())) {
      element.remove();
      continue;
    }
    cleanAttributes(element, resolve);
    cleanParent(element, resolve);
  }
}

/**
 * Whether the copy shows anything at all. An empty anchor, a comment and an unknown tag give nothing,
 * and the editor then shows the HTML itself instead.
 */
function showsSomething(holder: Element): boolean {
  if ((holder.textContent ?? '').trim()) {
    return true;
  }
  return SHOWING_TAGS.some((tag) => holder.querySelector(tag) !== null);
}

/**
 * Put a clean copy of `raw` into `target`, and tell whether the HTML shows anything.
 * When it shows nothing, `target` is left empty and the caller shows the HTML as its own text.
 */
export function fillHtmlPreview(target: HTMLElement, raw: string, options: HtmlPreviewOptions = {}): boolean {
  target.replaceChildren();
  if (!raw.trim()) {
    return false;
  }
  const parsed = new DOMParser().parseFromString(raw, 'text/html');
  const holder = document.createElement('div');
  holder.append(...parsed.body.childNodes);
  cleanParent(holder, options.resolveSrc);
  if (!showsSomething(holder)) {
    return false;
  }
  target.append(...holder.childNodes);
  return true;
}
