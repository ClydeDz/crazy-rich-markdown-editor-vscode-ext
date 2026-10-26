---
name: real-vscode-test
description: Write or run a test of the editor inside a real VS Code with a real webview (yarn test:vscode). Use when a change depends on VS Code itself (keys, focus, the host and the page talking, the real theme) and the jsdom unit tests cannot show it.
---

# Test in a real VS Code

`yarn test:vscode` builds the extension, opens a real VS Code, and runs `test/vscode/suite.cjs` there. The editor page is a real webview. It uses the VS Code that is installed (`/Applications/Visual Studio Code.app`). Set `VSCODE_EXECUTABLE` for another build.

Run only some tests: `RME_ONLY="text one|text two" yarn test:vscode`. The text must be in the test name. Use this while you work. A full run is slow.

## Which VS Code

- Local: the app in `/Applications`, or the one in `VSCODE_EXECUTABLE`. `RME_DOWNLOAD_VSCODE=1` downloads one into `.vscode-test`.
- CI (`.github/workflows/test.yml`): `run.mjs` downloads VS Code (`VSCODE_VERSION`, default `stable`) and the job runs it under `xvfb-run`. This job runs only on `main` and by hand, never on a pull request. It has not been shown to pass on a GitHub runner yet. A key test may differ on Linux.
- Because a pull request does not run these tests, run them yourself before you open one.

## Two kinds of test in the suite

1. **Host tests** (most of the file): they use `openWithProvider(...)` and `fakePanel()` to test the extension host without a real page. Use these for logic in `src/`.
2. **Real webview tests** (names start with `real webview:`): they use `startRealWebview()`. It gives `{ run, document, panel }`.
   - `run(name, args)` sends a command to the page and waits for the answer. The commands are the `handlers` in `test/vscode/webview-driver.js`. They run inside the page, measure something and return plain JSON.
   - `launchRealWebview(file, content)` opens a file of your choice in its own panel (for example a `.mdx` file, which gets `mdx: true`). Dispose the panel in `finally`. `startRealWebview()` is the shared panel for `doc.md`.
   - `document` is the real text document. Use `document.getText()` to check what was saved. Use `replaceAll(document, text)` to change it.
   - `waitFor(() => condition, 'what you wait for')` waits until a condition is true. Use it for everything that goes through the host (the page sends an edit after a short delay).

## Steps to add a real webview test

1. If the page needs a new probe, add a handler to `handlers` in `test/vscode/webview-driver.js`. Return JSON only. Look at `selectLines` or `lineBlocks` for the style.
2. Add the test to `test/vscode/suite.cjs`, near tests of the same area. Start with `const { run, document } = await startRealWebview();`.
3. Set the content with `run('setContent', { markdown })`, act (`run('click', ...)`, `run('select', ...)`), then check **both** sides: what the page shows (`run('...')`) and what the file has (`document.getText()` inside `waitFor`).
4. Restore the shared document. The real webview tests share one panel and one document. Choose one:
   - A test in the middle of the suite: in a `finally`, do `await sleep(500); await replaceAll(document, REAL_DOC); await run('setContent', { markdown: REAL_DOC });`. Do **not** call `restoreRealDocument()`. It closes the text tab, and VS Code opens it again at the next edit. Later tests then fail (the link click and the link field focus).
   - A key test at the end of the suite may call `restoreRealDocument()`. The last test, "the file stays valid Markdown", needs the document restored.
5. Run it alone: `RME_ONLY="your test name" yarn test:vscode`. Then run the full suite once.
6. If the test covers code that talks to VS Code, add a hand-made break for it in `scripts/mutations.mjs` with `suite: "vscode"` (see the `test-quality-audit` skill).

## Pitfalls

- A `$` in a script that the suite puts into the page breaks the page, because `String.replace` reads `$'` and `$&` as patterns. The real webview then never loads and every real test times out. Use a function replacer, and keep `$` out of `test/key-probe.cjs`.
- A hidden page gets no animation frames. If the text tab of the document becomes the active tab, code that waits for a frame (the link field focus) never runs. This is why tests restore as described above.
- VS Code's own page code calls `preventDefault` for Save, Find, Print, Copy, Paste and Cut. A key is handled by the editor only when it is prevented AND it did not reach the window. A script cannot test "VS Code ran its command", because VS Code forwards only trusted keys.
- A test that waits for a timer or an animation needs `waitFor`, not a fixed `sleep`, except for the 500 ms for the last edit in `finally`.
- Mermaid and KaTeX need time to draw. Use a long timeout for the probe (`run('diagram', {}, 60000)`).

## Report

Say which tests you ran (`RME_ONLY` text or the full suite), how many passed, and what the test proves that a jsdom test could not.
