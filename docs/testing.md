# Testing

## Layers

- `yarn test` runs `test/*.test.mjs` in jsdom. It needs no VS Code.
- `yarn test:vscode` builds, then runs `test/vscode/suite.cjs` in a real VS Code with a real webview. `RME_ONLY=<text>|<text>` runs only the named tests.
- `yarn mutate` changes the code in temporary copies and checks that a test fails. Keep `--test-concurrency=3` and `--jobs 3`: more makes the machine slow and causes false timeouts. Hand-made changes are in `scripts/mutations.mjs`. A survivor that no test can see goes there with its reason. Do not write a test for it.
- Code that talks to VS Code (a fake panel, a captured listener) needs a test in `test/vscode/suite.cjs` and a hand-made mutant. Logic that can leave the provider goes to a small module (for example `src/refreshQueue.ts`), so a unit test sees it.

## MDX tests

- `test/mdx.test.mjs`: the scanner (`scanMdxBlock`) with its edge cases, a round trip of each sample in `SAMPLES` (the text must come back byte for byte), the boxes and their colors, the package settings (the MDX editor is an option, `.md` stays the default).
- `test/slash.test.mjs`: the **MDX code** item (only in MDX, adds an empty box, focuses it).
- `test/vscode/suite.cjs`: the host sends `mdx: true` for `.mdx` (also in capital letters) and `false` for `.md`; and an MDX file in a real webview shows the boxes and saves the same text.
- A new MDX case: add a sample to `SAMPLES`. If the scanner changes, add a case to the scanner tests, and break the scanner on purpose to see the test fail.
- `test/harness/sample.mdx` and `?file=sample.mdx` show MDX in the browser harness.

## Which VS Code, and CI

- `test/vscode/run.mjs` picks VS Code in this order: `VSCODE_EXECUTABLE`; the app in `/Applications`; on CI (`CI` is set) or with `RME_DOWNLOAD_VSCODE=1`, a download into `.vscode-test` (`VSCODE_VERSION`, default `stable`). On Linux CI it adds `--no-sandbox`, `--disable-gpu` and `--disable-dev-shm-usage`.
- `.github/workflows/test.yml`: the `unit` job (`yarn typecheck`, `yarn test`) runs on every pull request push and on `main`. The `vscode` job (`xvfb-run -a yarn test:vscode`) runs only on `main` and by hand (`workflow_dispatch`). `publish.yml` also runs the unit tests and builds the package.
- The VS Code job has not been shown to pass on a GitHub runner yet. The key tests compare against the default key bindings of the VS Code in use, and Linux keys differ from macOS keys. If a key test fails only on CI, check the key bindings before you change the editor.
- A pull request does not run the real VS Code tests. Run `yarn test:vscode` yourself when the change touches `src/`, the real webview, keys or focus.

## Pitfalls

- jsdom does not throw an error that an event listener throws. `test/helpers.mjs` collects these errors and fails the file at its end.
- Never use `assert.equal(domNodeA, domNodeB)`. A failure prints both jsdom trees and can take over 90 seconds. Use `assert.ok(a === b, message)`.
- jsdom has no layout. A test that needs block heights stubs `getBoundingClientRect` (see `test/blockhandle.test.mjs`).
- A menu that a test leaves open keeps document listeners. Close it in `afterEach`.
- Each test file runs in its own process, and several bundle `webview/editor.ts` at once. `loadModule` writes to `test/.build/<pid>/`. Never use a shared bundle path.
- A child process that a test starts inherits `NODE_TEST_CONTEXT`. Delete it from the environment of the child.
- The VS Code suite puts scripts into the page with `String.replace`. A dollar sign in the script is a replacement pattern. Use a function replacer, and keep `$` out of `test/key-probe.cjs`.
- VS Code's own page code calls `preventDefault` for Save, Find, Print, Copy, Paste and Cut. A key is handled by the editor only when it is prevented AND it did not reach the window.
- A test that needs another file type (MDX) uses `launchRealWebview(file, content)` for its own panel, and disposes the panel at the end. It does not touch the shared document.
- The real-webview tests share one panel and one document. A test that presses keys must restore the document. A test in the middle of the suite restores with `replaceAll` and `run('setContent')`. Only the key tests at the end may call `restoreRealDocument()`, because it closes the text tab.
- A hidden webview gets no animation frames, so code that waits for one never runs. The same holds for the browser harness pane: take a screenshot first to wake it.
- `vsce package` fails when the README has a relative link to a file. `test/publish.test.mjs` checks this.
- GitHub page examples are fetched at run time. Do not store a copy. See [decisions.md](decisions.md).

## No Git: recover a broken file

`dist/webview.js.map` (made by `yarn build`) holds `sourcesContent`: the text of every `webview/*.ts` file at the last build. Read it with node to restore a file. When a script edits a file, make each replace assert that its anchor occurs exactly once.
