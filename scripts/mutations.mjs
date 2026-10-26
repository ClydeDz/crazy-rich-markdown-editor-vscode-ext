// The mutants for scripts/mutation-check.mjs.
//
// AUTO_FILES: the files where the script picks random mutants (comparisons, `&&`, numbers, `if` conditions, statements).
// HAND_MUTANTS: changes that break one behavior on purpose. Each one has:
//   id      a short name
//   suite   `unit` (yarn test) or `vscode` (yarn test:vscode)
//   file    the file to change
//   find    the exact text to replace. It must occur once in the file.
//   replace the text that breaks the behavior
//   why     what the change breaks. A test must fail because of it.
//   accepted  (optional) the reason why no test can tell the change from the original. The run does not count it as a failure.
//
// Random changes that no test can see, and why (checked by hand on 2026-10-25, when 164 of 181 random changes were
// caught by a test and the other 17 were looked at one by one). If a random run shows one of these, it is not a gap:
//   src/assets.ts       `i < a.length` in sameBytes: the two lengths are equal, so the extra step compares undefined with undefined.
//   src/assets.ts       `.trim()` in sanitizeFileName: the spaces are already gone after the replace before it.
//   src/assets.ts       `overwrite: false` in the copy: the code has just checked that the target does not exist.
//   webview/alert.ts    `all.length > 0` and `depth > 0`: the first is always true inside the callback, and depth 0 is the document.
//   webview/footnotes.ts  `target === undefined` in the search for a note: the notes are top level, so the search ends the same way.
//   webview/codeBlock.ts  the first `preview.hidden = true`: the next line of code sets it again at once.
//   scripts/mutation-lib.mjs  the width of the text in a report: only the look of the report.
//   webview/selectedLines.ts  `return false` after a line is read: the children of a line are text and small nodes, and none is a line, so the walk into them finds nothing.
//   webview/mdx.ts      `return -1` to `-2` (in skipTemplate and skipGroup): every caller tests `< 0`, so any negative number means the same.
//   webview/mdx.ts      `end < 0` to `end <= 0` (in lineEnd and in the `/*` comment of scanEsm): `indexOf` gives 0 only at the very start of the text, and a block never starts with a line break or `*/`.
//   webview/keymap.ts   `priority: 1000` to 1001: any priority above the default of 100 puts the keymap first, and Tiptap's own keys that could answer first are switched off.

/** Code that the unit tests run in Node (with jsdom). */
export const AUTO_FILES = [
  'src/textDiff.ts',
  'src/fileInfo.ts',
  'src/assets.ts',
  'scripts/mutation-lib.mjs',
  'scripts/publish-lib.mjs',
  'scripts/set-menu-style.mjs',
  'scripts/github-page-extract.mjs',
  'webview/stats.ts',
  'src/refreshQueue.ts',
  'webview/keys.ts',
  'webview/keymap.ts',
  'webview/shortcuts.ts',
  'webview/shortcutsModal.ts',
  'scripts/check-publish.mjs',
  'webview/markdownText.ts',
  'webview/frontMatter.ts',
  'webview/anchors.ts',
  'webview/entities.ts',
  'webview/htmlMarks.ts',
  'webview/inlineHtml.ts',
  'webview/lists.ts',
  'webview/languages.ts',
  'webview/languagePicker.ts',
  'webview/alert.ts',
  'webview/footnotes.ts',
  'webview/emoji.ts',
  'webview/colorSwatches.ts',
  'webview/math.ts',
  'webview/media.ts',
  'webview/mediaInput.ts',
  'webview/rawBlocks.ts',
  'webview/codeBlock.ts',
  'webview/selectedLines.ts',
  'webview/slashMenu.ts',
  'webview/suggestionMenu.ts',
  'webview/toolbar.ts',
  'webview/editor.ts',
  'webview/mdx.ts',
  'webview/highlightDom.ts',
];

export const HAND_MUTANTS = [
  { id: "mdx-flag-sent", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "              mdx: isMdxFile(document.uri),", replace: "              mdx: false,", why: "the host never tells the webview that a file is MDX" },
  { id: "mdx-extension-case", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "uri.path.toLowerCase().endsWith('.mdx')", replace: "uri.path.endsWith('.mdx')", why: "a file with the extension .MDX is not read as MDX" },
  { id: "mdx-block-tokenizer-off", suite: "unit", file: "webview/editor.ts", find: "...(options.mdx ? [MdxBlock, MdxInline] : []),", replace: "...[],", why: "an MDX file gets no MDX blocks" },
  { id: "mdx-priority", suite: "unit", file: "package.json", find: "\"priority\": \"option\"", replace: "\"priority\": \"default\"", why: "MDX files open in the editor by default" },
  { id: "provider-echo-guard", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "        if (document.getText() === webviewText) {", replace: "        if (false) {", why: "a change from the webview is sent back to the webview (echo)", accepted: "When the webview edit is applied, the first guard of the same handler (the edits that wait) has already stopped the event. The guard that this change removes only matters for a change event that leaves the text as the webview has it, and VS Code sends none." },
  { id: "provider-edit-queue", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "        if (flushing || pendingText !== undefined) {", replace: "        if (false) {", why: "a document change is sent to the webview while edits are still waiting" },
  { id: "provider-crlf", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "document.eol === vscode.EndOfLine.CRLF ? text.replace(/\\r?\\n/g, '\\r\\n') : text.replace(/\\r\\n/g, '\\n');", replace: "text.replace(/\\r\\n/g, '\\n');", why: "a file with CRLF line endings loses them after an edit" },
  { id: "provider-same-text", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "      if (!change) {", replace: "      if (false) {", why: "an edit that changes nothing is still applied" },
  { id: "provider-keep-page", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "webviewOptions: { retainContextWhenHidden: true },", replace: "webviewOptions: { retainContextWhenHidden: false },", why: "the page is loaded again each time the editor is shown" },
  { id: "provider-roots-workspace", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "      ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),", replace: "", why: "the page cannot load files from the workspace folders" },
  { id: "provider-bar-off", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "      if (!showInfoBar()) {", replace: "      if (false) {", why: "the host reads the date and Git while the bar is off" },
  { id: "provider-git-enabled", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "return shown && gitOn ?", replace: "return shown ?", why: "the host runs Git although Git is turned off in VS Code" },
  { id: "provider-save-refresh", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "        if (saved.uri.toString() === document.uri.toString()) {", replace: "        if (false) {", why: "the date does not change after a save" },
  { id: "provider-watcher-refresh", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "      fileWatcher.onDidChange(() => void refreshFileInfo(false)),", replace: "      fileWatcher.onDidChange(() => undefined),", why: "the date does not change when another program writes the file" },
  { id: "provider-show-refresh", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "        if (event.webviewPanel.visible) {", replace: "        if (false) {", why: "a new commit does not show when the editor is shown again" },
  { id: "provider-media-check", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "    if (!mediaKind(name, mime)) {", replace: "    if (false) {", why: "a file that is not an image or video is saved" },
  { id: "provider-size-limit", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "    if (bytes.length > MAX_UPLOAD_BYTES) {", replace: "    if (bytes.length > MAX_UPLOAD_BYTES * 2) {", why: "a file larger than 50 MB is saved" },
  { id: "provider-tel-link", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "/^(https?|mailto|tel):/i.test(href)", replace: "/^(https?|mailto):/i.test(href)", why: "a tel: link does not open" },
  { id: "provider-heading-link", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "    if (href.startsWith('#')) {", replace: "    if (false) {", why: "a link to a heading shows a warning" },
  { id: "provider-link-query", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "    const [pathPart] = href.split(/[?#]/);", replace: "    const pathPart = href;", why: "a link to a file with a query or a heading does not open" },
  { id: "provider-csp-script", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "      `script-src 'nonce-${nonce}'`,", replace: "      `script-src 'nonce-${nonce}' 'unsafe-inline'`,", why: "the page runs inline scripts" },
  { id: "provider-csp-img", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "      `img-src ${webview.cspSource} https: data:`,", replace: "      `img-src ${webview.cspSource} data:`,", why: "web images do not load" },
  { id: "extension-active-editor", suite: "vscode", file: "src/extension.ts", find: "const target = uri ?? vscode.window.activeTextEditor?.document.uri;", replace: "const target = uri;", why: "the rich command without an argument does nothing for the active file" },
  { id: "webview-save-flush", suite: "vscode", file: "webview/main.ts", find: "    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && sendTimer !== undefined) {", replace: "    if (false) {", why: "Cmd+S does not send the waiting text first" },
  { id: "webview-blur-flush", suite: "vscode", file: "webview/main.ts", find: "    if (sendTimer !== undefined) {", replace: "    if (false) {", why: "leaving the editor does not send the waiting text" },
  { id: "webview-drop-inside", suite: "vscode", file: "webview/main.ts", find: "if (!hasFiles(event) || editor?.view.dom.contains(event.target as Node)) {", replace: "if (!hasFiles(event)) {", why: "a file dropped on the text is handled twice" },
  { id: "webview-dragenter", suite: "vscode", file: "webview/main.ts", find: "    'dragenter',", replace: "    'dragenter-never',", why: "VS Code opens a file that is dropped on the margin" },
  { id: "webview-key-leak", suite: "vscode", file: "webview/main.ts", find: "  if (event.defaultPrevented) {", replace: "  if (false) {", why: "a key that the editor handled also reaches VS Code" },
  { id: "webview-width", suite: "vscode", file: "webview/main.ts", find: "  document.documentElement.style.setProperty('--rme-max-width', `${width}px`);", replace: "  void width;", why: "the width setting has no effect" },
  { id: "webview-anchor-scroll", suite: "vscode", file: "webview/main.ts", find: "findHeadingForAnchor(editorElement, href)?.scrollIntoView({ block: 'start', behavior: 'smooth' });", replace: "void href;", why: "a link to a heading does not scroll" },
  { id: "webview-ctrl-click", suite: "vscode", file: "webview/main.ts", find: "    if (event.metaKey || event.ctrlKey) {", replace: "    if (event.metaKey) {", why: "Ctrl+click does not open a link" },
  { id: "webview-newline-end", suite: "vscode", file: "webview/main.ts", find: "  endsWithNewline = text.length === 0 || text.endsWith('\\n');", replace: "  endsWithNewline = true;", why: "a file without a newline at the end gets one" },
  { id: "webview-front-matter-gap", suite: "vscode", file: "webview/main.ts", find: "  frontMatterGap = leadingNewlines.length === split.body.length ? '\\n' : leadingNewlines;", replace: "  frontMatterGap = '\\n';", why: "the empty lines after the front matter change" },
  { id: "css-bar-sticky", suite: "vscode", file: "webview/styles.css", find: "  position: sticky;", replace: "  position: static;", why: "the bar scrolls away with the text" },
  { id: "css-bar-hidden", suite: "vscode", file: "webview/styles.css", find: ".rme-stats[hidden],", replace: ".rme-stats[hidden-never],", why: "a bar that is off still takes room" },
  { id: "css-scroll-padding", suite: "vscode", file: "webview/styles.css", find: "  scroll-padding-top: 36px;", replace: "  scroll-padding-top: 0;", why: "a heading that a link scrolls to stops under the bar" },
  { id: "provider-settings-filter", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.context.extension.id}`);", replace: "await vscode.commands.executeCommand('workbench.action.openSettings');", why: "the settings button shows the settings of every extension" },
  { id: "provider-settings-ignored", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "case 'openSettings':", replace: "case 'openSettings-never':", why: "the host ignores the click on the settings button" },
  { id: "webview-settings-unwired", suite: "vscode", file: "webview/main.ts", find: "onOpenSettings: () => vscode.postMessage({ type: 'openSettings' }),", replace: "onOpenSettings: () => undefined,", why: "the settings button sends nothing to the host" },
  { id: "stats-button-click", suite: "unit", file: "webview/stats.ts", find: "button.addEventListener('click', () => onClick?.());", replace: "void onClick;", why: "a click on a button of the bar does nothing" },
  { id: "modal-escape", suite: "unit", file: "webview/shortcutsModal.ts", find: "if (event.key === 'Escape') {", replace: "if (event.key === 'Escape-never') {", why: "Escape does not close the shortcuts window" },
  { id: "modal-backdrop-close", suite: "unit", file: "webview/shortcutsModal.ts", find: "if (event.target === backdrop) {", replace: "if (true) {", why: "a click inside the shortcuts window closes it" },
  { id: "modal-restore-focus", suite: "unit", file: "webview/shortcutsModal.ts", find: "      returnFocus.focus();", replace: "      void returnFocus;", why: "the focus does not return to the button after the window closes" },
  { id: "modal-listener-leak", suite: "unit", file: "webview/shortcutsModal.ts", find: "    backdrop.hidden = true;\n    document.removeEventListener('keydown', onKeyDown, true);", replace: "    backdrop.hidden = true;", why: "a closed window keeps its key listener on the page" },
  { id: "modal-link-open", suite: "unit", file: "webview/shortcutsModal.ts", find: "      options.openLink(href);", replace: "      void href;", why: "a link in the shortcuts window opens nothing" },
  { id: "modal-trap-last", suite: "unit", file: "webview/shortcutsModal.ts", find: "} else if (!event.shiftKey && active === last) {", replace: "} else if (false) {", why: "Tab leaves the window from its last item" },
  { id: "modal-coffee-link", suite: "unit", file: "webview/shortcutsModal.ts", find: "if (coffeeUrl) {", replace: "if (false) {", why: "the coffee link is never shown" },
  { id: "keys-mod-names", suite: "unit", file: "webview/keys.ts", find: "Mod: { mac: '⌘', other: 'Ctrl' },", replace: "Mod: { mac: 'Ctrl', other: '⌘' },", why: "the keys show the wrong name of Mod on each system" },
  { id: "shortcuts-redo-key", suite: "unit", file: "webview/shortcuts.ts", find: "{ label: 'Redo', keys: ['Mod-Shift-z', 'Mod-y'] },", replace: "{ label: 'Redo', keys: ['Mod-Shift-z', 'Mod-r'] },", why: "the list names a key that does not redo" },
  { id: "shortcuts-table-key", suite: "unit", file: "webview/shortcuts.ts", find: "{ label: 'Previous table cell', keys: ['Shift-Tab'] },", replace: "{ label: 'Previous table cell', keys: ['Mod-Tab'] },", why: "the list names a key that does not move in a table" },
  { id: "webview-shortcuts-unwired", suite: "vscode", file: "webview/main.ts", find: "onOpenShortcuts: () => shortcutsModal.open(),", replace: "onOpenShortcuts: () => undefined,", why: "the shortcuts button opens nothing" },
  { id: "css-modal-layer", suite: "vscode", file: "webview/styles.css", find: "  z-index: 100;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 16px;", replace: "  z-index: 1;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 16px;", why: "the shortcuts window shows under the bar at the top" },
  { id: "css-modal-hidden", suite: "vscode", file: "webview/styles.css", find: ".rme-modal-backdrop[hidden] {", replace: ".rme-modal-backdrop[hidden-never] {", why: "a closed shortcuts window still covers the page" },
  { id: "keymap-quiet-keys", suite: "unit", file: "webview/keymap.ts", find: "new Set(['bold', 'italic', 'strike', 'blockquote', 'heading', 'paragraph'])", replace: "new Set([])", why: "Tiptap keeps its own keys, so the editor takes keys that VS Code needs" },
  { id: "keymap-subscript-command", suite: "unit", file: "webview/keymap.ts", find: "[FORMAT_KEYS.subscript]: () => commands().toggleSubscript(),", replace: "[FORMAT_KEYS.subscript]: () => commands().toggleSuperscript(),", why: "the Subscript key makes superscript" },
  { id: "keymap-strike-key", suite: "unit", file: "webview/shortcuts.ts", find: "strike: 'Mod-Alt-x',", replace: "strike: 'Mod-Shift-s',", why: "Strikethrough takes the key that VS Code uses for Save As" },
  { id: "keymap-subscript-key", suite: "unit", file: "webview/shortcuts.ts", find: "subscript: 'Mod-Alt-,',", replace: "subscript: 'Mod-,',", why: "Subscript takes the key that VS Code uses for Settings" },
  { id: "keymap-marks-quiet", suite: "unit", file: "webview/htmlMarks.ts", find: "export const SubscriptMark = withoutKeys(Subscript).extend(", replace: "export const SubscriptMark = Subscript.extend(", why: "the Subscript mark keeps the key of Tiptap" },
  { id: "keymap-toolbar-key", suite: "unit", file: "webview/toolbar.ts", find: "      shortcut: FORMAT_KEYS.bold,", replace: "      shortcut: FORMAT_KEYS.italic,", why: "the Bold button shows the key of Italic" },
  { id: "publish-yarn-silent", suite: "unit", file: "scripts/check-publish.mjs", find: "['--silent', 'vsce', 'show',", replace: "['vsce', 'show',", why: "the output of yarn has a banner, and the script cannot read the answer" },
  { id: "provider-window-focus", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "if (state.focused && panel.visible) {", replace: "if (false) {", why: "the authors do not refresh when the window gets the focus" },
  { id: "provider-config-bar-message", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "event.affectsConfiguration('richMarkdown.maxContentWidth') || event.affectsConfiguration('richMarkdown.showInfoBar')", replace: "event.affectsConfiguration('richMarkdown.maxContentWidth')", why: "the bar does not hide or show when the setting changes" },
  { id: "provider-bar-on-refresh", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "        // A bar that was off has no date and no authors yet.\n        if (event.affectsConfiguration('richMarkdown.showInfoBar')) {", replace: "        // A bar that was off has no date and no authors yet.\n        if (false) {", why: "a bar that is turned on stays without a date" },
  { id: "provider-authors-setting", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "event.affectsConfiguration('richMarkdown.showLastAuthors', document.uri) ||", replace: "false ||", why: "the authors do not change when their setting changes" },
  { id: "provider-ready-refresh", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "            void refreshFileInfo(true);\n            break;\n\n          case 'edit': {", replace: "            break;\n\n          case 'edit': {", why: "the bar has no date and no authors when the editor opens" },
  { id: "provider-init-bar", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "              showInfoBar: showInfoBar(),\n              mdx:", replace: "              showInfoBar: true,\n              mdx:", why: "the bar shows when the editor opens, although the user turned it off" },
  { id: "provider-modified-zero", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "return mtime > 0 ? mtime : undefined;", replace: "return mtime;", why: "a file without a time shows the date 1970" },
  { id: "provider-disposed-post", suite: "vscode", file: "src/markdownEditorProvider.ts", find: "      if (!disposed) {\n        post({ type: 'fileInfo', modified, authors });", replace: "      if (true) {\n        post({ type: 'fileInfo', modified, authors });", why: "the editor posts to a closed panel" },
  { id: "yarn-registry-pin", suite: "unit", file: ".npmrc", find: "registry=https://registry.yarnpkg.com/", replace: "registry=https://mirror.invalid/npm/", why: "a new package gets the address of a private mirror" },
  { id: "yarn-package-manager", suite: "unit", file: "package.json", find: '"packageManager": "yarn@1.22.22",', replace: '"packageManager": "npm@10.9.0",', why: "the project names npm as its package manager" },
  { id: "yarn-workflow-frozen", suite: "unit", file: ".github/workflows/publish.yml", find: "      - run: yarn install --frozen-lockfile\n\n      - run: yarn typecheck", replace: "      - run: yarn install\n\n      - run: yarn typecheck", why: "the build installs packages that the lockfile does not name" },
  { id: "refresh-merge-git", suite: "unit", file: "src/refreshQueue.ts", find: "waiting = { readGit: (waiting?.readGit ?? false) || readGit };", replace: "waiting = { readGit };", why: "a request for the authors that comes during a read is lost when a later request does not ask for them" },
  { id: "refresh-follow-up", suite: "unit", file: "src/refreshQueue.ts", find: "    if (waiting) {", replace: "    if (false) {", why: "a request that comes during a read is never run" },
  { id: "refresh-reset", suite: "unit", file: "src/refreshQueue.ts", find: "    } finally {\n      running = false;\n    }", replace: "    } finally {\n    }", why: "a failed read blocks every later read" },
  { id: "lines-adjacent", suite: "unit", file: "webview/selectedLines.ts", find: "    if (last && last.to === pos) {", replace: "    if (last) {", why: "lines with a block between them go in one group" },
  { id: "lines-table", suite: "unit", file: "webview/selectedLines.ts", find: "    if (node.type.name === 'table') {", replace: "    if (false) {", why: "the cells of a table become code blocks" },
  { id: "lines-hard-break", suite: "unit", file: "webview/selectedLines.ts", find: "      text += '\\n';", replace: "      text += '';", why: "a line break in a line joins two words in the code" },
  { id: "lines-trim", suite: "unit", file: "webview/selectedLines.ts", find: "  return text.replace(/^(?:[ \\t]*\\n)+/, '').replace(/(?:\\n[ \\t]*)+$/, '');", replace: "  return text;", why: "a blank line at the start or the end stays in the block" },
  { id: "lines-reverse", suite: "unit", file: "webview/selectedLines.ts", find: "  for (const group of [...groups].reverse()) {", replace: "  for (const group of groups) {", why: "with two groups, the second block goes to the wrong place" },
  { id: "lines-clear-lists", suite: "unit", file: "webview/selectedLines.ts", find: "  return props.commands.clearNodes() ? attempt() : undefined;", replace: "  return undefined;", why: "list items do not become one block" },
  { id: "lines-tex-format", suite: "unit", file: "webview/selectedLines.ts", find: "    if (format === 'tex') {", replace: "    if (false) {", why: "a formula in a line keeps its dollar signs in a math block" },
  { id: "lines-cursor-offset", suite: "unit", file: "webview/selectedLines.ts", find: "cursorOffset: empty ? from - (groups[0].from + 1) : undefined", replace: "cursorOffset: undefined", why: "the cursor jumps to the start of the code block" },
  { id: "code-toggle-off", suite: "unit", file: "webview/codeBlock.ts", find: "          if (!isNodeActive(props.state, this.name)) {", replace: "          if (true) {", why: "the Code block button cannot take a code block away" },
  { id: "code-keep-cursor", suite: "unit", file: "webview/codeBlock.ts", find: "replaced.groups === 1 ? replaced.cursorOffset : undefined", replace: "undefined", why: "a cursor in a line selects the whole new code block" },
  { id: "code-diagram-language", suite: "unit", file: "webview/codeBlock.ts", find: "makeBlock(props.state, { language: 'mermaid' }, group),", replace: "makeBlock(props.state, { language: 'math' }, group),", why: "the Diagram item makes a block in the wrong language" },
  { id: "math-block-form", suite: "unit", file: "webview/math.ts", find: "state.schema.nodes.mathBlock.create({ tex: group.text, oneLine: false }),", replace: "state.schema.nodes.mathBlock.create({ tex: group.text, oneLine: true }),", why: "the math block is written in one line" },
  { id: "math-block-open", suite: "unit", file: "webview/math.ts", find: "tr.setSelection(NodeSelection.create(tr.doc, replaced.place)).scrollIntoView();", replace: "tr.scrollIntoView();", why: "the new math block does not open for editing" },
  { id: "toolbar-math-item", suite: "unit", file: "webview/toolbar.ts", find: "    run: (e) => e.chain().focus().setMathBlock().run(),", replace: "    run: (e) => e.chain().focus().setDiagram().run(),", why: "the Math block item makes a diagram" },
  { id: "toolbar-diagram-item", suite: "unit", file: "webview/toolbar.ts", find: "    run: (e) => e.chain().focus().setDiagram().run(),", replace: "    run: (e) => e.chain().focus().setMathBlock().run(),", why: "the Diagram item makes a math block" },
  { id: "code-cursor-clamp", suite: "unit", file: "webview/codeBlock.ts", find: "TextSelection.create(tr.doc, start + Math.min(offset, length)),", replace: "TextSelection.create(tr.doc, start + offset),", why: "a cursor after a picture in the line moves out of the new code block" },
];
