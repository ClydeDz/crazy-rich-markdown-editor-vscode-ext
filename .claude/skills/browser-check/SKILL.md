---
name: browser-check
description: Look at the editor in the browser harness and test a change with real layout. Use after a change to the page (CSS, layout, hover, drag, front matter, menus) when unit tests in jsdom cannot show it. Not for tests of VS Code itself.
---

# Browser check

The harness (`test/harness`, server on port 5199) shows the built editor with a sample document. jsdom has no layout, so use this for anything that needs sizes, positions, colors or real events.

## Steps

1. Run `yarn build`. The harness serves `dist/`, so an old build shows old code.
2. Pick the document: the default is `sample.md`. Add `?file=sample.mdx` to the address for the MDX sample (the page then sends `mdx: true`). Start the server with `preview_start` and the name `harness` (from `.claude/launch.json`). Keep the `serverId`.
3. Take a screenshot at once. This is required: a pane that nobody sees has width 0 and no animation frames. Without it, `innerWidth` is 0, text wraps one letter per line, and code that waits for a frame never runs.
4. If the page was open before the build, reload it with `preview_eval` and `location.reload()`. Then take another screenshot.
5. Test with `preview_eval`:
   - Measure with `getBoundingClientRect()` and `getComputedStyle()`. Numbers are more exact than a screenshot. Use `preview_inspect` for one element.
   - Send events with `dispatchEvent`: `MouseEvent`, `KeyboardEvent`, and for a drag `DragEvent` with a `new DataTransfer()`.
   - Wait 100 to 300 ms after an event when the code uses `requestAnimationFrame` or a timer.
6. Take a screenshot to see the result. Use `scale` 0.5 to save tokens.
7. Stop the server with `preview_stop`. If you used `preview_resize`, reset it with the preset `desktop`.

## Pitfalls

- The sample document has front matter. A test of "no front matter" must delete it first (the trash button), or reload with another document.
- `execCommand('insertText')` and `execCommand('undo')` work in the harness. Use them to type in the editor or a text field.
- A synthetic event is not a real mouse. Say in your report that you tested with events, and that you did not try a real mouse in VS Code.
- `yarn test:vscode` is the check for the real webview in VS Code. This skill does not replace it.
