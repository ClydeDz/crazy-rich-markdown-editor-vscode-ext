# AGENTS.md

Crazy Rich Markdown Editor: A VS Code extension that opens `.md` files (and `.mdx` files, through "Open With") in a Tiptap/ProseMirror webview and saves plain Markdown. An MDX file keeps its `import`, JSX and `{expression}` parts byte for byte.

## Always

- Use **Yarn 1** (`yarn`, never `npm`). Do not delete `.npmrc` or `.yarnrc`. See [docs/packaging.md](docs/packaging.md).
- Never run `git init` here. This folder has no Git repository on purpose. Tests that need Git use temporary repos (`test/git-helper.cjs`).
- Do not edit `dist/` or the `.vsix` files. `yarn build` makes `dist/`.
- A file that the user wrote must come back from the editor exactly as it was, unless the user changed that part. This holds for Markdown and for MDX. A change to parsing or writing needs a round trip test.

## Commands

| Task                    | Command                                                 |
| ----------------------- | ------------------------------------------------------- |
| Build                   | `yarn build`                                            |
| Typecheck               | `yarn typecheck`                                        |
| Unit tests (jsdom)      | `yarn test`                                             |
| Tests in a real VS Code | `yarn test:vscode` (add `RME_ONLY="<name>"` to run one) |
| Test the tests          | `yarn mutate`                                           |
| Package                 | `yarn package`                                          |

Run `yarn test` before you report a change as done. Run `yarn test:vscode` when you change code that talks to VS Code or the real webview. CI runs the unit tests on every pull request, but the VS Code tests only on `main` (`.github/workflows/test.yml`), so a pull request does not catch a break there.

## Where things are

- `src/`: the extension host (provider, file reading, protocol).
- `webview/`: the editor in the page. `editor.ts` builds it, `main.ts` connects it to the host.
- `test/`: unit tests (`*.test.mjs`) and `test/vscode/` (real webview). `test/harness/` is a browser preview.
- `scripts/`: the mutation tool, the publish checks and the menu-style switch.

## Read before you work on

- Style, naming, comments, DOM and CSS rules: [docs/coding-standards.md](docs/coding-standards.md)
- Tests, the mutation tool, test pitfalls: [docs/testing.md](docs/testing.md)
- Editor code (Tiptap commands, Markdown parsing, front matter, block handle, MDX): [docs/editor-internals.md](docs/editor-internals.md)
- Keyboard shortcuts: [docs/shortcuts.md](docs/shortcuts.md)
- Version bump, package, install, publish: [docs/packaging.md](docs/packaging.md)
- Decisions that are final: [docs/decisions.md](docs/decisions.md)

## Skills

- `/release`: bump the version, package and install it in the local VS Code. It does not publish.
- `browser-check`: look at the editor in the browser harness.
- `add-shortcut`: add or change a keyboard shortcut.
- `add-slash-item`: add or change an item of the slash menu.
- `test-quality-audit`: check the tests with the mutation tool (`yarn mutate`).
- `real-vscode-test`: write or run a test in a real VS Code (`yarn test:vscode`).
- `prove-test-fails`: after you write or change a test, break the code on purpose and check that the test fails, then restore the code.
- `/create-pr`: run the checks, fill `.github/pull_request_template.md` and open a draft pull request. This folder has no Git repository, so it needs the user's other repo.
