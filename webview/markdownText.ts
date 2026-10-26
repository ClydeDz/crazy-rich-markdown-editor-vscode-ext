const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const ENTITY = /^&(?:[A-Za-z][A-Za-z0-9]{1,31}|#\d{1,7}|#[xX][0-9A-Fa-f]{1,6});/;
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** A footnote label such as `[^1]` or `[^note]`. */
const FOOTNOTE_LABEL = /\[\^[^\]\s]+\]/g;

/** Tell if plain text holds a pair of dollar signs that Markdown would read as math. */
export function looksLikeMath(text: string): boolean {
  return /\$(?![\s$])(?:\\.|[^$\\\n])+?(?<!\s)\$(?!\d)/.test(text);
}

/**
 * Escape the characters of plain text so that Markdown reads them back as the same text.
 * It escapes only what needs it, so the file stays clean: `snake_case`, `a < b` and `R&D` stay as typed.
 *
 * @param lineStart true when the text opens a line, where `#`, `-`, `1.` and `>` start a block.
 */
export function escapeMarkdownText(text: string, lineStart: boolean): string {
  const hasPairedTilde = text.indexOf('~') !== text.lastIndexOf('~');
  // Footnote labels are Markdown syntax that the file must keep, so their brackets get no escape.
  const footnoteBrackets = new Set<number>();
  for (const label of text.matchAll(FOOTNOTE_LABEL)) {
    footnoteBrackets.add(label.index!);
    footnoteBrackets.add(label.index! + label[0].length - 1);
  }
  const looksLikeLink = /\]\(|\]\[|\]:/.test(text.replace(FOOTNOTE_LABEL, ''));
  const dollarsAreMath = looksLikeMath(text);

  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : undefined;
    const next = i + 1 < text.length ? text[i + 1] : undefined;

    switch (ch) {
      case '\\':
        out += next === undefined || ASCII_PUNCTUATION.test(next) ? '\\\\' : '\\';
        break;
      case '`':
        out += '\\`';
        break;
      case '*':
      case '_': {
        const surroundedBySpace = prev !== undefined && next !== undefined && /\s/.test(prev) && /\s/.test(next);
        const insideWord =
          ch === '_' && prev !== undefined && next !== undefined && WORD_CHAR.test(prev) && WORD_CHAR.test(next);
        out += surroundedBySpace || insideWord ? ch : `\\${ch}`;
        break;
      }
      case '~':
        out += hasPairedTilde ? '\\~' : ch;
        break;
      case '[':
      case ']':
        out += looksLikeLink && !footnoteBrackets.has(i) ? `\\${ch}` : ch;
        break;
      case '$':
        out += dollarsAreMath ? '\\$' : ch;
        break;
      case '\u00a0':
        out += '&nbsp;';
        break;
      case '<':
        out += next !== undefined && /[A-Za-z/!?]/.test(next) ? '\\<' : ch;
        break;
      case '&':
        out += ENTITY.test(text.slice(i)) ? '\\&' : ch;
        break;
      default:
        out += ch;
    }
  }

  return lineStart ? escapeLineStart(out) : out;
}

/** Escape text at the start of a line that Markdown would read as a block. */
function escapeLineStart(text: string): string {
  return text
    .replace(/^(#{1,6})(?=[ \t]|$)/, '\\$1')
    .replace(/^>/, '\\>')
    .replace(/^([-+])(?=[ \t]|$)/, '\\$1')
    .replace(/^(\d{1,9})([.)])(?=[ \t]|$)/, '$1\\$2')
    .replace(/^([-=_])(?=\1*\s*$)/, '\\$1');
}

/**
 * Remove extra blank lines between blocks. Blank lines inside code fences stay as they are.
 */
export function tidyMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let fence: string | undefined;
  let blankRun = 0;

  for (const line of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === undefined) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) {
        fence = undefined;
      }
    }

    if (fence === undefined && line.trim() === '') {
      blankRun++;
      if (blankRun > 1) {
        continue;
      }
      out.push('');
      continue;
    }

    blankRun = 0;
    out.push(line);
  }

  return out.join('\n');
}
