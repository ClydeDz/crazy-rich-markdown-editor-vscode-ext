// Chooses how the editor dropdown of VS Code names this editor. It changes package.json.
//
//   node scripts/set-menu-style.mjs single   The menu shows "Crazy Rich Markdown Editor" once.
//                                            The extension is named "Built-in" in the Extensions list.
//   node scripts/set-menu-style.mjs named    The menu shows "Rich Text - Crazy Rich Markdown Editor".
//                                            The extension has its real name in the Extensions list.
//
// VS Code writes "<editor name> - <extension name>" for each editor in the menu. It leaves out the second part
// only when the extension name is "Built-in". After a change, run `yarn package` and install the new file.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DESCRIPTION =
  'edit Markdown files as rich text with a floating formatting toolbar. Supports GitHub Flavored Markdown, and keeps the code of MDX files as it is. The file stays raw Markdown on disk.';

export const STYLES = {
  single: {
    displayName: 'Built-in',
    description: `Crazy Rich Markdown Editor: ${DESCRIPTION}`,
    editorName: 'Crazy Rich Markdown Editor',
    openTitle: 'Open in Crazy Rich Markdown Editor',
  },
  named: {
    displayName: 'Crazy Rich Markdown Editor',
    description: `Edit Markdown files as rich text with a floating formatting toolbar. Supports GitHub Flavored Markdown, and keeps the code of MDX files as it is. The file stays raw Markdown on disk.`,
    editorName: 'Rich Text',
    openTitle: 'Open in Rich Text Editor',
  },
};

/** Change a manifest to a style. It returns the new manifest. */
export function applyMenuStyle(manifest, style) {
  const values = STYLES[style];
  if (!values) {
    throw new Error(`Unknown style "${style}". Use "single" or "named".`);
  }
  const next = structuredClone(manifest);
  next.displayName = values.displayName;
  next.description = values.description;
  // Every editor (Markdown and MDX) has the same name in the menu.
  for (const editor of next.contributes.customEditors) {
    editor.displayName = values.editorName;
  }
  for (const command of next.contributes.commands) {
    if (command.command === 'crazyRichMarkdown.openRich') {
      command.title = values.openTitle;
    }
  }
  return next;
}

/** The text of the menu item that VS Code makes for the editor. */
export function menuItemText(manifest) {
  const editor = manifest.contributes.customEditors[0].displayName;
  return manifest.displayName === 'Built-in' ? editor : `${editor} - ${manifest.displayName}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  const style = process.argv[2];
  if (!style) {
    console.log(`Now: menu item "${menuItemText(manifest)}". Use "single" or "named" to change it.`);
  } else {
    const next = applyMenuStyle(manifest, style);
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    console.log(`Style "${style}": the menu item is "${menuItemText(next)}". Run "yarn package" and install the new file.`);
  }
}
