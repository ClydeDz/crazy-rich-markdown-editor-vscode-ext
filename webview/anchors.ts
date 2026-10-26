/**
 * The anchor that GitHub makes for a heading: lower case, no punctuation, hyphens for spaces.
 * A heading text that appears again gets `-1`, `-2` and so on.
 */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Find the heading that an anchor such as `#my-section` points to. */
export function findHeadingForAnchor(root: ParentNode, anchor: string): HTMLElement | undefined {
  let wanted = anchor.replace(/^#/, '');
  try {
    wanted = decodeURIComponent(wanted);
  } catch {
    // Use the raw text when it has no valid escape.
  }
  wanted = wanted.toLowerCase();

  const seen = new Map<string, number>();
  for (const heading of Array.from(root.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))) {
    const base = headingSlug(heading.textContent ?? '');
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const slug = count === 0 ? base : `${base}-${count}`;
    if (slug === wanted) {
      return heading;
    }
  }
  return undefined;
}
