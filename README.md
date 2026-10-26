# Crazy Rich Markdown Editor

Edit Markdown files in VS Code as rich text. The file on disk stays plain Markdown.

When you open a `.md` file, you see formatted text, not Markdown symbols. When you select text, a floating toolbar shows above it. Click a button to format the text. VS Code saves the file as raw Markdown.

The editor supports GitHub Flavored Markdown (GFM): alerts, underline, subscript, superscript, task lists, tables, footnotes and more. It also opens MDX files (see "MDX files"). It keeps the `import` lines, the components and the expressions as code, and writes them back as they were.

## How to use it

1. Open a `.md` file. The rich editor opens by default. (For a `.mdx` file, see "MDX files" below.)
2. Select some text. The floating toolbar shows above the selection.
3. Click a button, or use a keyboard shortcut.
4. Save the file with `Cmd+S` (macOS) or `Ctrl+S`. The file contains Markdown.

To see the raw Markdown, click the `</>` button in the editor title bar. Or run **Markdown: Open Markdown Source (Raw Text)** from the Command Palette.
To return, run **Markdown: Open in Crazy Rich Markdown Editor**.

### The bar at the top

A thin bar at the top of the editor shows facts about the file, for example:

`Edited by Priya Raman, Tom Becker +1` `Modified 24 Oct 2026, 21:07` `57 lines` `112 words` `705 characters`

The bar stays at the top when you scroll. The counts change as you type. VS Code does not let an extension add text to its own breadcrumb bar. So the editor draws this bar below it, at the right.

- Edited by: the people who changed the file in the last Git commits, newest first. The bar names three people and shows the number of the others, for example `+1`. Hold the pointer over the names to see every person with the date and the commit message. This item is missing when the file is not in a Git repository, when no commit has the file, or when the setting is off.
- Modified: the time that the file was last saved to disk. The file system gives this time. After `git checkout` or `git pull` writes the file, the time is the time of that write. The commit dates are in the tooltip of the names.
- Lines: the lines of the Markdown file. The front matter counts.
- Words: the words of the text that you see. The Markdown symbols and the front matter do not count. `e-mail` is one word. A lone `-` is not a word. Each Chinese, Japanese or Korean letter counts as a word.
- Characters: the characters of the text that you see, with spaces. A line break does not count. Hold the pointer over the number to see the count without spaces.
- Shortcuts: a button with a keyboard icon, left of the Settings button. Click it to open a window with every keyboard shortcut of the editor. See [The shortcuts window](#the-shortcuts-window).
- Settings: a button with a gear icon at the right end of the bar. Click it to open the settings of this extension in VS Code. The list shows only the settings of this extension, so you do not need to search for them. The two buttons are part of the bar. When you turn the bar off, the buttons go too. Then use **File > Preferences > Settings** and search for `richMarkdown`.

On an editor that is narrower than 700 pixels, the bar hides the date. The names get shorter before the counts do. On an editor that is narrower than 500 pixels, the two buttons show their icons and not their text.

To hide the whole bar, set `richMarkdown.showInfoBar` to `false`. The change takes effect at once, without a reload. With the bar off, the editor does not count the text and does not run Git.

#### The shortcuts window

Click **Shortcuts** in the bar to see every keyboard shortcut of the editor. The window shows the keys that fit your system: `⌘` on macOS, and `Ctrl` on Windows and Linux. The groups are:

- Text, Headings, Lists and Blocks: the shortcuts of the floating toolbar. One table in `webview/shortcuts.ts` gives the keys to the toolbar buttons, to the editor, and to this window, so the three always agree.
- Editing: undo and redo, a new line in the same paragraph, `Tab` in lists and tables, `Backspace` at the start of an alert, and save.
- Menus: the keys of the block menu (`/`) and the emoji menu (`:`).
- Links: `Cmd` or `Ctrl` plus click opens a link, or goes to the note of a footnote.

#### How the keys were chosen

The editor lives inside VS Code, so a key can mean two things. The rules are:

1. A key that other rich text editors use stays, when VS Code has no command on that key that can run while a webview has the focus.
2. VS Code uses some keys for commands of the whole window. The editor does not take those. It uses the same letter with the `Alt` key: Strikethrough is `Cmd+Alt+X` (not `Cmd+Shift+S`, which is Save As), Quote is `Cmd+Alt+Q` (not `Cmd+Shift+B`, which runs the build task), and Subscript is `Cmd+Alt+,` (not `Cmd+,`, which opens Settings). Code block is `Cmd+Alt+E`, the block form of Inline code (`Cmd+E`). Tiptap's own key for it, `Cmd+Alt+C`, is Copy Path of Active File in VS Code.
3. Bold, Italic, Underline, Inline code, Link, Undo and Redo keep the usual key, although VS Code has a command on it (for example `Cmd+B` hides the side bar). The editor handles these keys only while the text has the focus. Everywhere else they work as before.
4. The editor handles no key that the window does not list, except the keys that move or change the text at the cursor (Enter, Escape, Backspace, Delete, the arrows, select all). Tiptap binds more keys by itself, for example `Cmd+Alt+4` for a heading of level 4 and `Cmd+Shift+U`. The editor switches these off, so VS Code gets them.

The tests check these rules. A real VS Code window presses every key with the events of a real keyboard (on a Mac, `Option` changes the character, and `Shift` gives a capital letter or a sign). It checks that the editor does the job, that VS Code does not see the key, and that the editor takes no other key from the default key bindings that VS Code lists.

To close the window, press `Esc`, click the close button, or click outside the window. The focus returns to the button.

At the bottom, the window shows "Created by" with a link, and a "Buy me a coffee" link. A link opens in your browser. The two addresses are in `webview/about.ts`. They are placeholders now: change `creatorUrl` and `coffeeUrl` before you publish. An empty address hides the link.

To add a shortcut to the list, edit `webview/shortcuts.ts`. A test presses the keys of the four toolbar groups, and of the Editing group (except Save), in a real editor. So a wrong key fails the tests.

#### How the editor reads Git

The editor runs `git log --follow` for the file, and reads the last 20 commits. It follows the file across renames. It uses the name of the author (and `.mailmap` if the repository has one), and it counts two commits as one person when the e-mail address is the same. The bar shows no e-mail address.

It uses the Git program that VS Code uses. It reads Git when the editor opens, when the editor shows again, and when the window gets focus. So a new commit shows without a reload. The editor does not use the network, and it does not change or save anything in the repository.

To hide only the authors, set `richMarkdown.showLastAuthors` to `false`. The editor also does nothing when `git.enabled` is `false`.

### The editor name in the dropdown

The button at the top right of the editor (next to the breadcrumbs) shows `Crazy Rich Markdown Editor`. Click it to switch between the rich editor and the text editor.

The menu that opens has these items. `yarn capture:menu` reads them from a real VS Code:

- `Crazy Rich Markdown Editor` (checked while the rich editor is open)
- `Text Editor`
- `Markdown Preview`
- `Markdown Editor`
- `Set Default for '*.md'`

VS Code adds the name of the extension to each item, joined with a dash (for example `Crazy Rich Markdown Editor - My Extension`). It leaves the name out only when the extension name is `Built-in`. An empty name does not work: VS Code then uses the extension id.

So the `displayName` in `package.json` is `Built-in`, and the real name is the first words of the description. This has two effects:

- The Extensions list shows the row of this extension as `Built-in`. The description starts with `Crazy Rich Markdown Editor:`.
- This works when VS Code shows English text. With another display language the word `Built-in` differs, and the menu item reads `Crazy Rich Markdown Editor - Built-in`.

To choose the other style, run one of these commands, then `yarn package`, and install the new file:

- `yarn menu:single` shows `Crazy Rich Markdown Editor` once. The extension is named `Built-in`. This is the style now.
- `yarn menu:named` shows `Rich Text - Crazy Rich Markdown Editor`. The extension has its real name.

Run `yarn capture:menu` after a change to see the menu that VS Code makes.

## The floating toolbar

| Button      | Action                       | Shortcut (macOS / other)            |
| ----------- | ---------------------------- | ----------------------------------- |
| **B**       | Bold                         | `Cmd+B` / `Ctrl+B`                  |
| _I_         | Italic                       | `Cmd+I` / `Ctrl+I`                  |
| U           | Underline (`<ins>`)          | `Cmd+U` / `Ctrl+U`                  |
| ~~S~~       | Strikethrough                | `Cmd+Option+X` / `Ctrl+Alt+X`       |
| `<>`        | Inline code                  | `Cmd+E` / `Ctrl+E`                  |
| Link        | Add, change or remove a link | `Cmd+K` / `Ctrl+K`                  |
| H1, H2, H3  | Headings                     | `Cmd+Option+1..3` / `Ctrl+Alt+1..3` |
| Bullets     | Bulleted list                | `Cmd+Shift+8` / `Ctrl+Shift+8`      |
| Numbers     | Numbered list                | `Cmd+Shift+7` / `Ctrl+Shift+7`      |
| Check boxes | Task list                    | `Cmd+Shift+9` / `Ctrl+Shift+9`      |
| Quote       | Block quote                  | `Cmd+Option+Q` / `Ctrl+Alt+Q`       |
| Code block  | Fenced code block            | `Cmd+Option+E` / `Ctrl+Alt+E`       |
| `...`       | The More menu (see below)    | none                                |

Click a button again to remove the format.

### Several lines at once

Select more than one line, and the block buttons treat the lines as one group. **Quote**, an alert, **Code block**, **Math block** and **Diagram** all put the selected lines in one block. A line is a paragraph, a heading or a list item. The block takes the whole line, also when the selection covers only a part of it.

- **Code block**: each line becomes one line of the code. A line break inside a paragraph is a new line. The text stays as you see it: no marks and no escape characters. A blank line at the start or at the end of the group is dropped.
- **Lists**: the selected items leave the list and become the lines of the block. The items that you did not select stay a list.
- **Quotes and alerts**: the lines inside one quote or alert go in a code block inside it.
- **Separate groups**: a table, a divider or another block between two lines splits the group. The lines before it and the lines after it make two blocks. The editor does not change the cells of a table.

When you click the link button, a text field replaces the buttons. Type an address and press `Enter`. Press `Esc` to cancel. A bare domain such as `example.com` becomes `https://example.com`.

To open a link, hold `Cmd` (macOS) or `Ctrl` and click it. A link to a heading (`#my-section`) scrolls to that heading.

### The More menu

The `...` button opens a menu:

- **Superscript** (`Cmd+.` / `Ctrl+.`): written as `<sup>text</sup>`.
- **Subscript** (`Cmd+,` / `Ctrl+,`): written as `<sub>text</sub>`.
- **Alerts**: Note, Tip, Important, Warning and Caution. The menu wraps the selected blocks in an alert. Choose the same alert again to remove it.
- **Math block**: the selected lines become the TeX of one math block. The block opens for editing, and the formula shows above the text.
- **Diagram**: the selected lines become the text of one `mermaid` code block, and the diagram shows under it.
- **Clear formatting**.

Use **Math block** and **Diagram** when the TeX or the diagram text is already in the file as plain lines. The menu has only these two blocks of the slash menu. The others (table, footnote, divider, image or video) work only from the slash menu.

### Alerts

An alert is a colored box. In the file it is a block quote with a marker line:

```markdown
> [!NOTE]
> Useful information.
```

Click the title of an alert to change its type. Press `Backspace` at the start of an alert to take the text out of it.

### Table toolbar

When the cursor is in a table cell, a second toolbar shows above the table. It has buttons to add or delete a row or column, and to delete the table. `Tab` in the last cell adds a row. The editor keeps the column alignment (`:---`, `:---:`, `---:`).

### Move and delete blocks

Move the pointer over a block to see a grip and a trash button at its left. A block is a paragraph, a heading, a whole list, a quote, a code block or a table.

- Drag the grip to move the block. A blue line shows where it lands. A block lands between two blocks, never inside a list.
- Click the grip to select the block.
- Click the trash button to delete the block.

In a code block, a diagram block or a math block, `Tab` types a tab. In a code block, `Shift+Tab` takes a tab away. With several lines selected, `Tab` and `Shift+Tab` indent and outdent each line.

### Slash menu

Type `/` at the start of an empty line to open a menu. It inserts headings, lists, task lists, quotes, alerts, code blocks, tables, math blocks, diagrams, footnotes, dividers, and images or videos. Keep typing to filter the list. Use the arrow keys and `Enter` to choose. In an `.mdx` file the menu also has **MDX code** (see "MDX files").

### Markdown shortcuts

You can also type Markdown. For example, `# ` at the start of a line makes a heading, `- ` makes a list, `> ` makes a quote, and ` ``` ` makes a code block. `**text**` makes bold text.

## Code blocks

Each code block has a language button at the top right. Click it to open a list. Type to search. Choose a language, or type a name that is not in the list and press `Enter`. Choose **Plain text** to remove the language.

The editor writes the language after the opening fence, for example ` ```python `. It colors the code for about 50 languages. A block without a language, or with a language that the editor does not know (for example `mermaid`), stays plain. The editor never guesses the language.

Extra words after the language, such as ` ```js {1,3} `, stay in the file.

If the code contains a line of three backticks, the editor writes a longer fence.

## Images and videos

You can add images and videos in three ways:

- Choose **Image or video** in the slash menu. A file picker opens. You can choose more than one file.
- Paste an image from the clipboard.
- Drop a file on the editor. A drop works on the whole page, also on the margins. VS Code opens a dropped file as a new editor unless the page has handled the drag, and the editor handles it for you.

The editor copies the file into an **asset folder** and writes a relative link. It does not link to the original path. A video is written as an HTML `video` tag with a relative `src` and the `controls` attribute. GitHub shows this tag as a player.

Rules for the asset folder:

- A file that is already in the asset folder is not copied again.
- A file with the same name and the same content is used again.
- A file with the same name and other content gets a number (`photo-1.png`).
- Spaces in names become hyphens. Folders in the name are removed.
- A pasted image gets a name with the time (`image-20261024-181530.png`).
- Only images (`png`, `jpg`, `gif`, `svg`, `webp`, `avif`, `bmp`) and videos (`mp4`, `mov`, `webm`, `m4v`, `ogv`) are saved.
- A pasted or dropped file can be 50 MB at most. Use the slash menu for larger files.

## Math and diagrams

GitHub also draws math and diagrams. The editor does the same.

- **Math in a line**: write `$E = mc^2$`, or ``$`a_b`$`` when the TeX has characters that Markdown reads. The editor draws it with KaTeX. Click the formula to edit the TeX. Press `Enter` to save, or `Esc` to cancel. Typing `$x$` makes the formula at once. Text such as `$5 and $6` is not math, as on GitHub.
- **Math blocks**: write `$$` on its own line, the TeX, and `$$` on its own line. The slash item **Math block** adds one. A code block with the language `math` also works.
- **Diagrams**: a code block with the language `mermaid` shows the diagram under its text. The diagram changes while you type. The slash item **Diagram** adds one. A diagram error shows its message, and the file keeps your text.

To make a formula or a diagram from text that is already in the file, select the lines and choose **Math block** or **Diagram** in the More menu of the toolbar. The editor keeps the text as it shows on the page. Markdown has already read the text when the editor opens the file, so a backslash before a punctuation mark (`\,` `\;` `\{` `\\`) is already gone from a plain line, and a `<br/>` is already a line break. The text area of the math block opens at once, so you can put such a character back. To avoid the problem, write TeX and diagrams in a `$$` block or in a `math` or `mermaid` code block, where Markdown does not read the text.

The mermaid library is 5 MB, so the editor loads it only when a page has a diagram. A TeX error shows the TeX and the message.

## Footnotes

Write `[^1]` in the text and `[^1]: The note.` anywhere in the file. The editor shows the mark as a small number and the note as a numbered list at the place where it sits in the file. The numbers follow the order of the marks in the text, as on GitHub. A note without a mark shows a `?`.

To add a footnote, choose **Footnote** in the slash menu. The editor puts a mark at the cursor, adds the note at the end of the file, and moves the cursor into the note. A note can have more than one paragraph and can hold lists. Indent the lines after the first by four spaces. Hold `Cmd` (macOS) or `Ctrl` and click a mark to scroll to its note.

## Emoji

Type `:` and two letters to open a list of emoji. Choose one with `Enter`, `Tab` or the mouse. You can also type a whole code such as `:tada:`. The editor shows the emoji, and the file keeps the code (`:tada:`), as GitHub does. The editor knows the 1870 emoji and 1913 codes that GitHub uses. A code that GitHub does not know stays as text. Codes inside inline code or code blocks stay as text.

## Color swatches

Inline code that holds a color shows a small swatch of that color. These forms work: `#RRGGBB` (also `#RGB` and with an alpha part), `rgb(R,G,B)` and `hsl(H,S,L)`.

## GitHub Flavored Markdown

The editor covers every syntax in the GitHub page [Basic writing and formatting syntax](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax).

`yarn check:github-page` reads the source of that page when it runs, takes every example of the page (code blocks, cells of tables, and code spans that hold syntax), and checks that the editor reads each one, writes it back, and reads the result as the same document, without loss of letters or digits. The page text is not saved in this project. At this time all 63 examples pass. If you want the tests to run without the internet, make a local copy yourself with `yarn check:github-page --out test/fixtures/github-page-examples.json`. The tests then use that file. The text of the GitHub docs is licensed under CC BY 4.0, so keep the attribution if you keep the file. The same examples also run in a real VS Code webview in `yarn test:vscode`. That test fetches the page too, and it skips when you are offline.

A second test uses examples that were written for this project. `test/fixtures/gfm-sections.json` holds one example for each of the 24 sections of that page, the syntax forms that the page documents for the section, and what the editor must make of it. The examples are written for this project, and a test fails if an example misses a form of its section. `test/gfm.test.mjs` runs each example in the editor: it reads the example, writes it back, and checks the rich content. The same examples also run in a real VS Code webview in `yarn test:vscode`.

| Section of that page                                            | Result in the editor                                    | In the file                           |
| --------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| Headings                                                        | Rich text                                               | Same                                  |
| Styling text: bold, italic, strikethrough, bold and italic      | Rich text                                               | Same                                  |
| Styling text: `<sub>`, `<sup>`, `<ins>`                         | Subscript, superscript, underline                       | Same tags                             |
| Quoting text, nested quotes                                     | Rich text                                               | Same                                  |
| Quoting code: inline code, fenced blocks, backticks inside code | Colored code with a language picker                     | Same, with a longer fence when needed |
| Supported color models                                          | A swatch next to the color                              | Same                                  |
| Links, link titles                                              | Rich text                                               | Same                                  |
| Section links (`#heading`)                                      | Scroll to the heading                                   | Same                                  |
| Relative links                                                  | Open the file with `Cmd` or `Ctrl` and click            | Same                                  |
| Custom anchors (`<a name="x"></a>`)                             | A small box that holds the HTML                         | Same                                  |
| Line breaks: two spaces, backslash, `<br/>`                     | Line break                                              | Two spaces and a new line             |
| Images, and the `<picture>` element                             | Image; the `<picture>` HTML shows in a box              | Same                                  |
| Lists, nested lists                                             | Rich text                                               | Same                                  |
| Task lists                                                      | Check boxes                                             | Same                                  |
| Mentioning people and teams (`@user`, `@org/team`)              | Plain text                                              | Same                                  |
| Referencing issues and pull requests (`#123`)                   | Plain text                                              | Same                                  |
| Referencing external resources                                  | Plain text                                              | Same                                  |
| Uploading assets: paste, drop, picker                           | Copied to the asset folder                              | A relative link                       |
| Using emojis (`:EMOJICODE:`)                                    | The emoji, and a list while you type                    | The code                              |
| Paragraphs                                                      | Rich text                                               | Same                                  |
| Footnotes                                                       | Numbered marks and notes                                | Same                                  |
| Alerts (`> [!NOTE]`)                                            | Colored box                                             | Same                                  |
| Hiding content with comments                                    | A small box that holds the comment                      | Same                                  |
| Ignoring Markdown formatting (backslash)                        | Plain text                                              | Same                                  |
| Disabling Markdown rendering                                    | Not a syntax. Use the `</>` button to see the raw file. |                                       |

More cases that the editor keeps: tables with column alignment, HTML blocks (`<details>`, `<div>`), HTML in a line (`<kbd>`), link definitions, bare addresses and `<https://...>` (written as bare addresses), and front matter.

## What the file looks like after you edit

The editor writes Markdown when you change the document. It does not change the file when you only open it.

After your first change, the editor can write some parts in a different style from the original. It keeps the meaning. These changes are normal:

- Bullets that start with `*` or `+` become `-`. Two lists that follow each other keep different markers, so they stay separate lists: `-`, `*` and `+` for bullets, and `1.` and `1)` for numbers.
- A tag pair that holds only a space (`<sub> </sub>`) stays HTML.
- Underlined headings (`Title` and `=====`) become `# Title`.
- `__bold__` and `_italic_` become `**bold**` and `*italic*`.
- Reference links (`[text][ref]`) become inline links. The `[ref]: url` line stays.
- Tables get aligned columns.
- Extra blank lines between blocks go away.
- Named entities such as `&copy;` become the character. A no-break space stays `&nbsp;`.

The editor keeps these parts exactly:

- Front matter (the `---` block at the top). It shows as a panel that you can open and edit. In the panel, `Tab` types two spaces (YAML does not allow a tab), `Shift+Tab` takes them away, and with several lines selected each line moves. `Enter` keeps the indent, and adds one level after a line that ends with a colon.
  To add front matter to a file that has none, choose **Front matter** in the slash menu. The panel opens at the top, and the cursor goes into it. A file has one front matter block at most, so the item is not in the menu while the file has one. The text has YAML colors, the same as a code block in the language `yaml`. A trash button shows at the left of the panel when the pointer is over it. It takes the front matter out of the file.
- HTML blocks, HTML in a line, hidden comments and link definitions.
- The line endings of the file (`LF` or `CRLF`) and the final new line.
- The text inside code blocks.

Characters such as `_`, `<`, `&` and `~` stay as you type them. The editor adds a backslash only when Markdown would read the character as syntax.

## MDX files

MDX is Markdown with `import` and `export` lines, JSX components and `{expressions}`. The editor opens `.mdx` files with the same editor, and keeps the extra parts as they are.

To open an MDX file, right-click it, choose **Open With...**, and choose **Crazy Rich Markdown Editor**. Or open the file and run **Markdown: Open in Crazy Rich Markdown Editor**. A `.mdx` file does not open in the editor by default, so your setup does not change.

What you see:

- The front matter and the Markdown (headings, lists, tables, code blocks and so on) work as in a `.md` file.
- An `import` or `export` block, a component (`<Callout type="warning">...</Callout>`, `<Chart data={data} />`, a fragment `<>...</>`) and an expression on its own line (`{/* note */}`) each show as a box with colored code. Every box has the same label, `MDX code`. The editor does not try to tell an import from a component. You can edit the code in the box.
- A component with empty lines inside is one box. Markdown inside the component stays as text in the box.
- An expression in a line of text (`{props.name}`) and each tag in a line of text (`<Badge>`) show as small pieces of code. The text around them stays editable.

To add a box yourself, type `/` in an `.mdx` file and choose **MDX code**. The box opens empty, and the cursor goes into it. Type the component, the import or the expression. The editor adds nothing and checks nothing. Your project draws the component. An empty box is not written to the file.

The editor never draws a component. A component needs the code and the packages of your project, and the editor cannot run them. A save writes every MDX part back exactly as it was. The tests check this with many samples.

A line that starts with `import` or `export` is read as code, as MDX does. A line of text that starts with one of these words, for example `import data is easy`, shows in a box too. Write it in another way, or put a word before it.

## Not supported

- HTML pictures that have extra attributes (for example a width) show in a box that holds the HTML. They do not show as a picture.
- Resizing images or tables. Markdown has no syntax for it.
- Other kinds of diagram on GitHub (`geojson`, `topojson`, `stl`). They show as code.
- MDX components. The editor does not draw them, and it does not check the code in an MDX box. It also does not edit the Markdown inside a component as rich text.

## Settings

| Setting                        | Default  | Description                                                                                                                  |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `richMarkdown.maxContentWidth` | `820`    | Maximum width in pixels of the writing column.                                                                               |
| `richMarkdown.showInfoBar`     | `true`   | Show the bar at the top of the editor: the authors from Git, the time of the last save, and the lines, words and characters. |
| `richMarkdown.showLastAuthors` | `true`   | Show the people who changed the file in the last Git commits, in the bar at the top.                                         |
| `richMarkdown.assetFolder`     | `assets` | Folder for images and videos that you insert, paste or drop.                                                                 |

### The asset folder setting

A relative path starts at the folder of the Markdown file. An absolute path is also allowed. These variables work:

| Variable                         | Value                                                |
| -------------------------------- | ---------------------------------------------------- |
| `${documentDirname}`             | The folder of the Markdown file.                     |
| `${documentBasenameNoExtension}` | The name of the Markdown file without the extension. |
| `${documentFileName}`            | The name of the Markdown file.                       |
| `${workspaceFolder}`             | The workspace folder that holds the file.            |

Examples:

| Setting                                 | Files go to                                       |
| --------------------------------------- | ------------------------------------------------- |
| `assets`                                | `assets/` next to the Markdown file (the default) |
| `.`                                     | The same folder as the Markdown file              |
| `${documentBasenameNoExtension}.assets` | `guide.assets/` for `guide.md`                    |
| `../images`                             | `images/` in the parent folder                    |
| `${workspaceFolder}/docs/images`        | `docs/images/` in the workspace                   |

The setting works per workspace or per folder. Put it in `.vscode/settings.json` to share it with your team.

To open Markdown files as text by default, add this to your settings:

```json
"workbench.editorAssociations": { "*.md": "default" }
```

You can still open the rich editor with **Markdown: Open in Crazy Rich Markdown Editor**.

## Install

### Package manager

This project uses Yarn 1 (`yarn.lock`). Do not use npm to install packages: it makes a second lockfile.

- `.npmrc` and `.yarnrc` set the public registry. So `yarn.lock` names `registry.yarnpkg.com`, and it works on a GitHub runner. A lockfile with the address of a private mirror would not. Yarn reads `.npmrc` before `.yarnrc`, and a file in the project folder comes before `~/.npmrc`, so a mirror in your own `~/.npmrc` does not change the lockfile.
- To install through a private mirror once, run `yarn install --registry <address>`.
- To add a package, run `yarn add <name>`, and commit the changed `yarn.lock`. A test fails when the lockfile names an address that is not public.
- The workflow runs `yarn install --frozen-lockfile`. It fails when `package.json` and `yarn.lock` disagree.

### Build and run from source

1. Run `yarn install`.
2. Run `yarn build`.
3. Open this folder in VS Code and press `F5`. A new window opens with the extension loaded.

### Install the package

1. Run `yarn package`. This creates `rich-markdown-editor-0.15.2.vsix`.
2. Run `code --install-extension rich-markdown-editor-0.15.2.vsix`.

### Tests in GitHub Actions

The workflow `.github/workflows/test.yml` has two jobs:

- **Typecheck and unit tests** run on every push to a pull request and on every push to `main`.
- **Tests in VS Code** run `yarn test:vscode` on pushes to `main` and when you start the workflow by hand (Actions > Tests > Run workflow). They do not run on a pull request, because they are slow. Run them by hand on a branch to try a change first.

On CI, `test/vscode/run.mjs` downloads VS Code into `.vscode-test` and runs it in a virtual screen (`xvfb`). No Docker is needed. `VSCODE_VERSION` in the workflow picks the VS Code version (`stable` by default). On your computer the script uses the VS Code in `/Applications`, or the one in `VSCODE_EXECUTABLE`. Set `RME_DOWNLOAD_VSCODE=1` to download VS Code on your computer.

### Publish to the Marketplace

The workflow `.github/workflows/publish.yml` builds and tests the extension on every push and pull request. A push to the `main` branch also publishes the package to the Visual Studio Marketplace, when the version in `package.json` is new. A pull request never publishes.

Set it up once:

1. In `package.json`, set `publisher` to the ID of your Marketplace publisher. The value `local` cannot publish. This changes the extension ID from `clydedsouza.crazy-rich-markdown-editor` to `<publisher>.rich-markdown-editor`.
2. Make an access token: open https://dev.azure.com, then User settings, Personal access tokens, New token. Set Organization to `All accessible organizations` and Scope to `Marketplace > Manage`.
3. Add the token as the repository secret `VSCE_PAT` (Settings, Secrets and variables, Actions).
4. Optional: in Settings, Environments, open `marketplace` and add a required reviewer. A person must then approve each release.
5. Decide the name of the extension in the listing. The Marketplace shows the `displayName` of `package.json`, and it is `Built-in` (see above). To show the real name, run `yarn menu:named` before the first release. The editor dropdown then reads `Rich Text - Crazy Rich Markdown Editor`.

To release, raise `version` in `package.json` and merge the change to `main`. The workflow asks the Marketplace which versions it holds. If the version is new, the workflow publishes the package that the build job tested. If the Marketplace already holds the version, the workflow only builds and tests, and the run summary says so. `yarn check:publish` runs the same check on your computer.

The workflow `publish.yml` does not run `yarn test:vscode`. The workflow `.github/workflows/test.yml` does (see "Tests in GitHub Actions" below).

## Development

| Command                               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `yarn build`                          | Builds `dist/extension.js` and `dist/webview.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `yarn watch`                          | Builds again when a file changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `yarn typecheck`                      | Checks the types of the extension and the webview.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `yarn test`                           | Runs the unit tests in Node. They cover the Markdown round trips, the toolbar and its menus, the slash and emoji menus, the language picker, math, footnotes, alerts, MDX (the scanner, the round trip of many samples, the box and its colors, the slash item), the asset code (with a stand-in for the `vscode` module, `test/vscode-stub.mjs`), the Git authors, the publish checks, the Yarn setup, the shortcuts (every key is pressed with the key events of a real keyboard, for Windows and for a Mac) with their window, and the mutation tool. They also check the examples for each section of the GitHub page, and the examples of the page itself. The last one is skipped without the internet. The Git tests make small repositories in the temporary folder of your system, and skip when `git` is not installed. A test file fails at its end when a listener threw an error that jsdom hid. |
| `yarn test:vscode`                    | Runs the integration tests in the VS Code that is installed on your computer. Some of them load the editor in a real VS Code webview, paste a PNG, drop a video, click the toolbar and open an MDX file. They also press every shortcut in a real webview, check that VS Code does not see the key, and compare the keys that the editor takes with the default key bindings of your VS Code. To run only some tests, set `RME_ONLY`: `RME_ONLY=shortcut yarn test:vscode` (several texts: `a                                                                                                                                                                                                                                                                                                                                                                                                                 | b`). |
| `yarn package`                        | Creates the `.vsix` file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `yarn mutate`                         | Breaks the code on purpose, one small change at a time, and runs the tests after each change. A change that no test notices is a "survivor": it shows a gap in the tests. It works in copies in the temporary folder and never touches the project. Options: `--suite vscode` (slow, uses the VS Code on your computer), `--only <text>`, `--per-file <n>`, `--seed <n>`, `--list`. Hand-made changes are in `scripts/mutations.mjs`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `yarn check:publish`                  | Checks the publisher and the version against the Marketplace, as the publish workflow does. It needs the internet and the `VSCE_PAT` variable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `yarn check:github-page`              | Fetches the source of the GitHub page and runs every example of the page through the editor. It needs the internet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `yarn menu:single`, `yarn menu:named` | Choose how the editor dropdown names the editor (see above).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `yarn capture:menu`                   | Starts a separate VS Code and prints the items of the editor dropdown menu and the row of the Extensions list. Add `--screenshots <folder>` to save pictures of the window. Add `--page-menu` as well to draw the menu in the page, so that a picture shows the open menu (`menu.png`). Add `--git` to make the file part of a temporary Git repository with four authors, so that the bar shows them. Add `--light` for the light theme, `--setting name=value` (the value is JSON) for any VS Code setting, and `--zoom-live <n>` to change the window zoom after the editor opened.                                                                                                                                                                                                                                                                                                                        |

To look at the editor in a normal browser, run `node test/harness/server.mjs` and open `http://localhost:5199`. Add `?theme=light` for the light theme. Add `?file=sample.mdx` to open the MDX sample.

### How it works

- `src/markdownEditorProvider.ts` is a VS Code custom text editor. The `TextDocument` is the single source of truth. The webview sends the new Markdown text. The provider replaces only the changed range, so undo history and diffs stay small. A change from outside (for example a git checkout) goes to the webview.
- `src/assets.ts` finds the asset folder and saves pasted, dropped and picked files in it.
- `webview/` is the editor. It uses [Tiptap](https://tiptap.dev) (ProseMirror) with the `@tiptap/markdown` package to read and write Markdown.
- `webview/toolbar.ts` is the floating toolbar. `webview/slashMenu.ts` is the slash menu. `webview/languagePicker.ts` is the language list of a code block. `webview/selectedLines.ts` finds the lines that the selection touches, for the commands of the code block, the math block and the diagram. `webview/blockHandle.ts` draws the grip and the trash button of a block. `webview/mdx.ts` finds the MDX blocks and keeps them as they are. `webview/highlightDom.ts` colors text with the code block highlighter. `webview/frontMatterView.ts` colors the front matter and draws its trash button. `webview/textIndent.ts` does Tab and Enter in the front matter field. `webview/stats.ts` counts lines, words and characters and draws the bar at the top. `src/fileInfo.ts` reads the authors from `git log`.
- `webview/alert.ts`, `webview/htmlMarks.ts`, `webview/codeBlock.ts`, `webview/media.ts`, `webview/footnotes.ts`, `webview/emoji.ts`, `webview/colorSwatches.ts`, `webview/math.ts` and `webview/diagrams.ts` add the GFM parts. `webview/emojiData.ts` is made by `scripts/generate-emoji.mjs`.
- `webview/markdownText.ts` decides which characters need an escape. `webview/rawBlocks.ts` and `webview/inlineHtml.ts` keep HTML and link definitions without change.
- The webview uses a strict content security policy. It runs only the bundled script.
