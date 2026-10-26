export interface TextChange {
  /** Offset in the old text where the change starts. */
  start: number;
  /** Offset in the old text where the change ends. */
  end: number;
  /** Text that replaces the old range. */
  text: string;
}

/**
 * Find the smallest single range that turns `oldText` into `newText`.
 * Returns undefined when both texts are equal.
 * A small range keeps undo history, diffs and cursors in the source editor stable.
 */
export function minimalChange(oldText: string, newText: string): TextChange | undefined {
  if (oldText === newText) {
    return undefined;
  }

  const maxPrefix = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < maxPrefix && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix++;
  }

  const maxSuffix = maxPrefix - prefix;
  let suffix = 0;
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) === newText.charCodeAt(newText.length - 1 - suffix)
  ) {
    suffix++;
  }

  // Do not split a surrogate pair at the edges of the range.
  if (prefix > 0 && isHighSurrogate(oldText.charCodeAt(prefix - 1))) {
    prefix--;
  }
  if (suffix > 0 && isLowSurrogate(oldText.charCodeAt(oldText.length - suffix))) {
    suffix--;
  }

  return {
    start: prefix,
    end: oldText.length - suffix,
    text: newText.slice(prefix, newText.length - suffix),
  };
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
