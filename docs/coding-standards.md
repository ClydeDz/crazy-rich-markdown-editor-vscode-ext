# Coding standards

Prettier enforces the formatting rules in this file. Run `yarn lint` to check formatting. When the code and a rule disagree, follow the surrounding code and tell the user.

## TypeScript

- Both `tsconfig.json` files use `strict`. `yarn typecheck` must pass. Do not add `@ts-ignore`, `@ts-expect-error` or lint switches (there are none now).
- Do not add `any` to new code. Use the real type, or `unknown` and a check. The old `any` marks a gap in the Tiptap types (`this as any`, the `ctx` of `renderMarkdown`). If you need one, keep it to one expression.
- Use named exports. There are no default exports.
- Import order: packages first, then files of this project. Use `import type` for a type that is only a type.
- Start with `const`. Use `let` only when the value changes.
- A pure piece of logic goes in its own small module (`frontMatter.ts`, `textIndent.ts`, `selectedLines.ts`), so a unit test can load it without the editor.

## Style

- Two spaces. Single quotes. Semicolons. Trailing commas in a list that spans lines.
- Parentheses around the one parameter of an arrow function: `(event) =>`.
- Keep a line under about 120 characters. The code has a few longer lines, for example a long sentence in a comment. Do not add more.
- Do not leave commented-out code, `console.log` or a TODO without an owner. There is no `console` call in `src/` or `webview/` now.

## Names

- `camelCase` for functions, variables and file names (`blockHandle.ts`). `PascalCase` for types and Tiptap extensions (`RichCodeBlock`, `BlockHandle`). `UPPER_SNAKE_CASE` for constant tables (`FORMAT_KEYS`, `LINE_BLOCKS`).
- A Tiptap command is `setX`, `toggleX` or `insertX`. Add its type to a `declare module '@tiptap/core'` block, as `codeBlock.ts` and `math.ts` do.
- A CSS class starts with `rme-` and uses `kebab-case` (`rme-block-handle`). The editor owns no class without the prefix, except `.ProseMirror` and `.hljs-*`.

## Comments

- Write in plain English. Short sentences. Say **why**, not what the code already says.
- Put `/** ... */` on an export and on a function that is not obvious. Say what it gives back, and what it does when the input is odd.
- Explain every workaround for VS Code or Tiptap where it is. Name the problem it avoids.
- A comment does not tell the history of a change ("fixed for the bug of Tuesday"). Put that in the pull request.

## The page (webview)

- Build the DOM with `createElement`, `textContent` and `append`. Do not add a UI library.
- `innerHTML` is allowed only for trusted static markup (icons from `icons.ts`) and for the output of KaTeX and mermaid. Never put text from the document into `innerHTML`. A test must show that text with HTML stays text (see `test/frontmatterview.test.mjs`).
- A button is `type="button"`. A button with only an icon has `title` and `aria-label`.
- A button inside or next to the editor calls `preventDefault` on `mousedown`, so the click does not move the cursor.
- A node view, a plugin view or a widget removes its listeners and timers in `destroy`.
- Do not change the Markdown that the user did not edit. A feature that changes how the file is written needs a round trip test (the GFM tests show how).
- A key that the editor handles never reaches VS Code. Follow [shortcuts.md](shortcuts.md).

## CSS

- Colors come from `var(--vscode-*)`, with a fallback when VS Code may lack the variable, or from the `--rme-*` tokens at the top of `styles.css`. Do not hard-code a color, except in the syntax palette (`--hljs-*`, one set for dark and one for light) and in a fallback.
- Check dark, light and high contrast. VS Code puts `vscode-dark`, `vscode-light` or `vscode-high-contrast` on the body.
- Use `[hidden]` rules when a rule sets `display`, because `display` beats the `hidden` attribute.
- Do not use `!important`, except to override a rule of a library that has no hook (the drop cursor).

## The host and the page

- Every message between them has a type in `src/protocol.ts`. Change both sides in one change.
- The page has a strict content security policy with a nonce. Do not load a remote script or style. Do not add an inline script without the nonce.
- Code that talks to VS Code is tested in `test/vscode/suite.cjs`. See [testing.md](testing.md).

## Tests

- Use `node:test` and `node:assert/strict`. Test names are full sentences that state the behavior ("Tab types a tab in a code block").
- One behavior for each test. Give each assertion a message that says what must be true when the message is not obvious.
- Build an editor with `makeEditor`, and `destroy()` it at the end. Close menus that a test opens.
- jsdom has no layout. Stub `getBoundingClientRect` when you need sizes.
- A new or changed test must fail when you break the code. Follow the `prove-test-fails` skill.
- Do not use the network in a test, except the GitHub page check, which skips when offline.

## Text for people

- Text in the page (buttons, titles, messages) is short, plain English in sentence case, without a full stop on a button or title.
- Text in `README.md` and `docs/` is short and direct: active voice, one idea in a sentence, steps as a numbered list.

## Dependencies and files

- Add a package only with `yarn add`. Check that `yarn.lock` names only `registry.yarnpkg.com`. Prefer what is already here (the code block highlighter gave the front matter its colors). Say what a new package adds to the size of the bundle.
- Do not edit `dist/` or the `.vsix` files. Do not add a file outside `src/`, `webview/`, `test/`, `scripts/` and `docs/` without a reason.
