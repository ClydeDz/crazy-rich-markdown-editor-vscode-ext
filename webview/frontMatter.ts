export interface FrontMatterSplit {
  /** The text between the two `---` lines, or undefined when the file has no front matter. */
  yaml: string | undefined;
  /** The Markdown after the front matter. */
  body: string;
}

const FRONT_MATTER = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;

/** Split a leading YAML block from the Markdown body. Expects `\n` line endings. */
export function splitFrontMatter(text: string): FrontMatterSplit {
  const match = FRONT_MATTER.exec(text);
  if (!match) {
    return { yaml: undefined, body: text };
  }
  return { yaml: match[1] ?? '', body: text.slice(match[0].length) };
}

/** Put the YAML block back in front of the body. */
export function joinFrontMatter(yaml: string | undefined, body: string): string {
  if (yaml === undefined) {
    return body;
  }
  const inner = yaml.length > 0 ? `${yaml}\n` : '';
  return `---\n${inner}---\n${body}`;
}
