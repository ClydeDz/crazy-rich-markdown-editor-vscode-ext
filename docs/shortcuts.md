# Keyboard shortcuts

The editor must not take keys that VS Code needs, and the keys must stay intuitive.

- `FORMAT_KEYS` in `webview/shortcuts.ts` is the one key table. The toolbar, `FormatKeymap` (`webview/keymap.ts`) and the shortcuts window read it. To add or change a key, edit `FORMAT_KEYS` or the lists in that file.
- These keys stay free for VS Code: Save As (Cmd+Shift+S), Settings (Cmd+,), Run Build Task (Cmd+Shift+B).
- Strikethrough is Cmd+Alt+X, Quote is Cmd+Alt+Q, Code block is Cmd+Alt+E, Subscript is Cmd+Alt+, and Superscript is Cmd+. (Tiptap's Cmd+Alt+C is Copy Path of Active File in VS Code, so the code block drops it).
- Bold, Italic, Underline, Inline code, Link, Undo and Redo keep the usual key on purpose (`SHADOWED_ON_PURPOSE` in `test/vscode/suite.cjs`).
- Find opens the rich editor's own find bar with `Mod+F`. Replace uses `Mod+H` on Windows and Linux, and `Mod+Alt+F` on macOS, where `Mod+H` hides the VS Code window. These keys intentionally replace VS Code's find widget while the custom editor is open.
- Tiptap binds extra keys by itself. `KeymapStarterKit` drops them. The editor handles no key that the shortcuts window does not list, except cursor keys (`ORDINARY` in `test/key-probe.cjs`).
- A key that the editor handles never reaches VS Code, so each extra key takes one from the user.
- After a change, run `yarn test` and `yarn test:vscode`. The probe tests name any extra key. The test against the default key bindings of the installed VS Code names any new overlap.
