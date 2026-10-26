import { highlightInto } from './highlightDom';
import { icons } from './icons';

/** Color a YAML text with the highlighter of the code block. A text that the highlighter cannot read stays plain. */
export function highlightYaml(target: HTMLElement, text: string): void {
  highlightInto(target, 'yaml', text);
}

export interface FrontMatterView {
  /** Draw the colors again after the text of the field changed. */
  refresh(): void;
}

/**
 * Add two things to the front matter panel:
 * - Colors. A colored copy of the text sits behind the field, and the field has a clear background and clear text.
 * - A trash button to the left of the panel, also when the panel is closed. It shows when the pointer is over the panel.
 */
export function enhanceFrontMatter(
  details: HTMLDetailsElement,
  input: HTMLTextAreaElement,
  options: { onDelete: () => void },
): FrontMatterView {
  const field = document.createElement('div');
  field.className = 'rme-frontmatter-field';
  const pre = document.createElement('pre');
  pre.className = 'rme-frontmatter-colors';
  pre.setAttribute('aria-hidden', 'true');
  const code = document.createElement('code');
  pre.append(code);
  input.replaceWith(field);
  field.append(pre, input);

  const trash = document.createElement('button');
  trash.type = 'button';
  trash.className = 'rme-block-handle-button rme-block-trash rme-frontmatter-trash';
  trash.title = 'Delete the front matter';
  trash.setAttribute('aria-label', 'Delete the front matter');
  trash.innerHTML = icons.trash;
  trash.addEventListener('click', (event) => {
    // The button sits in the summary. Without this, a click would also open or close the panel.
    event.preventDefault();
    event.stopPropagation();
    options.onDelete();
  });
  // A closed panel shows only its summary, so the button lives there.
  (details.querySelector('summary') ?? details).append(trash);

  const refresh = (): void => highlightYaml(code, input.value);
  input.addEventListener('input', refresh);
  refresh();
  return { refresh };
}
