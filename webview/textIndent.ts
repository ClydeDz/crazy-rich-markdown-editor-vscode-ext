/** One level of indent. YAML does not allow a tab for indent, so the front matter uses spaces. */
export const INDENT = '  ';

/** A change of a plain text field: replace `from` to `to` with `text`, then select `selectStart` to `selectEnd`. */
export interface TextChange {
  from: number;
  to: number;
  text: string;
  selectStart: number;
  selectEnd: number;
}

const lineStart = (value: string, at: number): number => value.lastIndexOf('\n', at - 1) + 1;

function lineEnd(value: string, at: number): number {
  const end = value.indexOf('\n', at);
  return end === -1 ? value.length : end;
}

/**
 * Tab and Shift+Tab.
 * - Tab with a cursor: types the indent at the cursor, and a selection in one line is replaced by it.
 * - Tab with a selection over several lines, and every Shift+Tab: changes the indent of each line that the selection touches.
 * A line that starts where the selection ends is not touched.
 */
export function indentChange(value: string, start: number, end: number, outdent: boolean): TextChange {
  const multiLine = value.slice(start, end).includes('\n');
  if (!outdent && !multiLine) {
    return { from: start, to: end, text: INDENT, selectStart: start + INDENT.length, selectEnd: start + INDENT.length };
  }
  const from = lineStart(value, start);
  // A selection that ends right after a line break does not touch the next line.
  const to = lineEnd(value, end > start && value[end - 1] === '\n' ? end - 1 : end);
  const lines = value.slice(from, to).split('\n');
  const changes = lines.map((line) => {
    if (!outdent) {
      return { line: INDENT + line, shift: INDENT.length };
    }
    const lead = /^ {1,2}/.exec(line)?.[0].length ?? (line.startsWith('\t') ? 1 : 0);
    return { line: line.slice(lead), shift: -lead };
  });
  const text = changes.map((change) => change.line).join('\n');
  // The selection keeps its text: the start moves with the first line, and the end with all the lines.
  const total = changes.reduce((sum, change) => sum + change.shift, 0);
  const selectStart = Math.max(from, start + changes[0].shift);
  const selectEnd = Math.max(selectStart, end + total);
  return { from, to, text, selectStart, selectEnd };
}

/**
 * Enter keeps the indent of the line. After a line that ends with a colon, the new line has one more level.
 * It gives `undefined` for a selection, which the field replaces in the usual way.
 */
export function newLineChange(value: string, start: number, end: number): TextChange | undefined {
  const begin = lineStart(value, start);
  const before = value.slice(begin, start);
  const indent = /^[ \t]*/.exec(before)?.[0] ?? '';
  const deeper = /:[ \t]*$/.test(before) ? INDENT : '';
  const text = `\n${indent}${deeper}`;
  return { from: start, to: end, text, selectStart: start + text.length, selectEnd: start + text.length };
}

/**
 * Do a change in a text field. The change goes through the edit command of the browser when it can,
 * so that the undo key of the field still works. A page without that command (a test) gets the plain change.
 */
export function applyTextChange(area: HTMLTextAreaElement, change: TextChange): void {
  area.setSelectionRange(change.from, change.to);
  const done = typeof document.execCommand === 'function' && document.execCommand('insertText', false, change.text);
  if (!done) {
    area.setRangeText(change.text, change.from, change.to, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
  area.setSelectionRange(change.selectStart, change.selectEnd);
}
