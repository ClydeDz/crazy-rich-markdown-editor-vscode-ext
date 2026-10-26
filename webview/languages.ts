import { common, createLowlight } from 'lowlight';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import nginx from 'highlight.js/lib/languages/nginx';
import powershell from 'highlight.js/lib/languages/powershell';
import elixir from 'highlight.js/lib/languages/elixir';
import haskell from 'highlight.js/lib/languages/haskell';
import scala from 'highlight.js/lib/languages/scala';
import dart from 'highlight.js/lib/languages/dart';
import protobuf from 'highlight.js/lib/languages/protobuf';
import latex from 'highlight.js/lib/languages/latex';
import http from 'highlight.js/lib/languages/http';

export interface LanguageOption {
  /** The name that the editor writes after the opening code fence. */
  id: string;
  /** The name that the picker shows. */
  label: string;
  /** Other names for the same language. */
  aliases?: string[];
}

/** The languages in the picker. Any other name can still be typed in. */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: 'bash', label: 'Bash', aliases: ['sh', 'zsh'] },
  { id: 'shell', label: 'Shell session', aliases: ['console', 'shellsession'] },
  { id: 'c', label: 'C', aliases: ['h'] },
  { id: 'cpp', label: 'C++', aliases: ['c++', 'cc', 'hpp'] },
  { id: 'csharp', label: 'C#', aliases: ['cs', 'c#'] },
  { id: 'css', label: 'CSS' },
  { id: 'dart', label: 'Dart' },
  { id: 'diff', label: 'Diff', aliases: ['patch'] },
  { id: 'dockerfile', label: 'Dockerfile', aliases: ['docker'] },
  { id: 'elixir', label: 'Elixir', aliases: ['ex'] },
  { id: 'go', label: 'Go', aliases: ['golang'] },
  { id: 'graphql', label: 'GraphQL', aliases: ['gql'] },
  { id: 'haskell', label: 'Haskell', aliases: ['hs'] },
  { id: 'html', label: 'HTML', aliases: ['xhtml'] },
  { id: 'http', label: 'HTTP' },
  { id: 'ini', label: 'INI', aliases: ['toml'] },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'jsx', 'mjs', 'cjs'] },
  { id: 'json', label: 'JSON', aliases: ['jsonc', 'json5'] },
  { id: 'kotlin', label: 'Kotlin', aliases: ['kt'] },
  { id: 'latex', label: 'LaTeX', aliases: ['tex'] },
  { id: 'lua', label: 'Lua' },
  { id: 'makefile', label: 'Makefile', aliases: ['make'] },
  { id: 'markdown', label: 'Markdown', aliases: ['md'] },
  { id: 'math', label: 'Math (TeX)' },
  { id: 'mermaid', label: 'Mermaid' },
  { id: 'nginx', label: 'Nginx' },
  { id: 'objectivec', label: 'Objective-C', aliases: ['objc'] },
  { id: 'perl', label: 'Perl', aliases: ['pl'] },
  { id: 'php', label: 'PHP' },
  { id: 'powershell', label: 'PowerShell', aliases: ['ps1', 'pwsh'] },
  { id: 'protobuf', label: 'Protocol Buffers', aliases: ['proto'] },
  { id: 'python', label: 'Python', aliases: ['py'] },
  { id: 'r', label: 'R' },
  { id: 'ruby', label: 'Ruby', aliases: ['rb'] },
  { id: 'rust', label: 'Rust', aliases: ['rs'] },
  { id: 'scala', label: 'Scala' },
  { id: 'scss', label: 'SCSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'tsx', 'mts', 'cts'] },
  { id: 'xml', label: 'XML', aliases: ['svg', 'vue'] },
  { id: 'yaml', label: 'YAML', aliases: ['yml'] },
];

/** The language is the first word of the text after the opening fence. */
export function languageName(info: string | null | undefined): string {
  return (info ?? '').trim().split(/\s+/)[0] ?? '';
}

/** The id of the language in the picker list. An alias such as `ts` gives `typescript`. */
export function canonicalLanguage(info: string | null | undefined): string {
  const name = languageName(info).toLowerCase();
  const option = LANGUAGE_OPTIONS.find((item) => item.id === name || item.aliases?.includes(name));
  return option ? option.id : name;
}

/** The picker label for a language name. Unknown names show as they are written. */
export function languageLabel(info: string | null | undefined): string {
  const name = languageName(info);
  if (!name) {
    return 'Plain text';
  }
  const lower = name.toLowerCase();
  const option = LANGUAGE_OPTIONS.find((item) => item.id === lower || item.aliases?.includes(lower));
  return option ? option.label : name;
}

const lowlight = createLowlight(common);
lowlight.register({ dockerfile, nginx, powershell, elixir, haskell, scala, dart, protobuf, latex, http });
lowlight.registerAlias({
  xml: ['vue', 'svelte'],
  json: ['jsonc', 'json5'],
  ini: ['toml'],
  dockerfile: ['docker'],
  powershell: ['pwsh'],
  bash: ['zsh'],
  javascript: ['jsx'],
});

/**
 * A highlighter for the code block. It colors only the languages that the
 * block names. A block without a language stays plain, so the editor never guesses.
 */
export const highlighter = {
  highlight: (language: string, value: string) => lowlight.highlight(languageName(language).toLowerCase(), value),
  highlightAuto: (value: string) => ({ type: 'root' as const, children: [{ type: 'text' as const, value }] }),
  listLanguages: () => lowlight.listLanguages(),
  registered: (language: string) => lowlight.registered(languageName(language).toLowerCase()),
};
