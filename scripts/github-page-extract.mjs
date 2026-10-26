// Fetches the source of the GitHub page "Basic writing and formatting syntax" and finds the Markdown examples on it.
// The page text is read at run time. It is not saved in this project.
// This file has no editor code, so the test in VS Code can use it too.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A local copy of the examples. This file does not exist unless you make it with
 * `yarn check:github-page --out test/fixtures/github-page-examples.json`.
 * The text of the GitHub docs is licensed under CC BY 4.0, so keep the attribution if you keep the file.
 */
export const LOCAL_COPY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'github-page-examples.json');

export const SOURCE =
  'https://raw.githubusercontent.com/github/docs/main/content/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax.md';

/** Find the examples on the page: code blocks, cells of tables, and code spans in the text. */
export function extractExamples(source) {
  const examples = [];
  const lines = source.split('\n');
  let section = '(top)';
  let fence = null;
  let buffer = [];

  const add = (kind, text) => {
    const clean = text.replace(/^\n+|\s+$/g, '');
    // Skip empty text and text with template tags of the docs site.
    if (clean.length === 0 || /\{%|\{\{|%\}/.test(clean)) {
      return;
    }
    examples.push({ section, kind, source: clean });
  };

  for (const line of lines) {
    if (!fence && /^## /.test(line)) {
      section = line.replace(/^## /, '').replace(/\s*\{.*$/, '').trim();
    }
    const open = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !fence) {
      fence = { marker: open[2], info: open[3].trim(), indent: open[1].length };
      buffer = [];
      continue;
    }
    if (fence && line.trim().startsWith(fence.marker)) {
      if (['markdown', 'md', 'text', ''].includes(fence.info)) {
        add('code block', buffer.join('\n'));
      }
      fence = null;
      continue;
    }
    if (fence) {
      buffer.push(line.slice(Math.min(fence.indent, line.length - line.trimStart().length)));
      continue;
    }
    // Cells of a table, and code spans in the text.
    const isTableRow = /^\|/.test(line);
    for (const span of line.matchAll(/(`+)([^`].*?[^`]|[^`])\1(?!`)/g)) {
      const text = span[2].trim();
      // Only code spans that hold Markdown syntax. Plain words in code spans are not examples.
      if (/[*_~`#>\[\]!<:@\\$-]|\d\./.test(text) && text.length > 1) {
        add(isTableRow ? 'table cell' : 'code span', text);
      }
    }
  }
  return examples;
}

/** Fetch the page source and find its examples. It throws when the page cannot be fetched. */
export async function fetchExamples(timeoutMs = 20000) {
  const response = await fetch(SOURCE, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Cannot fetch the page source: HTTP ${response.status}`);
  }
  return extractExamples(await response.text());
}

/** The examples from the local copy when it exists, and otherwise from the page. It throws when neither works. */
export async function loadExamples(localFile = LOCAL_COPY) {
  if (existsSync(localFile)) {
    return JSON.parse(readFileSync(localFile, 'utf8'));
  }
  return fetchExamples();
}
