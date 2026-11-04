# Editor internals

## Tiptap commands

- Inside a command, `props.state` keeps the document from the start of the command. After a nested `props.commands.x()` it is stale. Read `props.tr.doc` and `props.tr.selection`.
- `editor.commands.foo()` dispatches the transaction even when the command returns false. Change the transaction only on the success path.
- `clearNodes()` lifts list items.
- Several selected lines become one block through `webview/selectedLines.ts` (`replaceSelectedLines`). The code block, math block and diagram commands use it.

## Markdown

- The Markdown parser has read plain text before the editor sees it. A backslash before punctuation (`\,` `\;` `\{` `\\`) is gone, and `<br/>` is a hard break. Text that a command takes from a paragraph cannot get these back.
- Inline atoms: `mathInline`, `emoji`, `footnoteRef`, `htmlInline`.
- A paste of text is read as Markdown (`webview/pasteMarkdown.ts`): plain text and a pasted code block in the language `markdown` (or `md`) land as Markdown, and one paragraph joins the line at the cursor (`markdownSlice` gives an open slice). Rich text, a code block of another language, files, and a paste inside a raw box (code block, MDX box, table cell) keep the paste they had before.

## Parts outside the document

- Front matter is not in the ProseMirror document. `webview/main.ts` splits it from the body and keeps it in a panel above the editor. `webview/frontMatterView.ts` colors it (YAML) and draws its trash button. `webview/textIndent.ts` does Tab and Enter in the field. YAML needs spaces, so Tab types two spaces.
- A file has at most one front matter block. The slash item **Front matter** shows only while there is none.
- `webview/blockHandle.ts` draws the grip and the trash button at the left of a top level block. A dropped block lands between top level blocks, never inside a list. The page padding at the left (`#app` in `styles.css`) leaves room for it.
- Selecting an image opens a floating toolbar with editable alt text and title fields. They update the image attributes and round-trip to Markdown; videos do not have these fields.
- A tab in code is two columns wide (`tab-size` in `styles.css`).

## Line numbers

- `webview/lineNumbers.ts` draws a number at the left of each line of the file that the page shows on a line of its own. The numbers count the lines of the Markdown file, not the lines of the page, so they need the text of the file: `main.ts` keeps the last text that both sides agree on (`syncedText`) and gives `sourcePosition` its body and the line where that body starts.
- `documentSections` gives each top level block its Markdown from `editor.markdown.serialize` for that node alone, and the lines inside it where a line of the file starts one: each item of a list (also a nested item and a task), each row of a table, and each line of a text block. A text block is cut at a `hardBreak` and at a `\n` in its text, because the page uses `white-space: pre-wrap`; the words of a cut line are its text, and a picture gives its alt text (`leafWords`). A code block gives no lines inside: the block has its number, and the lines of the code are not lines of the page.
- `blockLineNumbers` looks each block up in the body, in order, so a file that the user wrote keeps its own lines when the editor writes a block in another way (a table pads its cells, a loose list drops a blank line). A block that cannot be found takes the next line that has text.
- `lineNumbers` then looks each line inside a block up between the lines of that block, in order, starting after the line that the block already has. The words of the page and the words of the file are compared with `compareWords`, which drops the Markdown and the marker of a list item (`-`, `2.`, `- [x]`), and only the start of the line is compared, because the file writes the words inside its markup. A line that is not found gives no number and does not move the lines after it.
- The numbers are not part of the ProseMirror document. They are a column in the page, and each number sits at the height of its line, measured with `getBoundingClientRect` of `view.nodeDOM(pos)`. A line inside a block of text has no node of its own, so it uses `view.coordsAtPos(pos)`, and a number that neither call can place stays hidden. A `ResizeObserver` on the editor and the window `resize` event move the numbers again when a picture or a diagram changes the height of a line.
- `yarn test:vscode` and the browser harness (`?lines=on&file=<name>`) show the numbers in a real page. jsdom has no layout, so the unit test moves the items and the rows with a stub of `getBoundingClientRect`.
- Not done: one number for each line of a code block, and a number for each line of a cell that the file breaks.

## Layout

- A code block header holds the language button. `RichCodeBlock` in `webview/codeBlock.ts` binds Tab and Shift+Tab, and drops Tiptap's Cmd+Alt+C.

## MDX

- A `.mdx` file opens with the view type `crazyRichMarkdown.mdxEditor` (priority `option`, so it is in "Open With" and not the default). It is the same provider. The host sends `mdx: true` in the `init` message, and `createEditor({ mdx: true })` adds `MdxBlock` and `MdxInline` (`webview/mdx.ts`). A `.md` file never gets them.
- `scanMdxBlock` finds a block at the start of the text: an `import` or `export` run, one or more JSX elements and `{expressions}` that follow each other, or an expression. A block starts at the start of a line and nothing may follow it on its last line. It never matches in the middle of a paragraph (`start: () => -1`).
- The scanner reads over strings, templates, comments, brackets, `{ }` groups in attributes and children, HTML comments, and backticks in children. A lone apostrophe in JSX text must not start a string (a string stops at the end of its line).
- When a block is not complete (a tag that never closes), the scanner gives up, and the Markdown parser reads the text as before.
- Every MDX block has the label `MDX_LABEL` (`MDX code`). The editor does not tell an import from a component. The slash item **MDX code** (only when `mdx` is true) adds an empty block and focuses its text box (`focusEmptyMdxBlock`). An empty block writes nothing to the file.
- `createRawBlock` in `rawBlocks.ts` makes the node. It keeps the exact text (`raw`) and writes it back. With `language`, the text box has a colored copy behind it (`highlightInto` in `highlightDom.ts`).
- Round trip is the rule. Add a sample to `SAMPLES` in `test/mdx.test.mjs` for each new case.
- Not done: rendering a component, and editing the Markdown inside a component as rich text. The editor cannot run project code.
