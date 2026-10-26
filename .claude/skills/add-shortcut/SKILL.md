---
name: add-shortcut
description: Add or change a keyboard shortcut of the editor. Use when the user asks for a new key, a different key, or a key that clashes with VS Code. Keeps the key table, the shortcuts window, the README and the key tests in step.
---

# Add or change a shortcut

Read `docs/shortcuts.md` first. The rules: the editor must not take a key that VS Code needs, and the editor handles no key that the shortcuts window does not list.

## Steps

1. Choose the key. Check it against the VS Code default key bindings. Free keys for VS Code stay free: Save As (Cmd+Shift+S), Settings (Cmd+,), Run Build Task (Cmd+Shift+B). Avoid Cmd+Alt+C (Copy Path).
2. Find where the key belongs:
   - A format key (bold, a heading, a list, a block): add it to `FORMAT_KEYS` in `webview/shortcuts.ts`. `FormatKeymap` in `webview/keymap.ts` binds it. Add the command there too.
   - Any other key: add an item to the `EDITING`, `MENUS` or `BLOCKS` list in `webview/shortcuts.ts`, and bind it in the extension that owns the command. The item `label` must say what the key does.
3. If a Tiptap extension binds the same key or an extra key by itself, drop that key (see `KeymapStarterKit` and `withoutKeys` in `webview/keymap.ts`).
4. Add a test in `test/shortcuts.test.mjs`. Use `press(editor, 'Key')` and check the result: the document changed as the label says, and `press` returned true. Test both keyboard shapes (`win` and `mac`) when the key uses Mod.
5. Run `yarn test`. The probe test "the editor handles every listed key ... and no other key" names any extra key. The test about keys for VS Code names any clash.
6. Run `yarn test:vscode`. It checks the key against the real VS Code key bindings. If a clash is on purpose, add it to `SHADOWED_ON_PURPOSE` in `test/vscode/suite.cjs` with the reason, and tell the user.
7. Update the README table or list of shortcuts, and `docs/shortcuts.md` if a rule changed.

## Report

Say which key you chose and why. Say if it clashes with a VS Code key, and on which systems you checked (macOS only unless you tested more). The README says Windows and Linux key checks are not done.
