import { highlighter } from './languages';

/** The parts of the tree that the highlighter gives. */
interface HastNode {
  type: string;
  value?: string;
  properties?: { className?: string[] | string };
  children?: HastNode[];
}

function toDom(node: HastNode): globalThis.Node {
  if (node.type === 'text') {
    return document.createTextNode(node.value ?? '');
  }
  const element = document.createElement('span');
  const className = node.properties?.className;
  element.className = Array.isArray(className) ? className.join(' ') : (className ?? '');
  for (const child of node.children ?? []) {
    element.append(toDom(child));
  }
  return element;
}

/**
 * Color a text with the highlighter of the code block, and put the result in `target`. It only makes text and spans.
 * A language that the highlighter does not know, or a text that it cannot read, stays plain.
 */
export function highlightInto(target: HTMLElement, language: string, text: string): void {
  let children: HastNode[];
  try {
    children = (highlighter.highlight(language, text) as HastNode).children ?? [];
  } catch {
    children = [{ type: 'text', value: text }];
  }
  // A last empty line needs a character, or the colored copy is one line shorter than the field.
  target.replaceChildren(...children.map(toDom), document.createTextNode(text.endsWith('\n') || text === '' ? '\n' : ''));
}
