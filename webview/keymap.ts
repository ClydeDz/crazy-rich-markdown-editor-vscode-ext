import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FORMAT_KEYS } from './shortcuts';

/**
 * Binds the formatting keys of `FORMAT_KEYS` to the commands of the toolbar buttons.
 * It runs before the other keymaps, so these keys do what the shortcuts window says, and nothing else answers first.
 * The Link key is not here: it opens the link field of the toolbar, so toolbar.ts binds it.
 */
export const FormatKeymap = Extension.create({
  name: 'rmeFormatKeymap',
  priority: 1000,
  addKeyboardShortcuts() {
    const commands = () => this.editor.commands;
    return {
      [FORMAT_KEYS.bold]: () => commands().toggleBold(),
      [FORMAT_KEYS.italic]: () => commands().toggleItalic(),
      [FORMAT_KEYS.underline]: () => commands().toggleUnderline(),
      [FORMAT_KEYS.strike]: () => commands().toggleStrike(),
      [FORMAT_KEYS.code]: () => commands().toggleCode(),
      [FORMAT_KEYS.superscript]: () => commands().toggleSuperscript(),
      [FORMAT_KEYS.subscript]: () => commands().toggleSubscript(),
      [FORMAT_KEYS.h1]: () => commands().toggleHeading({ level: 1 }),
      [FORMAT_KEYS.h2]: () => commands().toggleHeading({ level: 2 }),
      [FORMAT_KEYS.h3]: () => commands().toggleHeading({ level: 3 }),
      [FORMAT_KEYS.bulletList]: () => commands().toggleBulletList(),
      [FORMAT_KEYS.orderedList]: () => commands().toggleOrderedList(),
      [FORMAT_KEYS.taskList]: () => commands().toggleTaskList(),
      [FORMAT_KEYS.blockquote]: () => commands().toggleBlockquote(),
      [FORMAT_KEYS.codeBlock]: () => commands().toggleCodeBlock(),
    };
  },
});

/** Extensions of StarterKit that bring keys of their own. These keys are not in the shortcuts window, so the editor drops them. */
const WITH_UNLISTED_KEYS = new Set(['bold', 'italic', 'strike', 'blockquote', 'heading', 'paragraph']);

/**
 * StarterKit without the keys that it binds by itself.
 *   - Bold, Italic: they also answer to Cmd+Shift+B and Cmd+Shift+I, because Tiptap adds an upper case key for Caps Lock.
 *     That takes keys that VS Code needs, for example Cmd+Shift+B runs the build task. ProseMirror already handles Caps Lock.
 *   - Strike, Blockquote: their keys are the ones that VS Code uses for Save As and Run Build Task.
 *   - Heading, Paragraph: they also bind Alt+4 to Alt+6 and Alt+0, which nothing lists.
 * `FormatKeymap` binds the keys that the window lists. The extensions keep their commands, only the keys go.
 */
export const KeymapStarterKit = StarterKit.extend({
  addExtensions() {
    const extensions = this.parent?.() ?? [];
    return extensions.map((extension) =>
      WITH_UNLISTED_KEYS.has(extension.name) ? extension.extend({ addKeyboardShortcuts: () => ({}) }) : extension,
    );
  },
});

/** Give an extension no keys of its own. */
export const withoutKeys = <T extends { extend: (config: { addKeyboardShortcuts: () => Record<string, never> }) => T }>(extension: T): T =>
  extension.extend({ addKeyboardShortcuts: () => ({}) });
