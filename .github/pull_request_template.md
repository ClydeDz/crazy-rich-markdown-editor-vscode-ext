## What and why

<!-- One or two short sentences: what changes, and why. Link the issue or ticket if there is one. -->

## Changes

<!-- A short list of the main changes. Name the files or areas. -->

-

## How it was checked

Tick a box only when you ran the check and it passed. Leave a box open and say why when you did not run it.

- [ ] `yarn lint` passes
- [ ] `yarn typecheck` passes
- [ ] `yarn test` passes (number of tests: )
- [ ] `yarn test:vscode` passes, or the change does not touch the host, the real webview or keys (CI runs these tests only on `main`, not on this pull request)
- [ ] Every new or changed test failed when I broke the code on purpose, and I restored the code (`prove-test-fails`)
- [ ] I looked at UI changes in the browser harness (`browser-check`), or the change has no UI
- [ ] A keyboard shortcut change keeps the key tests and the shortcuts window in step (`add-shortcut`), or there is no shortcut change
- [ ] A change to the slash menu updates its tests and the README (`add-slash-item`), or there is none
- [ ] A change to parsing or writing Markdown or MDX has a round trip test: the file comes back as it was written

## Project rules

- [ ] I used Yarn. There is no `package-lock.json`, and `yarn.lock` names only `registry.yarnpkg.com`
- [ ] The README and `docs/` match the change
- [ ] `yarn package` still makes a package of 30 files (no `docs/`, `.claude/` or `.vsix` files inside)
- [ ] No placeholder or secret was added (`webview/about.ts` links stay as the owner set them)

## Not done or not checked

<!-- Be plain. For example: "Not tried with a real mouse in VS Code." Write "Nothing." if all is checked. -->

## Screenshots

<!-- For a UI change: before and after. Delete this section if there is no UI change. -->
