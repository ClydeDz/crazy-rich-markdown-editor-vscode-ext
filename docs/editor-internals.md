# Editor internals

## Tiptap commands

- Inside a command, `props.state` keeps the document from the start of the command. After a nested `props.commands.x()` it is stale. Read `props.tr.doc` and `props.tr.selection`.
- `editor.commands.foo()` dispatches the transaction even when the command returns false. Change the transaction only on the success path.
- `clearNodes()` lifts list items.
- Several selected lines become one block through `webview/selectedLines.ts` (`replaceSelectedLines`). The code block, math block and diagram commands use it.

## Markdown

- The Markdown parser has read plain text before the editor sees it. A backslash before punctuation (`\,` `\;` `\{` `\\`) is gone, and `<br/>` is a hard break. Text that a command takes from a paragraph cannot get these back.
- Inline atoms: `mathInline`, `emoji`, `footnoteRef`, `htmlInline`.
- HTML is not read into the document. An element inside a line (`htmlInline`) and a block of HTML (`htmlBlock`) keep their exact text, and `webview/htmlPreview.ts` draws a clean copy of it in the page, as GitHub and the VS Code preview do. The copy drops scripts, event handlers and `javascript:` addresses before it goes into the page, and it maps the address of an image or a video with the same resolver as an image node.
- HTML that shows nothing in the page (an empty anchor `<a name="top"></a>`, an unknown tag, a script alone) leaves the text of the HTML in the text box of the block, so that the user still sees it. A block that is only a comment collapses to one line, `HTML comment`, and opens its text box when the block is selected.
- A `<mark>` is the `highlight` mark, written back as `<mark>text</mark>`. A `<mark>` with attributes stays raw HTML, so the file keeps the attributes.
- A `<br>` in a line is an `htmlInline` chip, like any other tag. It keeps the new line that follows it in the file, so a line break comes back as the user wrote it, and the page draws the break once.
- A click on an `htmlBlock` that is drawn belongs to the page: it selects the text or opens a `details` element, and it does not open the text box. A click on the page copy of a selected block closes its text box again. The text box opens when the block is selected, for example with the grip at its left, and the page draws the HTML alone again when the selection leaves.
- A selected `htmlBlock` shows the page copy under the label `HTML output`, a dotted rule, the label `HTML code`, and the HTML in a code block with its colors.
- A `<details>`, `<dl>` or `<table>` element keeps the blank lines inside it, so that the page draws one element. Without that, the Markdown parser would end the HTML block at the first blank line and draw the rest as separate pieces.
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

## Table of contents

- `webview/tableOfContents.ts` builds the **Contents** button and its panel. `main.ts` puts the button at the far left of the bar (`#stats`) when the editor starts. It goes away with the bar when `crazyRichMarkdown.showInfoBar` is off, and `main.ts` closes the panel when the setting turns off.
- `documentHeadings` walks the ProseMirror document and keeps the level, the text and the position of each heading. A heading inside a quote or a list counts. Markup in the heading does not: the list shows the words. A heading with no text shows `Untitled heading`, so no row is blank.
- The panel is not a Tiptap node view. It is a fixed panel under the button, on the page, with the filter at the top and a list that scrolls. `position` uses the box of the button, so the panel hangs below the sticky bar and stays inside a narrow page.
- A click on a heading calls `headingElement` (the DOM heading for the position of the node) and `scrollIntoView`. The `scroll-padding-top` on `html` in `styles.css` keeps the heading below the bar. The panel closes after the jump.
- The panel reads the headings when it opens and after each edit. A closed panel updates the heading next to the button and keeps its list for the next open, so typing does not build the list again. Escape and a click outside close it. Escape does not reach VS Code, and the focus goes back to the button when the panel had it. The arrow keys move through the headings that the filter shows.
- The bar shows the text of the heading that holds the top of the page, to the right of the **Contents** button. That heading is the last one whose top is above the bottom of the bar, so it is the heading of the text under the bar; a document without headings shows nothing there. The same row in the panel has `aria-current="location"` and is bold. A `scroll` listener measures the headings on one frame of the window, and an edit measures them again.

## Code languages

- `webview/languageCatalog.ts` has every language of GitHub whose name a fence can hold, generated from linguist's `languages.yml`. Each row is the name that the picker shows, the word for the fence, and the other words for it. `webview/languages.ts` makes the picker list from it and adds JSX and Math. A language whose name has spaces uses an alias without spaces, because a fence holds one word.
- `webview/highlightGrammars.ts` has every grammar of highlight.js. A fence gets colors when its word, or an alias of it, is the name of a grammar. `GRAMMAR_OF` in `languages.ts` points the words that GitHub writes in another way (`c#`, `f#`, `objective-c`, `shell`, `svelte`, `vue`) at the grammar that colors them. JavaScript has `jsx` as an alias, so that fence needs no mapping. A language without a grammar stays plain, and a block without a language is never guessed.

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
