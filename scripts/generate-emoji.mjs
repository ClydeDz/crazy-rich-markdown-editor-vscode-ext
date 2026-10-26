// Writes webview/emojiData.ts from the `gemoji` package, which holds the emoji codes that GitHub uses.
// Run `node scripts/generate-emoji.mjs` again when the package changes.
import { gemoji } from 'gemoji';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = gemoji.map((entry) => `${entry.emoji} ${entry.names.join(' ')}`);

const file = `// This file is made by scripts/generate-emoji.mjs. Do not edit it.
// Each line is an emoji, then the codes that GitHub uses for it, separated by spaces.
export const EMOJI_DATA = ${JSON.stringify(lines.join('\n'))};
`;

await writeFile(path.join(root, 'webview', 'emojiData.ts'), file);
console.log(`Wrote ${lines.length} emoji.`);
