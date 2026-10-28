// Finds the places in TypeScript or JavaScript code where a small change breaks the behavior ("mutants").
// scripts/mutation-check.mjs applies one mutant at a time, runs the tests, and reports the mutants that no test noticed.
import { transformSync } from 'esbuild';

const KEYWORDS_BEFORE_REGEX = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'delete',
  'void',
  'throw',
  'new',
  'else',
  'yield',
  'await',
]);
const SYMBOLS_BEFORE_REGEX = new Set([
  '',
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '<',
  '>',
  '~',
  '^',
]);

function skipString(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote && source[i] !== '\n') {
    i += source[i] === '\\' ? 2 : 1;
  }
  return Math.min(i + 1, source.length);
}

function skipRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && source[i] !== '\n') {
    if (source[i] === '\\') {
      i += 2;
      continue;
    }
    if (source[i] === '[') inClass = true;
    else if (source[i] === ']') inClass = false;
    else if (source[i] === '/' && !inClass) {
      i++;
      while (i < source.length && /[a-z]/i.test(source[i])) i++;
      return i;
    }
    i++;
  }
  return i;
}

/** A template literal is text, but the code in `${...}` is code. */
function skipTemplate(source, mask, start) {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === '\\') {
      i += 2;
    } else if (source[i] === '`') {
      return i + 1;
    } else if (source[i] === '$' && source[i + 1] === '{') {
      i = scan(source, mask, i + 2, true) + 1;
    } else {
      i++;
    }
  }
  return i;
}

function scan(source, mask, start, untilBrace) {
  let i = start;
  let depth = 0;
  let last = '';
  let word = '';
  let lastWord = '';
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      i = skipString(source, i);
      last = '"';
      word = lastWord = '';
      continue;
    }
    if (c === '`') {
      i = skipTemplate(source, mask, i);
      last = '"';
      word = lastWord = '';
      continue;
    }
    if (c === '/' && (SYMBOLS_BEFORE_REGEX.has(last) || KEYWORDS_BEFORE_REGEX.has(word || lastWord))) {
      i = skipRegex(source, i);
      last = '"';
      word = lastWord = '';
      continue;
    }
    if (untilBrace) {
      if (c === '{') depth++;
      else if (c === '}') {
        if (depth === 0) return i;
        depth--;
      }
    }
    mask[i] = 1;
    if (/[\w$]/.test(c)) {
      word += c;
      last = 'w';
    } else {
      if (word) {
        lastWord = word;
        word = '';
      }
      if (!/\s/.test(c)) {
        lastWord = '';
        last = c;
      }
    }
    i++;
  }
  return i;
}

/** An array with 1 for every character that is code, and 0 for strings, comments, regular expressions and template text. */
export function codeMask(source) {
  const mask = new Uint8Array(source.length);
  scan(source, mask, 0, false);
  return mask;
}

/** The position of the `)` that closes the `(` at `open`, looking at code only. */
function closingParen(source, mask, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (!mask[i]) continue;
    if (source[i] === '(') depth++;
    else if (source[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

const balanced = (text) =>
  ['()', '[]', '{}'].every(([open, close]) => text.split(open).length === text.split(close).length);

/**
 * Every mutant of a source text: { start, end, replacement, operator, line }.
 * The operators are the usual ones: swap a comparison, swap && and ||, flip a boolean, change a number by one,
 * remove a `!`, negate an `if` condition, and delete a statement.
 */
export function findMutants(source) {
  const mask = codeMask(source);
  const lineAt = (index) => source.slice(0, index).split('\n').length;
  const mutants = [];
  const add = (start, end, replacement, operator) =>
    mutants.push({ start, end, replacement, operator, line: lineAt(start) });
  const allCode = (start, end) => {
    for (let i = start; i < end; i++) if (!mask[i]) return false;
    return true;
  };
  const each = (pattern, operator, replace) => {
    for (const match of source.matchAll(pattern)) {
      if (allCode(match.index, match.index + match[0].length)) {
        add(match.index, match.index + match[0].length, replace(match), operator);
      }
    }
  };

  each(/===/g, 'equal to not equal', () => '!==');
  each(/!==/g, 'not equal to equal', () => '===');
  each(/&&(?!=)/g, 'and to or', () => '||');
  each(/\|\|(?!=)/g, 'or to and', () => '&&');
  each(/ < /g, 'less than to less or equal', () => ' <= ');
  each(/ <= /g, 'less or equal to less than', () => ' < ');
  each(/ > /g, 'greater than to greater or equal', () => ' >= ');
  each(/ >= /g, 'greater or equal to greater than', () => ' > ');
  each(/\btrue\b/g, 'true to false', () => 'false');
  each(/\bfalse\b/g, 'false to true', () => 'true');
  each(/(?<![\w$.])\d+(?![\w$.])/g, 'number plus one', (match) => String(Number(match[0]) + 1));
  each(/(?<![=!<>])!(?=[\w$(])/g, 'remove not', () => '');
  each(/ \+ 1\b/g, 'plus one to minus one', () => ' - 1');
  each(/ - 1\b/g, 'minus one to plus one', () => ' + 1');

  for (const match of source.matchAll(/\bif \(/g)) {
    const open = match.index + match[0].length - 1;
    if (!mask[match.index]) continue;
    const close = closingParen(source, mask, open);
    if (close > 0) add(open + 1, close, `!(${source.slice(open + 1, close)})`, 'negate if');
  }

  let offset = 0;
  for (const text of source.split('\n')) {
    const code = text.trim();
    const indent = text.length - text.trimStart().length;
    if (
      mask[offset + indent] &&
      code.endsWith(';') &&
      balanced(code) &&
      /^(?:[\w$.]+(?:\[[^\]]*\])?\(.*\)|[\w$.]+ [-+*/]?= .+);$/.test(code) &&
      !/^(?:return|const|let|var|throw|import|export)\b/.test(code)
    ) {
      add(offset + indent, offset + text.length, '', 'delete statement');
    }
    offset += text.length + 1;
  }
  return mutants;
}

export function applyMutant(source, mutant) {
  return source.slice(0, mutant.start) + mutant.replacement + source.slice(mutant.end);
}

/**
 * True when esbuild can read the text. A mutant that breaks the syntax would fail every test for a trivial reason.
 * A file that is not TypeScript or JavaScript (for example CSS) is not checked.
 */
export function isValidSyntax(code, file) {
  const loader = file.endsWith('.ts') ? 'ts' : /\.[cm]?js$/.test(file) ? 'js' : undefined;
  if (!loader) {
    return true;
  }
  try {
    transformSync(code, { loader, logLevel: 'silent' });
    return true;
  } catch {
    return false;
  }
}

/** A fixed pseudo-random order, so that the same seed always picks the same mutants. */
export function seededShuffle(items, seed) {
  const result = [...items];
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** One line that shows the change, for the report. */
export function describeMutant(source, mutant) {
  const line = source.split('\n')[mutant.line - 1] ?? '';
  const before = source.slice(mutant.start, mutant.end);
  const short = (text) => (text.length > 70 ? `${text.slice(0, 67)}...` : text).replace(/\s+/g, ' ');
  return `${mutant.operator}: ${short(before) || '(nothing)'} -> ${short(mutant.replacement) || '(nothing)'}   | ${short(line.trim())}`;
}
