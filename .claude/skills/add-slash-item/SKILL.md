---
name: add-slash-item
description: Add or change an item of the slash menu (the menu that opens when the user types / at the start of a line). Use when the user asks for a new block or command in the slash menu. Keeps the item, its tests and the README in step.
---

# Add a slash menu item

The menu is in `webview/slashMenu.ts` (`createItems`). Each item has `title`, `description`, `keywords`, `icon` and `run(editor, range)`. The list order is the order on the screen.

## Steps

1. Decide where the item goes in the list. Put a new block near the blocks that are like it. The expected order is in `test/slash.test.mjs` ("typing a slash at the start of a line opens the menu with every item").
2. Add the item to `createItems` in `webview/slashMenu.ts`:
   - `title`: short, with a capital at the start. It is the name the test uses.
   - `keywords`: words the user may type to find it (`yaml metadata header` for Front matter). The search matches the title and the keywords.
   - `icon`: a string from `icons` in `webview/icons.ts`. Add a new icon there if needed.
   - `run`: start from `chain(e, r)`. It focuses the editor and deletes the typed `/` and the search text. Then add your command. The slash must be gone after the item runs.
3. If the item needs the page (a file picker, the front matter panel), do not import `main.ts`. Add an optional callback to `SlashMenuOptions`, and pass it in `webview/main.ts` where `createSlashMenu` is called. An item that needs a callback must be left out when the callback is missing, so the tests that do not pass it keep working (see the Front matter item).
4. If the item is only for MDX files, show it only when `options.mdx` is true (see **MDX code**), and make sure the node it adds exists only in an MDX editor.
5. If the item must show only sometimes, give it `available: () => boolean`. The menu filters on it each time it opens or the text changes.
6. If the item makes a block through a new command, put the command in the extension of that block (for example `webview/math.ts`), and give it a test there too.
7. Update the tests in `test/slash.test.mjs`:
   - the expected list of titles, in order;
   - one row in `CASES` that checks what the first block of the document is after the item runs;
   - a test of the search: type `/` and a keyword, and check that `titles()` gives the item.
8. The toolbar More menu is separate. Do not add the item there unless the user asks. A test in `test/toolbar.test.mjs` fixes the More menu to the blocks it has now.
9. Update the README: the list in the "Slash menu" section, and the section of the feature if it has one.
10. Run `yarn typecheck` and `yarn test`. If the item draws something with layout, use the `browser-check` skill.

## Report

Say what the item is called, where it sits in the list, and which test covers it. Say if you did not test it in a real VS Code.
