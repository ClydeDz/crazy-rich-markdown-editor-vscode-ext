export interface TextOffsets {
  start: number;
  end: number;
}

function linePrefixEnd(source: string, start: number): number {
  const lineEnd = source.indexOf('\n', start);
  const end = lineEnd < 0 ? source.length : lineEnd;
  const line = source.slice(start, end);
  let offset = 0;

  while (offset < 3 && line[offset] === ' ') {
    offset++;
  }
  while (line[offset] === '>') {
    offset++;
    if (line[offset] === ' ') {
      offset++;
    }
    let spaces = 0;
    while (spaces < 3 && line[offset] === ' ') {
      offset++;
      spaces++;
    }
  }

  const prefix = /^(?:#{1,6}\s+|(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/.exec(line.slice(offset));
  return prefix ? start + offset + prefix[0].length : start;
}

function isMarkdownDelimiter(source: string, index: number): number {
  const character = source[index];
  if (character !== '*' && character !== '_' && character !== '~' && character !== '`') {
    return index;
  }

  let end = index + 1;
  while (source[end] === character) {
    end++;
  }
  const delimiter = character.repeat(end - index);
  return source.indexOf(delimiter, end) < 0 && source.lastIndexOf(delimiter, index - 1) < 0 ? index : end;
}

function isLinkOpener(source: string, index: number): boolean {
  const closeBracket = source.indexOf(']', index + 1);
  return closeBracket >= 0 && source[closeBracket + 1] === '(' && source.indexOf(')', closeBracket + 2) >= 0;
}

function findLiteralSelectionOffsets(source: string, selected: string): TextOffsets | undefined {
  const normalized: string[] = [];
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];

  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index])) {
      const start = index;
      while (index < source.length && /\s/.test(source[index])) {
        index++;
      }
      normalized.push(' ');
      sourceStarts.push(start);
      sourceEnds.push(index);
    } else {
      normalized.push(source[index]);
      sourceStarts.push(index);
      sourceEnds.push(index + 1);
      index++;
    }
  }

  const start = normalized.join('').indexOf(selected);
  if (start < 0) {
    return undefined;
  }
  return {
    start: sourceStarts[start],
    end: sourceEnds[start + selected.length - 1],
  };
}

/** Find selected visible text in Markdown, accounting for block and inline syntax and normalized whitespace. */
export function findSelectionOffsets(source: string, selection: string): TextOffsets | undefined {
  const selected = selection.replace(/\s+/g, ' ').trim();
  if (!selected) {
    return undefined;
  }

  const literalOffsets = findLiteralSelectionOffsets(source, selected);
  if (literalOffsets) {
    return literalOffsets;
  }

  const normalized: string[] = [];
  const sourceStarts: number[] = [];
  const sourceEnds: number[] = [];
  let lineStart = true;
  for (let index = 0; index < source.length;) {
    if (lineStart) {
      const prefixEnd = linePrefixEnd(source, index);
      if (prefixEnd > index) {
        index = prefixEnd;
      }
      lineStart = false;
    }

    if (source[index] === '\\' && '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'.includes(source[index + 1] ?? '')) {
      index++;
    } else if (source[index] === '[' && isLinkOpener(source, index)) {
      index++;
      continue;
    } else if (source[index] === ']' && source[index + 1] === '(') {
      const destinationEnd = source.indexOf(')', index + 2);
      if (destinationEnd >= 0) {
        index = destinationEnd + 1;
        continue;
      }
    } else {
      const delimiterEnd = isMarkdownDelimiter(source, index);
      if (delimiterEnd > index) {
        index = delimiterEnd;
        continue;
      }
    }

    if (index >= source.length) {
      break;
    }

    if (/\s/.test(source[index])) {
      const start = index;
      while (index < source.length && /\s/.test(source[index])) {
        if (source[index] === '\n') {
          lineStart = true;
        }
        index++;
      }
      normalized.push(' ');
      sourceStarts.push(start);
      sourceEnds.push(index);
    } else {
      normalized.push(source[index]);
      sourceStarts.push(index);
      sourceEnds.push(index + 1);
      index++;
    }
  }

  const start = normalized.join('').indexOf(selected);
  if (start < 0) {
    return undefined;
  }
  return {
    start: sourceStarts[start],
    end: sourceEnds[start + selected.length - 1],
  };
}
