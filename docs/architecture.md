# Architecture

Crazy Rich Markdown Editor is a VS Code custom text editor. Two pieces run in different processes, and `vscode.TextDocument` is the single source of truth: the file on disk stays plain Markdown, and neither side keeps a second saved copy.

```text
+------------------------------------+
| Extension host process (Node.js)   |
|                                    |
| src/extension.ts                   |
|   activate()                       |
|     - custom editors for .md/.mdx  |
|     - commands and context menu    |
|                                    |
| src/markdownEditorProvider.ts      |
|   resolveCustomTextEditor()        |
|     - TextDocument = the file      |
|     - webview.html = page shell    |
|     - postMessage = the only link  |
|                                    |
| src/assets.ts, src/fileInfo.ts,    |
| src/textDiff.ts, src/protocol.ts   |
+----------------+-------------------+
                 |
                 | postMessage
                 v
+------------------------------------+
| Webview (sandboxed iframe)         |
|                                    |
| dist/webview.js                    |
|   webview/main.ts                  |
|     - acquireVsCodeApi()           |
|     - splits front matter          |
|   webview/editor.ts                |
|     - Tiptap + @tiptap/markdown    |
|     - toolbar, menus, commands     |
|   edit -> serialize -> postMessage |
+----------------+-------------------+
                 |
                 | asWebviewUri, workspace.fs
                 v
+------------------------------------+
| VS Code APIs and workspace files   |
| TextDocument, workspace.fs, Git,   |
| settings, openExternal, dialogs    |
+------------------------------------+
```

The webview never reads or writes the file itself. It sends the Markdown text to the host, and the host applies the change to the `TextDocument`. The page loads local images, videos, scripts and styles only through webview URIs that the host allows.

## One edit, end to end

1. The user types or uses a toolbar command. Tiptap changes the ProseMirror document in the webview.
2. `webview/main.ts` waits 120 ms after the last change, then serializes the document: front matter, a blank line, the body, and the final newline of the file.
3. The page posts `{ type: 'edit', text }`.
4. The host converts the text to the line endings of the file, finds the smallest changed range with `src/textDiff.ts`, and applies a `vscode.WorkspaceEdit`.
5. VS Code changes the `TextDocument`. The dirty state, undo history and normal save behavior stay VS Code's.
6. `onDidChangeTextDocument` fires. The text now matches what the page sent, so no `update` goes back and the two sides do not echo each other.
7. An outside change, such as `git checkout` or the text editor, makes the document differ from the page. The host posts `{ type: 'update', text }`, and `setMarkdown` replaces the body while keeping the selection where it can.

Saving is VS Code's save, not a message. The page sends a waiting edit before a save key press so the file on disk includes the newest keystrokes.

## Messages

`src/protocol.ts` types the side that the extension host sees. `webview/main.ts` declares its own copy of the types because the webview bundle must not import from `src/`; keep the two in step by hand.

| Direction   | Message                            | When                                                       |
| ----------- | ---------------------------------- | ---------------------------------------------------------- |
| page -> host | `ready`                           | The page loaded. The host answers with `init`.             |
| host -> page | `init`                            | Text, base URI, width, bar and line-number settings, MDX.  |
| page -> host | `edit`                            | Debounced Markdown text after a change.                    |
| host -> page | `update`                          | The document changed outside the page.                     |
| host -> page | `config`                          | A setting changed.                                         |
| host -> page | `fileInfo`                        | The modified time and the authors from `git log`.           |
| page -> host | `pickMedia`, `saveAsset`          | The user picks, pastes or drops an image or a video.       |
| page -> host | `assetTooLarge`                   | A pasted or dropped file is over 50 MB.                    |
| host -> page | `insertMedia`                     | The host saved the files; the page inserts them.           |
| page -> host | `openLink`, `openSettings`        | A link or the gear button was used.                        |
| page -> host | `contextSelection`                | A right-click selection for the chat commands.             |

## Where each side lives

- **Extension host:** `src/extension.ts` registers the editors and commands. `src/markdownEditorProvider.ts` owns the panel, HTML shell, messages, settings, media flow and file info. `src/assets.ts` handles the asset folder. `src/fileInfo.ts` runs `git log`. `src/textDiff.ts` finds the minimal edit. `src/refreshQueue.ts` coalesces file-info reads. `src/chatSelection.ts` maps a page selection to source offsets.
- **Webview:** `webview/main.ts` wires the page to the host. `webview/editor.ts` builds the Tiptap schema and extensions. The rest of `webview/` adds the toolbar, slash menu, tables, code blocks, footnotes, HTML marks, math, diagrams, emoji, line numbers, table of contents, stats and front matter.
- **Build:** `esbuild.mjs` makes `dist/extension.js` (Node, CommonJS, `vscode` external) and `dist/webview.js` (browser, IIFE, with CSS and fonts). `dist/mermaid.js` is copied separately and loaded only when a diagram needs it.
- **Security:** the page shell sets `default-src 'none'`, allows scripts only with its nonce, and limits `localResourceRoots` to `dist/`, the document folder, the asset folder and the workspace folders.
- **Tests:** `yarn test` bundles the webview sources in jsdom. `yarn test:vscode` loads the real webview in VS Code. `test/harness/` stands in for `acquireVsCodeApi` in a normal browser.

See [editor-internals.md](editor-internals.md) for the Tiptap and Markdown rules, and [testing.md](testing.md) for the test layers.
