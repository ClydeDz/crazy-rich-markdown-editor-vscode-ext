# Editor internals

## Tiptap commands

- Inside a command, `props.state` keeps the document from the start of the command. After a nested `props.commands.x()` it is stale. Read `props.tr.doc` and `props.tr.selection`.
- `editor.commands.foo()` dispatches the transaction even when the command returns false. Change the transaction only on the success path.
- `clearNodes()` lifts list items.
- Several selected lines become one block through `webview/selectedLines.ts` (`replaceSelectedLines`). The code block, math block and diagram commands use it.

## Markdown

- The Markdown parser has read plain text before the editor sees it. A backslash before punctuation (`\,` `\;` `\{` `\\`) is gone, and `<br/>` is a hard break. Text that a command takes from a paragraph cannot get these back.
- Inline atoms: `mathInline`, `emoji`, `footnoteRef`, `htmlInline`.

## Parts outside the document

- Front matter is not in the ProseMirror document. `webview/main.ts` splits it from the body and keeps it in a panel above the editor. `webview/frontMatterView.ts` colors it (YAML) and draws its trash button. `webview/textIndent.ts` does Tab and Enter in the field. YAML needs spaces, so Tab types two spaces.
- A file has at most one front matter block. The slash item **Front matter** shows only while there is none.
- `webview/blockHandle.ts` draws the grip and the trash button at the left of a top level block. A dropped block lands between top level blocks, never inside a list. The page padding at the left (`#app` in `styles.css`) leaves room for it.
- A tab in code is two columns wide (`tab-size` in `styles.css`).

## Layout

- A code block header holds the language button. `RichCodeBlock` in `webview/codeBlock.ts` binds Tab and Shift+Tab, and drops Tiptap's Cmd+Alt+C.

## MDX

- A `.mdx` file opens with the view type `richMarkdown.mdxEditor` (priority `option`, so it is in "Open With" and not the default). It is the same provider. The host sends `mdx: true` in the `init` message, and `createEditor({ mdx: true })` adds `MdxBlock` and `MdxInline` (`webview/mdx.ts`). A `.md` file never gets them.
- `scanMdxBlock` finds a block at the start of the text: an `import` or `export` run, one or more JSX elements and `{expressions}` that follow each other, or an expression. A block starts at the start of a line and nothing may follow it on its last line. It never matches in the middle of a paragraph (`start: () => -1`).
- The scanner reads over strings, templates, comments, brackets, `{ }` groups in attributes and children, HTML comments, and backticks in children. A lone apostrophe in JSX text must not start a string (a string stops at the end of its line).
- When a block is not complete (a tag that never closes), the scanner gives up, and the Markdown parser reads the text as before.
- Every MDX block has the label `MDX_LABEL` (`MDX code`). The editor does not tell an import from a component. The slash item **MDX code** (only when `mdx` is true) adds an empty block and focuses its text box (`focusEmptyMdxBlock`). An empty block writes nothing to the file.
- `createRawBlock` in `rawBlocks.ts` makes the node. It keeps the exact text (`raw`) and writes it back. With `language`, the text box has a colored copy behind it (`highlightInto` in `highlightDom.ts`).
- Round trip is the rule. Add a sample to `SAMPLES` in `test/mdx.test.mjs` for each new case.
- Not done: rendering a component, and editing the Markdown inside a component as rich text. The editor cannot run project code.
