import { createLowlight } from 'lowlight';
import { HIGHLIGHT_GRAMMARS } from './highlightGrammars';
import { LINGUIST_LANGUAGES } from './languageCatalog';

export interface LanguageOption {
  /** The name that the editor writes after the opening code fence. */
  id: string;
  /** The name that the picker shows. */
  label: string;
  /** Other names for the same language. */
  aliases?: string[];
}

/** Languages that this editor adds to the languages of GitHub. */
const EXTRA_OPTIONS: LanguageOption[] = [
  // GitHub colors a `jsx` fence with its JavaScript grammar, and the picker says JSX like it says TSX.
  { id: 'jsx', label: 'JSX' },
  // Math is a picture in this editor, not a language of GitHub.
  { id: 'math', label: 'Math (TeX)' },
];

/**
 * Words that people write after a fence but that are not an alias in linguist, mostly file extensions.
 * They keep the label and the colors that an older version of the picker gave them.
 */
const EXTRA_ALIASES: Record<string, string[]> = {
  'c#': ['cs'],
  'c++': ['cc', 'hpp'],
  c: ['h'],
  diff: ['patch'],
  dockerfile: ['docker'],
  elixir: ['ex', 'exs'],
  go: ['golang'],
  haskell: ['hs'],
  html: ['xhtml'],
  javascript: ['mjs', 'cjs'],
  kotlin: ['kt', 'kts'],
  makefile: ['make'],
  markdown: ['md'],
  perl: ['pl'],
  powershell: ['ps1', 'pwsh'],
  python: ['py'],
  ruby: ['rb'],
  rust: ['rs'],
  shell: ['console', 'shellsession'],
  typescript: ['mts', 'cts'],
  yaml: ['yml'],
};

/** The languages in the picker, in the order that it shows them. Any other name can still be typed in. */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  ...LINGUIST_LANGUAGES.map(([label, id, ...aliases]) => ({
    id,
    label,
    aliases: [...new Set([...aliases, ...(EXTRA_ALIASES[id] ?? [])])],
  })),
  ...EXTRA_OPTIONS,
].sort((a, b) => (a.label.toLowerCase() < b.label.toLowerCase() ? -1 : 1));

/** The language is the first word of the text after the opening fence. */
export function languageName(info: string | null | undefined): string {
  return (info ?? '').trim().split(/\s+/)[0] ?? '';
}

/** The option for a name, a fence word or an alias. An exact id wins over an alias of another language. */
function optionFor(name: string): LanguageOption | undefined {
  const lower = name.toLowerCase();
  return (
    LANGUAGE_OPTIONS.find((option) => option.id.toLowerCase() === lower) ??
    LANGUAGE_OPTIONS.find((option) => option.aliases?.some((alias) => alias.toLowerCase() === lower))
  );
}

/** The id of the language in the picker list. An alias such as `ts` gives `typescript`. */
export function canonicalLanguage(info: string | null | undefined): string {
  const name = languageName(info);
  return optionFor(name)?.id ?? name.toLowerCase();
}

/** The picker label for a language name. Unknown names show as they are written. */
export function languageLabel(info: string | null | undefined): string {
  const name = languageName(info);
  if (!name) {
    return 'Plain text';
  }
  return optionFor(name)?.label ?? name;
}

/** The name of the grammar for a word after a fence, when highlight.js gives it another name. */
const GRAMMAR_OF: Record<string, string> = {
  'c#': 'csharp',
  'f#': 'fsharp',
  'objective-c': 'objectivec',
  shell: 'bash',
  // These are markup, and highlight.js has no grammar of its own for them.
  svelte: 'xml',
  vue: 'xml',
};

const lowlight = createLowlight(HIGHLIGHT_GRAMMARS);

function grammarName(language: string): string {
  const name = languageName(language).toLowerCase();
  return GRAMMAR_OF[name] ?? name;
}

/**
 * A highlighter for the code block. It colors only the languages that the
 * block names. A block without a language stays plain, so the editor never guesses.
 */
export const highlighter = {
  highlight: (language: string, value: string) => lowlight.highlight(grammarName(language), value),
  highlightAuto: (value: string) => ({ type: 'root' as const, children: [{ type: 'text' as const, value }] }),
  listLanguages: () => lowlight.listLanguages(),
  registered: (language: string) => lowlight.registered(grammarName(language)),
};
