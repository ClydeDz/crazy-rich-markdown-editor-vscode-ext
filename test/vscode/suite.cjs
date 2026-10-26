// Integration tests. They run inside the VS Code extension host.
const vscode = require("vscode");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { MarkdownEditorProvider } = require("../.build/provider.cjs");
const assets = require("../.build/assets.cjs");
const gitHelper = require("../git-helper.cjs");
const shortcuts = require("../.build/shortcuts.cjs");
const keyProbe = require("../key-probe.cjs");

const root = path.resolve(__dirname, "..", "..");
const workspace = process.env.RME_WORKSPACE;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(check, message, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs)
      throw new Error(`Timed out: ${message}`);
    await sleep(100);
  }
}

/** A stand-in for the webview panel. The tests act as the webview. */
function fakePanel({ strict = false } = {}) {
  let isDisposed = false;
  const received = new vscode.EventEmitter();
  const disposed = new vscode.EventEmitter();
  const viewState = new vscode.EventEmitter();
  const posted = [];
  const webview = {
    options: {},
    html: "",
    cspSource: "vscode-resource:",
    onDidReceiveMessage: received.event,
    postMessage: async (message) => {
      // A real panel refuses a message after it is closed. A strict fake does the same, so the test sees such a post.
      if (strict && isDisposed) {
        throw new Error("Webview is disposed");
      }
      posted.push(message);
      return true;
    },
    asWebviewUri: (uri) => uri,
  };
  const panel = {
    webview,
    visible: true,
    onDidDispose: disposed.event,
    onDidChangeViewState: viewState.event,
  };
  return {
    panel,
    webview,
    posted,
    send: (message) => received.fire(message),
    /** Tell the provider that the editor was hidden or shown again. */
    setVisible: (visible) => {
      panel.visible = visible;
      viewState.fire({ webviewPanel: panel });
    },
    dispose: () => {
      isDisposed = true;
      disposed.fire();
    },
    of: (type) => posted.filter((m) => m.type === type),
  };
}

/** What VS Code gives to `activate`, as far as the provider uses it. */
const providerContext = () => ({
  extensionUri: vscode.Uri.file(root),
  extension: vscode.extensions.getExtension(
    "clydedsouza.crazy-rich-markdown-editor",
  ),
});

/** `prepare(filePath)` runs after the file is written. `strict` makes a panel that refuses a message after it is closed. */
async function openWithProvider(file, content, { prepare, strict } = {}) {
  const filePath = path.join(workspace, file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  if (prepare) {
    prepare(filePath);
  }
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(filePath),
  );
  const provider = new MarkdownEditorProvider(providerContext());
  const fake = fakePanel({ strict });
  await provider.resolveCustomTextEditor(
    document,
    fake.panel,
    new vscode.CancellationTokenSource().token,
  );
  fake.send({ type: "ready" });
  await sleep(50);
  return { document, provider, fake };
}

async function replaceAll(document, text) {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(0, 0, document.lineCount, 0),
    text,
  );
  await vscode.workspace.applyEdit(edit);
}

/** Replace a function of the VS Code API while a test runs, and record the calls. Call `restore` at the end. */
function spy(object, name, answer) {
  const original = object[name];
  const calls = [];
  object[name] = (...args) => {
    calls.push(args);
    return answer ? answer(...args) : undefined;
  };
  assert.notEqual(object[name], original, `the test can replace ${name}`);
  return { calls, restore: () => (object[name] = original) };
}

/** The tab of the Settings editor, when it is open. */
const settingsTab = () =>
  vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find((tab) => tab.label === "Settings");
const closeSettings = async () => {
  const tab = settingsTab();
  if (tab) {
    await vscode.window.tabGroups.close(tab);
  }
};

/** The file that the active editor tab shows. */
const activeTabPath = () => {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input && input.uri ? input.uri.fsPath : undefined;
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------- Host protocol, with a fake webview ----------

test("the webview page has a strict CSP and loads the bundle", async () => {
  const { fake } = await openWithProvider("html.md", "x\n");
  const html = fake.webview.html;
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-[0-9a-f]{32}'/);
  assert.match(html, /<script nonce="[0-9a-f]{32}" src=".*dist\/webview\.js"/);
  assert.match(html, /href=".*dist\/webview\.css"/);
  assert.match(html, /<div id="editor">/);
  assert.match(
    html,
    /<div id="stats" class="rme-stats" hidden><\/div>/,
    "the page has the bar for the counts",
  );
  assert.doesNotMatch(html, /unsafe-eval/);
  fake.dispose();
});

test("the host sends the date that the file was last saved, and no authors for a file outside Git", async () => {
  const { fake } = await openWithProvider("fileinfo-plain.md", "x\n");
  const info = await waitFor(
    () => fake.of("fileInfo").at(-1),
    "the file info message",
  );
  assert.ok(
    Math.abs(Date.now() - info.modified) < 120000,
    `the file was written a moment ago: ${info.modified}`,
  );
  assert.deepEqual(info.authors, []);
  fake.dispose();
});

test("the date changes after a save, also when VS Code does not watch the folder", async () => {
  fs.mkdirSync(path.join(workspace, "nowatch"), { recursive: true });
  const files = vscode.workspace.getConfiguration("files");
  await files.update(
    "watcherExclude",
    { "**/nowatch/**": true },
    vscode.ConfigurationTarget.Workspace,
  );
  try {
    await sleep(1500);
    const { document, fake } = await openWithProvider("nowatch/doc.md", "x\n");
    const first = await waitFor(
      () => fake.of("fileInfo").at(-1),
      "the first file info message",
    );

    // The folder is not watched, so a write from outside must not change the date. This proves the set up.
    await sleep(1100);
    fs.writeFileSync(document.uri.fsPath, "x\n");
    await sleep(2500);
    assert.equal(
      fake.of("fileInfo").filter((message) => message.modified > first.modified)
        .length,
      0,
      "the watcher is off in this folder",
    );

    // A save in VS Code still changes the date: the editor does not depend on the watcher.
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(0, 1), "y");
    await vscode.workspace.applyEdit(edit);
    await document.save();
    const later = await waitFor(
      () =>
        fake
          .of("fileInfo")
          .find((message) => message.modified > first.modified),
      "a later date after the save",
    );
    assert.ok(later.modified > first.modified);
    fake.dispose();
  } finally {
    await files.update(
      "watcherExclude",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }
});

test("the host sends the new date after the file is saved", async () => {
  const { document, fake } = await openWithProvider("fileinfo-save.md", "x\n");
  const first = await waitFor(
    () => fake.of("fileInfo").at(-1),
    "the first file info message",
  );
  await sleep(1100);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(document.uri, new vscode.Position(0, 1), "y");
  await vscode.workspace.applyEdit(edit);
  await document.save();
  const later = await waitFor(
    () =>
      fake.of("fileInfo").find((message) => message.modified > first.modified),
    "a later date",
  );
  assert.ok(later.modified - first.modified >= 1000);
  fake.dispose();
});

test("a file that has no date shows no date, and not the year 1970", async () => {
  const { fake } = await openWithProvider("notime/doc.md", "x\n", {
    prepare: (file) => fs.utimesSync(file, 0, 0),
  });
  const info = await waitFor(
    () => fake.of("fileInfo").at(-1),
    "the file info message",
  );
  assert.equal(info.modified, undefined, "the time 0 is not a date");
  assert.deepEqual(info.authors, []);
  fake.dispose();
});

test("a refresh that ends after the editor closed posts nothing to the closed panel", async () => {
  const rejections = [];
  const onRejection = (reason) => rejections.push(String(reason));
  process.on("unhandledRejection", onRejection);
  try {
    const { fake } = await openWithProvider("closed/doc.md", "x\n", {
      strict: true,
    });
    const before = fake.posted.length;
    fake.send({ type: "ready" }); // This starts a refresh. The refresh needs a moment: it reads the time of the file from the disk.
    fake.dispose(); // The editor closes before the refresh ends.
    await sleep(800);
    assert.deepEqual(rejections, [], "a post to a closed panel fails");
    assert.equal(
      fake.posted.length,
      before + 1,
      "only the init message went out, before the editor closed",
    );
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

// These tests make a repository in the temporary folder of the test workspace. The project folder is never a repository.
const gitTest = gitHelper.gitAvailable()
  ? test
  : (name) => console.log(`  skip ${name} (git is not installed)`);

gitTest(
  "the host sends the authors of the last Git commits, newest first",
  async () => {
    const repo = path.join(workspace, "git-authors");
    gitHelper.makeRepo(repo, [
      {
        file: "docs/guide.md",
        content: "one\n",
        author: "Alice Smith <alice@example.org>",
        date: "2026-01-05T10:00:00Z",
        message: "Add the guide",
      },
      {
        file: "docs/guide.md",
        content: "one\ntwo\n",
        author: "Bob Lee <bob@example.org>",
        date: "2026-02-10T11:30:00Z",
        message: "Fix the guide",
      },
    ]);
    const { fake } = await openWithProvider(
      "git-authors/docs/guide.md",
      "one\ntwo\n",
    );
    const info = await waitFor(
      () => fake.of("fileInfo").find((message) => message.authors.length > 0),
      "the authors from Git",
    );
    assert.deepEqual(
      info.authors.map((author) => author.name),
      ["Bob Lee", "Alice Smith"],
    );
    assert.equal(info.authors[0].subject, "Fix the guide");
    assert.equal(info.authors[0].date, Date.parse("2026-02-10T11:30:00Z"));
    fake.dispose();
  },
);

gitTest(
  "the host reads the authors again when the window gets the focus, and only while the editor shows",
  async () => {
    const repo = path.join(workspace, "git-focus");
    gitHelper.makeRepo(repo, [
      {
        file: "doc.md",
        content: "one\n",
        author: "Alice Smith <alice@example.org>",
        date: "2026-01-05T10:00:00Z",
        message: "Add",
      },
    ]);
    // The window state is the state of the real window, which a test cannot change. So the test catches the listener of the provider.
    const listeners = [];
    const original = vscode.window.onDidChangeWindowState;
    vscode.window.onDidChangeWindowState = (listener, ...rest) => {
      listeners.push(listener);
      return original.call(vscode.window, listener, ...rest);
    };
    let fake;
    try {
      ({ fake } = await openWithProvider("git-focus/doc.md", "one\n"));
    } finally {
      vscode.window.onDidChangeWindowState = original;
    }
    assert.ok(
      listeners.length >= 1,
      "the provider listens to the state of the window",
    );
    await waitFor(
      () => fake.of("fileInfo").find((message) => message.authors.length === 1),
      "the first author",
    );

    // The write of the file may make the watcher send the date again. That does not read Git, so the authors do not change.
    gitHelper.commit(repo, {
      file: "doc.md",
      content: "one\ntwo\n",
      author: "Bob Lee <bob@example.org>",
      date: "2026-02-10T11:30:00Z",
      message: "More",
    });
    const sawBob = () =>
      fake.of("fileInfo").some((message) => message.authors.length === 2);
    const tell = (state) =>
      listeners.forEach((listener) =>
        listener({ focused: false, active: false, ...state }),
      );

    tell({ focused: false });
    await sleep(1500);
    assert.equal(
      sawBob(),
      false,
      "a window that loses the focus does not read Git",
    );

    fake.panel.visible = false; // The editor is hidden. This sets the flag and fires no event of the panel.
    tell({ focused: true });
    await sleep(1500);
    assert.equal(
      sawBob(),
      false,
      "a hidden editor does not read Git, also when the window gets the focus",
    );

    fake.panel.visible = true;
    tell({ focused: true });
    const info = await waitFor(
      () => fake.of("fileInfo").find((message) => message.authors.length === 2),
      "the new author after the window got the focus",
    );
    assert.deepEqual(
      info.authors.map((author) => author.name),
      ["Bob Lee", "Alice Smith"],
    );
    fake.dispose();
  },
);

gitTest(
  "the host reads the authors again when the editor is shown again, and a new commit adds a person",
  async () => {
    const repo = path.join(workspace, "git-refresh");
    gitHelper.makeRepo(repo, [
      {
        file: "page.md",
        content: "one\n",
        author: "Alice Smith <alice@example.org>",
        date: "2026-01-05T10:00:00Z",
        message: "Add the page",
      },
    ]);
    const { fake } = await openWithProvider("git-refresh/page.md", "one\n");
    await waitFor(
      () => fake.of("fileInfo").find((message) => message.authors.length === 1),
      "the first author",
    );
    gitHelper.commit(repo, {
      file: "page.md",
      content: "one\ntwo\n",
      author: "Bob Lee <bob@example.org>",
      date: "2026-02-10T11:30:00Z",
      message: "Second line",
    });
    fake.setVisible(true);
    const info = await waitFor(
      () => fake.of("fileInfo").find((message) => message.authors.length === 2),
      "the second author",
    );
    assert.deepEqual(
      info.authors.map((author) => author.name),
      ["Bob Lee", "Alice Smith"],
    );
    fake.dispose();
  },
);

gitTest(
  "the host sends no authors when Git is turned off in VS Code",
  async () => {
    const repo = path.join(workspace, "git-off");
    gitHelper.makeRepo(repo, [
      {
        file: "page.md",
        content: "one\n",
        author: "Alice Smith <alice@example.org>",
        date: "2026-01-05T10:00:00Z",
        message: "Add the page",
      },
    ]);
    const { document, fake } = await openWithProvider(
      "git-off/page.md",
      "one\n",
    );
    await waitFor(
      () => fake.of("fileInfo").find((message) => message.authors.length === 1),
      "the author",
    );
    const git = vscode.workspace.getConfiguration("git", document.uri);
    const before = fake.of("fileInfo").length;
    await git.update("enabled", false, vscode.ConfigurationTarget.Workspace);
    try {
      await waitFor(() => {
        const all = fake.of("fileInfo");
        return all.length > before && all.at(-1).authors.length === 0;
      }, "a message without authors");
    } finally {
      await git.update(
        "enabled",
        undefined,
        vscode.ConfigurationTarget.Workspace,
      );
    }
    await waitFor(
      () => fake.of("fileInfo").at(-1).authors.length === 1,
      "the author again when Git is back",
    );
    fake.dispose();
  },
);

test("the date changes when another program writes the file, also when the text stays the same", async () => {
  const { document, fake } = await openWithProvider(
    "fileinfo-outside.md",
    "same text\n",
  );
  const first = await waitFor(
    () => fake.of("fileInfo").at(-1),
    "the first file info message",
  );
  await sleep(1100);
  fs.writeFileSync(document.uri.fsPath, "same text\n");
  const later = await waitFor(
    () =>
      fake.of("fileInfo").find((message) => message.modified > first.modified),
    "a later date after the outside write",
    30000,
  );
  assert.ok(later.modified - first.modified >= 1000);
  fake.dispose();
});

gitTest("the host sends no authors when the setting is off", async () => {
  const repo = path.join(workspace, "git-setting");
  gitHelper.makeRepo(repo, [
    {
      file: "page.md",
      content: "one\n",
      author: "Alice Smith <alice@example.org>",
      date: "2026-01-05T10:00:00Z",
      message: "Add the page",
    },
  ]);
  const { document, fake } = await openWithProvider(
    "git-setting/page.md",
    "one\n",
  );
  await waitFor(
    () => fake.of("fileInfo").find((message) => message.authors.length === 1),
    "the author",
  );
  const settings = vscode.workspace.getConfiguration(
    "richMarkdown",
    document.uri,
  );
  const before = fake.of("fileInfo").length;
  await settings.update(
    "showLastAuthors",
    false,
    vscode.ConfigurationTarget.Workspace,
  );
  try {
    await waitFor(() => {
      const all = fake.of("fileInfo");
      return all.length > before && all.at(-1).authors.length === 0;
    }, "a message without authors");
  } finally {
    await settings.update(
      "showLastAuthors",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }
  await waitFor(
    () => fake.of("fileInfo").at(-1).authors.length === 1,
    "the author again when the setting is back",
  );
  fake.dispose();
});

test("local resource roots include the extension output and the document folder", async () => {
  const { fake } = await openWithProvider("roots.md", "x\n");
  const roots = fake.webview.options.localResourceRoots.map(
    (uri) => uri.fsPath,
  );
  assert.ok(roots.includes(path.join(root, "dist")), roots.join());
  assert.ok(roots.includes(workspace), roots.join());
  assert.equal(fake.webview.options.enableScripts, true);
  fake.dispose();
});

test("ready makes the host send the document text", async () => {
  const { fake } = await openWithProvider("ready.md", "# Hello\n\nworld\n");
  const [init] = fake.of("init");
  assert.equal(init.text, "# Hello\n\nworld\n");
  assert.equal(typeof init.baseUri, "string");
  assert.equal(init.maxContentWidth, 820);
  assert.equal(init.showInfoBar, true, "the bar at the top is on by default");
  fake.dispose();
});

test("the host tells the webview that a file is MDX, and that a Markdown file is not", async () => {
  const mdx = await openWithProvider(
    "page.mdx",
    "import A from './a'\n\n# Hello\n\n<A />\n",
  );
  assert.equal(mdx.fake.of("init")[0].mdx, true, "an .mdx file");
  mdx.fake.dispose();
  const upper = await openWithProvider("UPPER.MDX", "# Hello\n");
  assert.equal(
    upper.fake.of("init")[0].mdx,
    true,
    "the extension may be in capital letters",
  );
  upper.fake.dispose();
  const markdown = await openWithProvider("page.md", "# Hello\n");
  assert.equal(markdown.fake.of("init")[0].mdx, false, "a .md file");
  markdown.fake.dispose();
});

test("an edit from the webview changes only the changed range of the document", async () => {
  const { document, fake } = await openWithProvider(
    "edit.md",
    "# Title\n\nSome text here.\n\nLast line.\n",
  );
  const changes = [];
  const subscription = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document === document) changes.push(...e.contentChanges);
  });
  fake.send({
    type: "edit",
    text: "# Title\n\nSome **text** here.\n\nLast line.\n",
  });
  await waitFor(() => document.getText().includes("**text**"), "document edit");
  subscription.dispose();
  assert.equal(
    document.getText(),
    "# Title\n\nSome **text** here.\n\nLast line.\n",
  );
  assert.equal(document.isDirty, true);
  assert.equal(changes.length, 1, "one small range");
  assert.equal(changes[0].text, "**text**");
  assert.equal(
    changes[0].rangeLength,
    "text".length,
    "only the word was replaced",
  );
  assert.equal(
    changes[0].range.start.line,
    2,
    "the change stays on its own line",
  );
  assert.equal(changes[0].range.end.line, 2);
  fake.dispose();
});

test("an edit from the webview does not echo back to the webview", async () => {
  const { document, fake } = await openWithProvider("echo.md", "one\n");
  fake.send({ type: "edit", text: "one two\n" });
  await waitFor(() => document.getText() === "one two\n", "document edit");
  await sleep(300);
  assert.equal(fake.of("update").length, 0);
  fake.dispose();
});

test("a change from outside goes to the webview, and the webview answer causes no change", async () => {
  const { document, fake } = await openWithProvider("outside.md", "before\n");
  await replaceAll(document, "after the outside edit\n");
  await waitFor(() => fake.of("update").length === 1, "update message");
  assert.equal(fake.of("update")[0].text, "after the outside edit\n");
  const version = document.version;
  fake.send({ type: "edit", text: "after the outside edit\n" });
  await sleep(300);
  assert.equal(document.version, version);
  assert.equal(fake.of("update").length, 1);
  fake.dispose();
});

test("fast edits keep the newest text and send no stale update", async () => {
  const { document, fake } = await openWithProvider("fast.md", "");
  const texts = ["a\n", "ab\n", "abc\n", "abcd\n", "abcde\n", "abcdef\n"];
  for (const text of texts) fake.send({ type: "edit", text });
  await waitFor(() => document.getText() === "abcdef\n", "final text");
  await sleep(300);
  assert.equal(document.getText(), "abcdef\n");
  assert.equal(fake.of("update").length, 0, "no stale update");
  fake.dispose();
});

test("an identical edit leaves the document alone, and the host does not fail", async () => {
  const { document, fake } = await openWithProvider("same.md", "same\n");
  const version = document.version;
  // An error inside the message handler would not stop the test. It would show as an unhandled rejection.
  const failures = [];
  const onFailure = (reason) =>
    failures.push(String((reason && reason.stack) || reason));
  process.on("unhandledRejection", onFailure);
  try {
    fake.send({ type: "edit", text: "same\n" });
    await sleep(400);
  } finally {
    process.off("unhandledRejection", onFailure);
  }
  assert.deepEqual(failures, []);
  assert.equal(document.version, version);
  assert.equal(document.isDirty, false);
  fake.dispose();
});

test("a file with CRLF line endings keeps them after a webview edit", async () => {
  const { document, fake } = await openWithProvider(
    "crlf.md",
    "# Title\r\n\r\nline\r\n",
  );
  assert.equal(document.eol, vscode.EndOfLine.CRLF);
  const changes = [];
  const subscription = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document === document) changes.push(...e.contentChanges);
  });
  fake.send({ type: "edit", text: "# Title\n\nline **bold**\n" });
  await waitFor(() => document.getText().includes("**bold**"), "document edit");
  subscription.dispose();
  assert.equal(document.getText(), "# Title\r\n\r\nline **bold**\r\n");
  assert.equal(
    document.getText().replace(/\r\n/g, "").includes("\n"),
    false,
    "no lone LF",
  );
  // The editor compares the text with line endings of the file, so it replaces only what changed. Not the rest of the file.
  assert.equal(changes.length, 1, "one small range");
  assert.equal(changes[0].text, " **bold**");
  assert.equal(changes[0].rangeLength, 0);
  assert.equal(changes[0].range.start.line, 2);
  fake.dispose();
});

test("the width setting reaches the webview", async () => {
  const { fake } = await openWithProvider("width.md", "x\n");
  const config = vscode.workspace.getConfiguration("richMarkdown");
  await config.update(
    "maxContentWidth",
    640,
    vscode.ConfigurationTarget.Workspace,
  );
  try {
    await waitFor(
      () => fake.of("config").some((m) => m.maxContentWidth === 640),
      "config message",
    );
  } finally {
    await config.update(
      "maxContentWidth",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }
  fake.dispose();
});

test("with the bar turned off, the host tells the webview and reads no file info", async () => {
  const config = vscode.workspace.getConfiguration("richMarkdown");
  await config.update(
    "showInfoBar",
    false,
    vscode.ConfigurationTarget.Workspace,
  );
  try {
    const { fake } = await openWithProvider("infobar-off.md", "x\n");
    assert.equal(fake.of("init")[0].showInfoBar, false);
    await sleep(500);
    assert.equal(
      fake.of("fileInfo").length,
      0,
      "no date and no Git while the bar is off",
    );

    // Turn it on while the editor is open: the webview learns it, and gets the date.
    await config.update(
      "showInfoBar",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
    await waitFor(
      () => fake.of("config").some((message) => message.showInfoBar === true),
      "the config message that turns the bar on",
    );
    const info = await waitFor(
      () => fake.of("fileInfo").at(-1),
      "the file info after the bar is turned on",
    );
    assert.ok(info.modified > 0);

    // And off again.
    await config.update(
      "showInfoBar",
      false,
      vscode.ConfigurationTarget.Workspace,
    );
    await waitFor(
      () => fake.of("config").some((message) => message.showInfoBar === false),
      "the config message that turns the bar off",
    );
    fake.dispose();
  } finally {
    await config.update(
      "showInfoBar",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }
});

test("after dispose the host ignores further document changes", async () => {
  const { document, fake } = await openWithProvider("dispose.md", "x\n");
  fake.dispose();
  await replaceAll(document, "y\n");
  await sleep(200);
  assert.equal(fake.of("update").length, 0);
});

// ---------- Assets ----------

const config = () => vscode.workspace.getConfiguration("richMarkdown");
const setAssetFolder = (value) =>
  config().update("assetFolder", value, vscode.ConfigurationTarget.Workspace);
const bytes = (...values) => new Uint8Array(values);

async function withAssetFolder(value, fn) {
  await setAssetFolder(value);
  try {
    return await fn();
  } finally {
    await setAssetFolder(undefined);
  }
}

async function upload(fake, name, mime, data) {
  const before = fake.of("insertMedia").length;
  fake.send({ type: "saveAsset", name, mime, data });
  await waitFor(
    () => fake.of("insertMedia").length > before,
    `insertMedia for ${name}`,
  );
  return fake.of("insertMedia")[before].items;
}

const exists = (file) => fs.existsSync(path.join(workspace, file));

test("helper: sanitizeFileName removes folders and unsafe characters", () => {
  assert.equal(assets.sanitizeFileName("../../evil.png"), "evil.png");
  assert.equal(
    assets.sanitizeFileName("C:\\Users\\me\\My Photo.PNG"),
    "My-Photo.png",
  );
  assert.equal(assets.sanitizeFileName("a<b>:c|d?.jpg"), "abcd.jpg");
  assert.equal(assets.sanitizeFileName(".hidden.png"), "hidden.png");
  assert.equal(assets.sanitizeFileName("", "image/png"), "file.png");
  assert.equal(
    assets.sanitizeFileName("noextension", "video/mp4"),
    "noextension.mp4",
  );
  assert.equal(assets.sanitizeFileName("x".repeat(200) + ".png").length, 84);
});

test("helper: mediaKind accepts only images and videos", () => {
  assert.equal(assets.mediaKind("a.PNG"), "image");
  assert.equal(assets.mediaKind("a.mov"), "video");
  assert.equal(assets.mediaKind("blob", "image/webp"), "image");
  assert.equal(assets.mediaKind("script.js"), undefined);
  assert.equal(
    assets.mediaKind("run.sh", "image/png"),
    undefined,
    "a wrong extension is not saved",
  );
  assert.equal(assets.mediaKind("a.html", "text/html"), undefined);
});

test("helper: clipboard images get a name with the time", () => {
  const now = new Date(2026, 9, 24, 18, 5, 9);
  assert.equal(
    assets.clipboardFileName("image.png", now),
    "image-20261024-180509.png",
  );
  assert.equal(assets.clipboardFileName("holiday.png", now), "holiday.png");
  assert.equal(assets.altText("image-20261024-180509.png"), "image");
  assert.equal(assets.altText("team-photo_2.png"), "team photo 2");
});

test("helper: relativeLink escapes each part of the path", () => {
  const doc = vscode.Uri.file("/w/docs/guide.md");
  assert.equal(
    assets.relativeLink(doc, vscode.Uri.file("/w/docs/assets/a.png")),
    "assets/a.png",
  );
  assert.equal(
    assets.relativeLink(doc, vscode.Uri.file("/w/docs/assets/my pic (1).png")),
    "assets/my%20pic%20%281%29.png",
  );
  assert.equal(
    assets.relativeLink(doc, vscode.Uri.file("/w/img/a.png")),
    "../img/a.png",
  );
  assert.equal(
    assets.relativeLink(doc, vscode.Uri.file("/w/docs/a.png")),
    "a.png",
  );
});

test("helper: resolveAssetFolder reads the setting and its variables", () => {
  const doc = vscode.Uri.file(path.join(workspace, "notes", "guide.md"));
  const rel = (uri) =>
    path.relative(workspace, uri.fsPath).split(path.sep).join("/");
  assert.equal(rel(assets.resolveAssetFolder("assets", doc)), "notes/assets");
  assert.equal(rel(assets.resolveAssetFolder("", doc)), "notes");
  assert.equal(rel(assets.resolveAssetFolder(".", doc)), "notes");
  assert.equal(
    rel(assets.resolveAssetFolder("../shared/img", doc)),
    "shared/img",
  );
  assert.equal(
    rel(
      assets.resolveAssetFolder("${documentBasenameNoExtension}.assets", doc),
    ),
    "notes/guide.assets",
  );
  assert.equal(
    rel(assets.resolveAssetFolder("media/${documentBasenameNoExtension}", doc)),
    "notes/media/guide",
  );
  assert.equal(
    rel(assets.resolveAssetFolder("${workspaceFolder}/docs/images", doc)),
    "docs/images",
  );
  assert.equal(
    rel(assets.resolveAssetFolder("${documentDirname}/pics", doc)),
    "notes/pics",
  );
  assert.equal(
    assets.resolveAssetFolder("/tmp/rme-abs", doc).fsPath,
    path.resolve("/tmp/rme-abs"),
  );
});

test("a pasted image is copied to the assets folder next to the document", async () => {
  const { fake } = await openWithProvider("paste/doc.md", "x\n");
  const items = await upload(fake, "image.png", "image/png", bytes(1, 2, 3));
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "image");
  assert.match(items[0].src, /^assets\/image-\d{8}-\d{6}\.png$/);
  assert.equal(items[0].alt, "image");
  assert.deepEqual(
    [...fs.readFileSync(path.join(workspace, "paste", items[0].src))],
    [1, 2, 3],
  );
  fake.dispose();
});

test("a dropped file keeps its name, and spaces become hyphens", async () => {
  const { fake } = await openWithProvider("drop/doc.md", "x\n");
  const items = await upload(fake, "Team Photo.JPG", "image/jpeg", bytes(9, 9));
  assert.equal(items[0].src, "assets/Team-Photo.jpg");
  assert.equal(items[0].alt, "Team Photo");
  assert.equal(exists("drop/assets/Team-Photo.jpg"), true);
  fake.dispose();
});

test("a video is saved and reported as a video", async () => {
  const { fake } = await openWithProvider("video/doc.md", "x\n");
  const items = await upload(fake, "demo.mp4", "video/mp4", bytes(7, 7, 7));
  assert.deepEqual(items, [{ kind: "video", src: "assets/demo.mp4", alt: "" }]);
  assert.equal(exists("video/assets/demo.mp4"), true);
  fake.dispose();
});

test("the same file is not saved twice, and other content gets a number", async () => {
  const { fake } = await openWithProvider("dupes/doc.md", "x\n");
  const first = await upload(fake, "a.png", "image/png", bytes(1, 1));
  const same = await upload(fake, "a.png", "image/png", bytes(1, 1));
  const other = await upload(fake, "a.png", "image/png", bytes(2, 2, 2));
  const third = await upload(fake, "a.png", "image/png", bytes(3));
  assert.equal(first[0].src, "assets/a.png");
  assert.equal(same[0].src, "assets/a.png");
  assert.equal(other[0].src, "assets/a-1.png");
  assert.equal(third[0].src, "assets/a-2.png");
  assert.deepEqual(
    fs.readdirSync(path.join(workspace, "dupes", "assets")).sort(),
    ["a-1.png", "a-2.png", "a.png"],
  );
  assert.deepEqual(
    [...fs.readFileSync(path.join(workspace, "dupes/assets/a.png"))],
    [1, 1],
    "the first file is not changed",
  );
  fake.dispose();
});

test("a file name with folders cannot leave the asset folder", async () => {
  const { fake } = await openWithProvider("trap/doc.md", "x\n");
  const items = await upload(
    fake,
    "../../../escape.png",
    "image/png",
    bytes(5),
  );
  assert.equal(items[0].src, "assets/escape.png");
  assert.equal(exists("trap/assets/escape.png"), true);
  assert.equal(exists("escape.png"), false);
  fake.dispose();
});

test("a file that is not an image or video is not saved", async () => {
  const { fake } = await openWithProvider("reject/doc.md", "x\n");
  fake.send({
    type: "saveAsset",
    name: "evil.sh",
    mime: "application/x-sh",
    data: bytes(1),
  });
  fake.send({
    type: "saveAsset",
    name: "page.html",
    mime: "image/png",
    data: bytes(1),
  });
  fake.send({
    type: "saveAsset",
    name: "a.png",
    mime: "image/png",
    data: "not bytes",
  });
  await sleep(500);
  assert.equal(fake.of("insertMedia").length, 0);
  assert.equal(exists("reject/assets"), false, "no folder was made");
  fake.dispose();
});

test("the asset folder setting changes where files go", async () => {
  await withAssetFolder("${documentBasenameNoExtension}.assets", async () => {
    const { fake } = await openWithProvider("setting/readme.md", "x\n");
    const items = await upload(fake, "a.png", "image/png", bytes(1));
    assert.equal(items[0].src, "readme.assets/a.png");
    assert.equal(exists("setting/readme.assets/a.png"), true);
    fake.dispose();
  });
  await withAssetFolder(".", async () => {
    const { fake } = await openWithProvider("setting/same.md", "x\n");
    const items = await upload(fake, "b.png", "image/png", bytes(2));
    assert.equal(items[0].src, "b.png");
    assert.equal(exists("setting/b.png"), true);
    fake.dispose();
  });
  await withAssetFolder("${workspaceFolder}/shared/images", async () => {
    const { fake } = await openWithProvider("setting/deep/doc.md", "x\n");
    const items = await upload(fake, "c.png", "image/png", bytes(3));
    assert.equal(items[0].src, "../../shared/images/c.png");
    assert.equal(exists("shared/images/c.png"), true);
    fake.dispose();
  });
});

test("the webview may load files from the asset folder, even outside the document folder", async () => {
  await withAssetFolder("${workspaceFolder}/shared/images", async () => {
    const { fake } = await openWithProvider("roots2/doc.md", "x\n");
    const roots = fake.webview.options.localResourceRoots.map(
      (uri) => uri.fsPath,
    );
    assert.ok(
      roots.includes(path.join(workspace, "shared", "images")),
      roots.join(),
    );
    fake.dispose();
  });
});

test("too large a file only shows a warning", async () => {
  const warnings = spy(vscode.window, "showWarningMessage");
  try {
    const { fake } = await openWithProvider("large/doc.md", "x\n");
    fake.send({ type: "assetTooLarge", name: "big.mov" });
    await waitFor(() => warnings.calls.length > 0, "the warning");
    assert.match(warnings.calls[0][0], /^"big\.mov" is larger than 50 MB\./);
    assert.match(
      warnings.calls[0][0],
      /slash menu item "Image or video"/,
      "the warning says what to do",
    );
    assert.equal(fake.of("insertMedia").length, 0);
    fake.dispose();
  } finally {
    warnings.restore();
  }
});

test("a file of 50 MB is saved, and a file of one byte more is refused with a warning", async () => {
  const warnings = spy(vscode.window, "showWarningMessage");
  try {
    const { fake } = await openWithProvider("limit/doc.md", "x\n");
    fake.send({
      type: "saveAsset",
      name: "big.png",
      mime: "image/png",
      data: new Uint8Array(50 * 1024 * 1024 + 1),
    });
    await waitFor(() => warnings.calls.length > 0, "the warning");
    assert.match(warnings.calls[0][0], /^"big\.png" is too large\.$/);
    await sleep(200);
    assert.equal(fake.of("insertMedia").length, 0);
    assert.equal(exists("limit/assets"), false, "nothing was written");

    fake.send({
      type: "saveAsset",
      name: "edge.png",
      mime: "image/png",
      data: new Uint8Array(50 * 1024 * 1024),
    });
    const insert = await waitFor(
      () => fake.of("insertMedia")[0],
      "the file at the limit",
      60000,
    );
    assert.equal(insert.items[0].src, "assets/edge.png");
    assert.equal(
      fs.statSync(path.join(workspace, "limit", "assets", "edge.png")).size,
      50 * 1024 * 1024,
    );
    assert.equal(warnings.calls.length, 1, "no second warning");
    fake.dispose();
  } finally {
    warnings.restore();
  }
});

test("the page allows only what it needs, and every page has its own nonce", async () => {
  const one = await openWithProvider("csp-one/doc.md", "x\n");
  const two = await openWithProvider("csp-two/doc.md", "x\n");
  const nonceOf = (html) => /<script nonce="([0-9a-f]{32})"/.exec(html)[1];
  const policyOf = (html) =>
    Object.fromEntries(
      /Content-Security-Policy" content="([^"]+)"/
        .exec(html)[1]
        .split("; ")
        .map((part) => {
          const [name, ...values] = part.split(" ");
          return [name, values];
        }),
    );
  const html = one.fake.webview.html;
  const nonce = nonceOf(html);
  const policy = policyOf(html);
  assert.deepEqual(
    policy["default-src"],
    ["'none'"],
    "everything that is not listed is blocked",
  );
  assert.deepEqual(
    policy["script-src"],
    [`'nonce-${nonce}'`],
    "only the script of the page runs: no unsafe-inline, no unsafe-eval",
  );
  assert.deepEqual(policy["style-src"], [
    "vscode-resource:",
    "'unsafe-inline'",
  ]);
  assert.deepEqual(
    policy["img-src"],
    ["vscode-resource:", "https:", "data:"],
    "local, web and pasted images",
  );
  assert.deepEqual(policy["media-src"], ["vscode-resource:", "https:"]);
  assert.deepEqual(policy["font-src"], ["vscode-resource:"]);
  assert.deepEqual(Object.keys(policy).sort(), [
    "default-src",
    "font-src",
    "img-src",
    "media-src",
    "script-src",
    "style-src",
  ]);
  assert.match(
    html,
    new RegExp(
      `<script nonce="${nonce}" src="[^"]*dist/webview\\.js" data-mermaid="[^"]*dist/mermaid\\.js">`,
    ),
  );
  assert.notEqual(
    nonceOf(two.fake.webview.html),
    nonce,
    "a new nonce for each page",
  );
  one.fake.dispose();
  two.fake.dispose();
});

test("the webview may load files from every workspace folder, also for a document in a subfolder", async () => {
  const { fake } = await openWithProvider("roots3/deep/doc.md", "x\n");
  const roots = fake.webview.options.localResourceRoots.map(
    (uri) => uri.fsPath,
  );
  assert.ok(roots.includes(workspace), `the workspace folder: ${roots.join()}`);
  assert.ok(
    roots.includes(path.join(workspace, "roots3", "deep")),
    "the folder of the document",
  );
  assert.ok(
    roots.includes(path.join(workspace, "roots3", "deep", "assets")),
    "the default asset folder",
  );
  assert.ok(
    roots.includes(path.join(root, "dist")),
    "the folder of the editor bundle",
  );
  fake.dispose();
});

// ---------- Links ----------

test("a link to a file opens that file: relative, in another folder, with escapes, with a query or a heading, or absolute", async () => {
  fs.mkdirSync(path.join(workspace, "links", "sub dir"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "links", "other.md"), "# Other\n");
  fs.writeFileSync(
    path.join(workspace, "links", "sub dir", "two.md"),
    "# Two\n",
  );
  const { fake } = await openWithProvider("links/doc.md", "x\n");
  const opens = async (href, expected) => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    fake.send({ type: "openLink", href });
    await waitFor(
      () => activeTabPath() === expected,
      `${href} to open ${expected}`,
    );
  };
  await opens("other.md", path.join(workspace, "links", "other.md"));
  await opens(
    "sub%20dir/two.md",
    path.join(workspace, "links", "sub dir", "two.md"),
  );
  await opens(
    "sub%20dir/two.md#heading",
    path.join(workspace, "links", "sub dir", "two.md"),
  );
  await opens("other.md?plain=1", path.join(workspace, "links", "other.md"));
  await opens("../doc.md", path.join(workspace, "doc.md"));
  await opens(
    path.join(workspace, "links", "other.md"),
    path.join(workspace, "links", "other.md"),
  );
  await opens(
    "sub dir/two.md",
    path.join(workspace, "links", "sub dir", "two.md"),
  );
  fake.dispose();
});

test("a link to a heading, or to a file that does not exist, opens nothing and the user gets a warning for the file", async () => {
  const warnings = spy(vscode.window, "showWarningMessage");
  const external = spy(vscode.env, "openExternal", () => true);
  try {
    const { fake } = await openWithProvider("links2/doc.md", "x\n");
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    const commands = [];
    const original = vscode.commands.executeCommand;
    vscode.commands.executeCommand = (...args) => {
      commands.push(args[0]);
      return original.apply(vscode.commands, args);
    };
    try {
      fake.send({ type: "openLink", href: "#some-heading" });
      await sleep(500);
    } finally {
      vscode.commands.executeCommand = original;
    }
    assert.equal(activeTabPath(), undefined, "a heading link opens no file");
    assert.deepEqual(
      commands.filter((name) => name === "vscode.open"),
      [],
      "a heading link does not try to open anything, not even the folder of the document",
    );
    assert.equal(warnings.calls.length, 0, "and it is not an error");

    fake.send({ type: "openLink", href: "missing.md" });
    await waitFor(
      () => warnings.calls.length > 0,
      "the warning for a missing file",
    );
    assert.equal(warnings.calls[0][0], "Cannot open link target: missing.md");
    assert.equal(activeTabPath(), undefined);
    assert.equal(external.calls.length, 0);
    fake.dispose();
  } finally {
    warnings.restore();
    external.restore();
  }
});

test("a web or mail link opens outside VS Code, and no other kind of address does", async () => {
  const warnings = spy(vscode.window, "showWarningMessage");
  const external = spy(vscode.env, "openExternal", () => true);
  try {
    const { fake } = await openWithProvider("links3/doc.md", "x\n");
    for (const href of [
      "https://example.com/a?b=1",
      "http://example.com",
      "HTTPS://UPPER.example.com",
      "mailto:a@example.org",
      "tel:+123456",
    ]) {
      const before = external.calls.length;
      fake.send({ type: "openLink", href });
      await waitFor(
        () => external.calls.length > before,
        `${href} to open outside VS Code`,
      );
      assert.equal(
        external.calls.at(-1)[0].toString(),
        vscode.Uri.parse(href).toString(),
      );
    }
    const count = external.calls.length;
    for (const href of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "vscode://anything/x",
      "data:text/html,hi",
    ]) {
      fake.send({ type: "openLink", href });
    }
    await waitFor(
      () => warnings.calls.length >= 4,
      "a warning for each of these",
    );
    assert.equal(
      external.calls.length,
      count,
      "none of these opens outside VS Code",
    );
    assert.deepEqual(
      warnings.calls.map((call) => call[0]).sort(),
      [
        "data:text/html,hi",
        "file:///etc/passwd",
        "javascript:alert(1)",
        "vscode://anything/x",
      ]
        .map((href) => `Cannot open link target: ${href}`)
        .sort(),
      "a warning for each address, and no more",
    );
    fake.dispose();
  } finally {
    warnings.restore();
    external.restore();
  }
});

// ---------- Messages to the user ----------

test("a file that is not an image or video gets a warning with its name", async () => {
  const warnings = spy(vscode.window, "showWarningMessage");
  try {
    const { fake } = await openWithProvider("reject2/doc.md", "x\n");
    fake.send({
      type: "saveAsset",
      name: `${"n".repeat(100)}.sh`,
      mime: "application/x-sh",
      data: bytes(1),
    });
    await waitFor(() => warnings.calls.length > 0, "the warning");
    assert.equal(
      warnings.calls[0][0],
      `"${"n".repeat(80)}" is not an image or a video, so it was not saved.`,
      "the name is cut at 80 characters",
    );
    fake.dispose();
  } finally {
    warnings.restore();
  }
});

test("the settings button of the bar opens the settings of this extension, and only the settings of this extension", async () => {
  const { fake } = await openWithProvider("settings/doc.md", "x\n");
  const calls = [];
  const original = vscode.commands.executeCommand;
  vscode.commands.executeCommand = (...args) => {
    calls.push(args);
    return original.apply(vscode.commands, args);
  };
  try {
    fake.send({ type: "openSettings" });
    await waitFor(() => settingsTab(), "the Settings editor");
    const opened = calls.filter(
      ([name]) => name === "workbench.action.openSettings",
    );
    assert.equal(opened.length, 1, "one click opens the settings once");
    const { publisher, name } = vscode.extensions.getExtension(
      "clydedsouza.crazy-rich-markdown-editor",
    ).packageJSON;
    assert.deepEqual(
      opened[0],
      ["workbench.action.openSettings", `@ext:${publisher}.${name}`],
      "the list shows only the settings of this extension",
    );
    assert.deepEqual(
      calls.filter(([command]) => command === "vscode.open"),
      [],
      "it opens no file",
    );
  } finally {
    vscode.commands.executeCommand = original;
    await closeSettings();
    fake.dispose();
  }
});

test("the editor name in the dropdown differs from the extension name", async () => {
  const extension = vscode.extensions.getExtension(
    "clydedsouza.crazy-rich-markdown-editor",
  );
  const editor = extension.packageJSON.contributes.customEditors[0];
  assert.notEqual(editor.displayName, extension.packageJSON.displayName);
});

// ---------- A real webview, driven from the test ----------
// These tests load the real editor bundle in a real VS Code webview.
// An extra script in the page does what a user does, and reports what it sees.

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const FAKE_MP4 = "AAAAGGZ0eXBtcDQyAAAAAGlzb21tcDQyAAAAAA==";

const REAL_DOC = [
  "# Real webview",
  "",
  "Hello world text for the toolbar.",
  "",
  "```ts",
  "const answer: number = 42;",
  "```",
  "",
  "```",
  "plain block",
  "```",
  "",
  "H<sub>2</sub>O and E=mc<sup>2</sup> and <ins>under</ins> and :tada: and `#0969DA`.",
  "",
  "> [!NOTE]",
  "> Alert text.",
  "",
  "A footnote[^1].",
  "",
  "[^1]: The footnote text.",
  "",
  "Inline math $E = mc^2$ here.",
  "",
  "$$",
  "\\int_0^1 x\\,dx",
  "$$",
  "",
  "```mermaid",
  "graph TD",
  "  A[Start] --> B[Done]",
  "```",
  "",
  "<details>",
  "<summary>Raw</summary>",
  "",
  "inside",
  "",
  "</details>",
  "",
].join("\n");

let realWebview;

/** Open a file in a new panel with a real webview, and the driver script in its page. */
async function launchRealWebview(file, content) {
  const filePath = path.join(workspace, "real", file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(filePath),
  );

  const panel = vscode.window.createWebviewPanel(
    "rme.e2e",
    "RME e2e",
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true },
  );
  const provider = new MarkdownEditorProvider(providerContext());
  await provider.resolveCustomTextEditor(
    document,
    panel,
    new vscode.CancellationTokenSource().token,
  );

  // Add the driver to the page of the provider. The wrapper lets both scripts share the one VS Code API object.
  const nonce = /script-src 'nonce-([0-9a-f]+)'/.exec(panel.webview.html)[1];
  const check = require("../gfm-check.cjs");
  const driver = fs
    .readFileSync(path.join(__dirname, "webview-driver.js"), "utf8")
    .replace("/*__KEY_PROBE__*/", () => keyProbe.SOURCE)
    .replace(
      "/*__GFM_CHECK__*/",
      `const countDocument = ${check.COUNT_SOURCE};\nconst readDom = ${check.READ_DOM_SOURCE};`,
    );
  panel.webview.html = panel.webview.html
    .replace(
      /<script nonce="[0-9a-f]+" src=/,
      `<script nonce="${nonce}">const original = acquireVsCodeApi; let shared; window.acquireVsCodeApi = () => (shared ??= { ...original() });</script>\n  $&`,
    )
    .replace("</body>", `<script nonce="${nonce}">${driver}</script></body>`);

  const pending = new Map();
  let nextId = 1;
  panel.webview.onDidReceiveMessage((message) => {
    if (message && message.type === "test:result" && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    }
  });

  const run = (name, args = {}, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The webview did not answer "${name}".`));
      }, timeoutMs);
      pending.set(id, (result) => {
        clearTimeout(timer);
        if (result && result.error) {
          reject(
            new Error(`In the webview, "${name}" failed: ${result.error}`),
          );
        } else {
          resolve(result);
        }
      });
      void panel.webview.postMessage({ type: "test:run", id, name, args });
    });

  // The page needs time to load. Ask until it answers.
  await waitFor(
    async () => {
      try {
        const answer = await run("ping", {}, 1500);
        return answer.ready;
      } catch {
        return false;
      }
    },
    "the real webview to load",
    30000,
  );

  return { panel, document, run };
}

/** The panel that most real webview tests share. It shows `doc.md`. */
async function startRealWebview() {
  realWebview ??= await launchRealWebview("doc.md", REAL_DOC);
  return realWebview;
}

test("real webview: the page uses the VS Code theme", async () => {
  const { run } = await startRealWebview();
  const theme = await run("theme");
  assert.match(theme.bodyClass, /vscode-(dark|light|high-contrast)/);
  assert.notEqual(theme.editorBackground, "", "the theme variables are set");
  assert.notEqual(theme.fontFamily, "");
  assert.notEqual(
    theme.background,
    "rgba(0, 0, 0, 0)",
    "the page has a background",
  );
});

test("real webview: the GitHub parts show as rich content", async () => {
  const { run } = await startRealWebview();
  const counts = await run("counts");
  assert.equal(counts.alerts, 1, `alert: ${JSON.stringify(counts)}`);
  assert.deepEqual(counts.footnoteRefs, ["1"], "footnote mark is numbered");
  assert.deepEqual(counts.footnoteDefs, ["1"], "footnote text is numbered");
  assert.deepEqual(counts.emoji, ["🎉"], "emoji code");
  assert.equal(counts.swatches, 1, "color swatch");
  assert.equal(counts.sub, 1, `sub: ${JSON.stringify(counts)}`);
  assert.equal(counts.sup, 1, `sup: ${JSON.stringify(counts)}`);
  assert.equal(counts.underline, 1, `underline: ${JSON.stringify(counts)}`);
  assert.ok(counts.keywordSpans > 0, "the ts block has colors");
  assert.deepEqual(counts.languageLabels, [
    "TypeScript",
    "Plain text",
    "Mermaid",
  ]);
  assert.equal(counts.katexInline, 1, "inline math is drawn");
  assert.equal(counts.katexBlock, 1, "a math block is drawn");
  assert.equal(counts.htmlBlocks, 2, "the HTML blocks are kept");
});

test("real webview: a mermaid diagram is drawn by the real library, and math fonts load", async () => {
  const { run } = await startRealWebview();
  const drawn = await run("diagram", {}, 60000);
  assert.equal(
    drawn.found,
    true,
    `the diagram was drawn: ${JSON.stringify(drawn)}`,
  );
  assert.ok(
    drawn.text.includes("Start") && drawn.text.includes("Done"),
    `the picture has the labels: ${drawn.text}`,
  );
  assert.ok(drawn.width > 20 && drawn.height > 20, "the picture has a size");
  assert.equal(drawn.error, false);
  assert.equal(
    drawn.katexFont,
    true,
    "the KaTeX font loads from the extension",
  );
});

test("real webview: elements with the hidden attribute take up no space", async () => {
  const { run } = await startRealWebview();
  const result = await run("hiddenElements");
  assert.ok(result.count > 0, "the page has hidden elements to check");
  assert.deepEqual(result.visible, []);
});

test("real webview: the floating toolbar shows above the selected text", async () => {
  const { run } = await startRealWebview();
  const shown = await run("select", { text: "world" });
  assert.equal(shown.visible, true, "toolbar is visible");
  assert.ok(
    shown.bar.bottom <= shown.selection.top + 1,
    `toolbar bottom ${shown.bar.bottom} is above the text top ${shown.selection.top}`,
  );
  assert.ok(shown.bar.top >= 0, "toolbar is not cut off at the top");
  assert.ok(
    shown.bar.left >= 0 && shown.bar.right <= shown.viewport.width,
    `toolbar is inside the window: ${JSON.stringify({ bar: shown.bar, viewport: shown.viewport })}`,
  );
  const barMiddle = (shown.bar.left + shown.bar.right) / 2;
  assert.ok(
    barMiddle >= shown.selection.left - shown.bar.width / 2 &&
      barMiddle <= shown.selection.right + shown.bar.width / 2,
    "toolbar is near the text",
  );
  for (const action of [
    "bold",
    "italic",
    "underline",
    "strike",
    "code",
    "link",
    "h1",
    "h2",
    "h3",
    "bulletList",
    "orderedList",
    "taskList",
    "blockquote",
    "codeBlock",
    "more",
  ]) {
    assert.ok(shown.buttons.includes(action), `button ${action}`);
  }
});

test("real webview: the bold button changes the document", async () => {
  const { run, document } = await startRealWebview();
  await run("click", { action: "bold" });
  await waitFor(
    () => document.getText().includes("**world**"),
    "bold text in the document",
  );
  assert.ok(
    document.getText().includes("Hello **world** text for the toolbar."),
  );
  const shown = await run("select", { text: "world" });
  assert.ok(shown.active.includes("bold"), "the bold button shows the state");
  await run("click", { action: "bold" });
  await waitFor(
    () => !document.getText().includes("**world**"),
    "bold removed",
  );
});

test("real webview: the More menu makes an alert, and the document gets Markdown", async () => {
  const { run, document } = await startRealWebview();
  await run("select", { text: "Hello" });
  const menu = await run("moreMenu", { action: "alert-warning" });
  assert.equal(menu.opened, true);
  assert.equal(menu.closed, true);
  await waitFor(
    () =>
      document
        .getText()
        .includes("> [!WARNING]\n> Hello world text for the toolbar."),
    "warning alert in the document",
  );
});

test("real webview: the toolbar puts all selected lines in one code block, one math block or one diagram", async () => {
  const { run, document } = await startRealWebview();
  try {
    await run("setContent", { markdown: "alpha\n\nbeta\n\ngamma" });
    assert.equal(
      (await run("selectLines", { first: "alpha", last: "gamma" })).visible,
      true,
      "the toolbar shows over the lines",
    );
    await run("click", { action: "codeBlock" });
    await waitFor(
      () => document.getText().includes("```\nalpha\nbeta\ngamma\n```"),
      "one code block with the three lines in the document",
    );
    const code = await run("lineBlocks");
    assert.deepEqual(
      code.codeTexts,
      ["alpha\nbeta\ngamma"],
      "one block in the page, not one for each line",
    );

    await run("setContent", { markdown: "\\frac{a}{b}\n\nx_1 + y_2" });
    await run("selectLines", { first: "frac", last: "y_2" });
    const math = await run("moreMenu", { action: "mathBlock" });
    assert.equal(math.opened, true);
    assert.equal(math.closed, true);
    await waitFor(
      () => document.getText().includes("$$\n\\frac{a}{b}\nx_1 + y_2\n$$"),
      "one math block with the two lines in the document",
    );
    const drawn = await run("lineBlocks");
    assert.equal(drawn.mathBlocks, 1);
    assert.equal(drawn.drawnMath, 1, "KaTeX drew the formula");

    await run("setContent", { markdown: "graph TD\n\nA[Start] --> B[Done]" });
    await run("selectLines", { first: "graph", last: "Done" });
    await run("moreMenu", { action: "diagram" });
    await waitFor(
      () =>
        document
          .getText()
          .includes("```mermaid\ngraph TD\nA[Start] --> B[Done]\n```"),
      "one mermaid block with the two lines in the document",
    );
    const picture = await run("diagram", {}, 60000);
    assert.equal(
      picture.found,
      true,
      `mermaid drew the diagram: ${JSON.stringify(picture)}`,
    );
    assert.ok(
      picture.text.includes("Start") && picture.text.includes("Done"),
      `the picture has the labels: ${picture.text}`,
    );
    assert.deepEqual((await run("lineBlocks")).languages, ["mermaid"]);
  } finally {
    // Put the text of the other tests back. Do not close the text tab of the file, as `restoreRealDocument` does:
    // the tests after this one run with the tab as the earlier edits left it.
    await sleep(500); // The page sends its last edit after a short delay.
    await replaceAll(document, REAL_DOC);
    await run("setContent", { markdown: REAL_DOC });
  }
});

test("real webview: the language picker changes the fence in the document", async () => {
  const { run, document } = await startRealWebview();
  const result = await run("pickLanguage", { index: 1, language: "python" });
  assert.equal(result.opened, true);
  assert.equal(result.closed, true);
  assert.equal(result.label, "Python");
  await waitFor(
    () => document.getText().includes("```python\nplain block\n```"),
    "python fence in the document",
  );
  assert.ok(
    document.getText().includes("```ts\nconst answer"),
    "the other block is not changed",
  );
});

test("real webview: a pasted image is copied to the assets folder and shows in the editor", async () => {
  const { run, document } = await startRealWebview();
  const result = await run("paste", {
    name: "image.png",
    type: "image/png",
    base64: PNG_1X1,
  });
  assert.equal(result.prevented, true);
  await waitFor(
    () =>
      /!\[image\]\(assets\/image-\d{8}-\d{6}\.png\)/.test(document.getText()),
    "image link in the document",
  );
  const link = /!\[image\]\((assets\/image-\d{8}-\d{6}\.png)\)/.exec(
    document.getText(),
  )[1];
  const saved = fs.readFileSync(path.join(workspace, "real", link));
  assert.deepEqual(
    [...saved],
    [...Buffer.from(PNG_1X1, "base64")],
    "the file has the same bytes",
  );
  // The webview must load the file from the asset folder.
  const media = await waitFor(async () => {
    const answer = await run("media");
    return answer.images.length > 0 &&
      answer.images.every((img) => img.complete)
      ? answer
      : undefined;
  }, "the pasted image to load");
  assert.equal(
    media.images[0].naturalWidth,
    1,
    "the image loaded from the asset folder",
  );
  assert.ok(
    media.images[0].src.includes("assets/"),
    "the webview shows the file from the asset folder",
  );
  assert.ok(
    !document.getText().includes("vscode-resource") &&
      !document.getText().includes("vscode-cdn"),
    "the file has no webview address",
  );
});

test("real webview: a dropped video is copied to the assets folder and shows as a player", async () => {
  const { run, document } = await startRealWebview();
  const result = await run("drop", {
    name: "My Clip.mp4",
    type: "video/mp4",
    base64: FAKE_MP4,
  });
  assert.equal(result.prevented, true);
  await waitFor(
    () =>
      document
        .getText()
        .includes('<video src="assets/My-Clip.mp4" controls></video>'),
    "video tag in the document",
  );
  await sleep(1500);
  assert.equal(
    (document.getText().match(/My-Clip\.mp4/g) || []).length,
    1,
    "the file is inserted once: a drop on the text is handled by the editor only, not also by the page",
  );
  const text = document.getText();
  assert.ok(
    text.indexOf('<video src="assets/My-Clip.mp4"') < text.indexOf("```ts"),
    "the video is where the file was dropped (at the first paragraph), not at the end of the document",
  );
  assert.equal(
    fs.existsSync(path.join(workspace, "real", "assets", "My-Clip.mp4")),
    true,
  );
  const media = await run("media");
  assert.equal(media.videos.length, 1);
  assert.ok(media.videos[0].includes("assets/My-Clip.mp4"));
});

test("real webview: a file dropped on the margin of the page is copied, and VS Code does not take the drop", async () => {
  const { run, document } = await startRealWebview();
  const result = await run("dropOnMargin", {
    name: "Margin Pic.png",
    type: "image/png",
    base64: PNG_1X1,
  });
  assert.equal(result.insideText, false, "the target is outside the text area");
  assert.equal(
    result.enterPrevented,
    true,
    "the first drag event is marked as handled, so VS Code does not open the file",
  );
  assert.equal(result.overPrevented, true);
  assert.equal(result.dropPrevented, true);
  await waitFor(
    () => document.getText().includes("![Margin Pic](assets/Margin-Pic.png)"),
    "image link in the document",
  );
  assert.equal(
    fs.existsSync(path.join(workspace, "real", "assets", "Margin-Pic.png")),
    true,
  );
});

test("real webview: a pasted text file is ignored", async () => {
  const { run, document } = await startRealWebview();
  const before = document.getText();
  const result = await run("paste", {
    name: "notes.txt",
    type: "text/plain",
    base64: "aGk=",
  });
  assert.equal(result.prevented, false, "the editor lets other pastes through");
  await sleep(500);
  assert.equal(document.getText(), before);
  assert.equal(
    fs.existsSync(path.join(workspace, "real", "assets", "notes.txt")),
    false,
  );
});

test("real webview: the bar at the top shows the lines, words and characters, and keeps them current", async () => {
  const { run, document } = await startRealWebview();
  const linesOf = (text) =>
    text === ""
      ? 0
      : text.split(/\r\n|\r|\n/).length - (/[\r\n]$/.test(text) ? 1 : 0);

  // The earlier tests changed the file. Wait until the page and the file agree.
  const before = await waitFor(async () => {
    const stats = await run("stats");
    return stats.found && stats.lines === linesOf(document.getText())
      ? stats
      : undefined;
  }, "the line count to match the file");
  assert.equal(before.hidden, false, "the bar is shown");
  assert.match(before.text, /lines.*words.*characters/);
  assert.equal(before.position, "sticky");
  assert.equal(before.top, 0, "the bar is at the top of the page");
  assert.ok(
    before.right > before.width - 40,
    "the numbers are at the right edge",
  );
  assert.ok(
    before.words > 20 && before.characters > before.words,
    JSON.stringify(before),
  );

  const scrolled = await run("statsWhenScrolled");
  assert.ok(scrolled.scrollY > 0, "the page can scroll");
  assert.equal(
    scrolled.top,
    0,
    "the bar stays at the top when the page scrolls",
  );

  // A change from outside the editor, for example another editor tab or a Git checkout.
  const added = "Quokka zebra marmot.";
  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    document.uri,
    document.lineAt(document.lineCount - 1).range.end,
    `\n${added}\n`,
  );
  await vscode.workspace.applyEdit(edit);
  const afterOutside = await waitFor(async () => {
    const stats = await run("stats");
    return stats.words === before.words + 3 ? stats : undefined;
  }, "the words to change after an outside edit");
  assert.equal(afterOutside.characters, before.characters + added.length);
  assert.equal(afterOutside.lines, linesOf(document.getText()));
  assert.ok(afterOutside.lines > before.lines, "the new line is counted");

  // Typing in the editor.
  await run("typeAtEnd", { text: " fox" });
  const afterTyping = await waitFor(async () => {
    const stats = await run("stats");
    return stats.words === afterOutside.words + 1 ? stats : undefined;
  }, "the words to change after typing");
  assert.equal(afterTyping.characters, afterOutside.characters + " fox".length);
  await waitFor(
    () => document.getText().includes("marmot. fox"),
    "the typed text in the file",
  );
  assert.equal(
    afterTyping.lines,
    linesOf(document.getText()),
    "the line count is the line count of the file",
  );
});

test("real webview: the bar shows the date from the host, and the authors when the host sends them", async () => {
  const { run, panel } = await startRealWebview();

  // The real provider sent the date of the file. The file is not in Git, so there are no authors.
  const first = await waitFor(async () => {
    const facts = await run("barFacts");
    return facts.modified.hidden ? undefined : facts;
  }, "the date of the file in the bar");
  assert.deepEqual(first.order, [
    "authors",
    "modified",
    "lines",
    "words",
    "characters",
  ]);
  assert.match(first.modified.text, /^Modified .+\d/);
  assert.equal(first.authors.hidden, true);

  const people = [
    {
      name: "Alice Smith",
      date: Date.UTC(2026, 0, 5, 10),
      subject: "Add intro",
    },
    {
      name: "Bob Lee",
      date: Date.UTC(2026, 1, 10, 11),
      subject: "Fix the table",
    },
    { name: "Carol Diaz", date: Date.UTC(2026, 2, 1, 9), subject: "Reword" },
    { name: "Dan Wu", date: Date.UTC(2026, 3, 2, 9), subject: "Typo" },
  ];
  await panel.webview.postMessage({
    type: "fileInfo",
    modified: Date.UTC(2026, 3, 2, 12),
    authors: people,
  });
  const shown = await waitFor(async () => {
    const facts = await run("barFacts");
    return facts.authors.hidden ? undefined : facts;
  }, "the authors in the bar");
  assert.equal(
    shown.authors.text,
    "Edited by Alice Smith, Bob Lee, Carol Diaz +1",
  );
  assert.match(shown.authors.title, /Dan Wu, .*2026.*: Typo/);
  assert.match(shown.modified.text, /^Modified .*2026/);

  await panel.webview.postMessage({
    type: "fileInfo",
    modified: Date.UTC(2026, 3, 2, 12),
    authors: [],
  });
  await waitFor(
    async () => (await run("barFacts")).authors.hidden,
    "the authors to go away",
  );
});

test("real webview: the settings button is at the end of the bar, and a click opens the settings of this extension", async () => {
  const { run } = await startRealWebview();
  const button = await run("settingsButton");
  assert.equal(button.found, true);
  assert.equal(
    button.text,
    "Settings",
    "the button shows its text on a wide editor",
  );
  assert.equal(button.label, "Open the extension settings");
  assert.notEqual(button.labelDisplay, "none", "the text is not hidden");
  assert.ok(button.labelWidth > 20, `the text has room: ${button.labelWidth}`);
  assert.ok(
    button.iconWidth >= 12 && button.iconWidth <= 16,
    `the icon has a size: ${button.iconWidth}`,
  );
  assert.ok(
    button.right <= button.width && button.right > button.width - 40,
    `the button is at the right end of the bar: ${button.right} of ${button.width}`,
  );
  assert.equal(
    button.top >= 0 && button.bottom <= 40,
    true,
    "the button is inside the bar",
  );
  assert.notEqual(button.color, button.background, "the icon can be seen");

  const calls = [];
  const original = vscode.commands.executeCommand;
  vscode.commands.executeCommand = (...args) => {
    calls.push(args);
    return original.apply(vscode.commands, args);
  };
  try {
    const clicked = await run("clickSettings");
    assert.deepEqual(
      clicked.sent,
      [{ type: "openSettings" }],
      "the page sends one message",
    );
    await waitFor(() => settingsTab(), "the Settings editor");
    const { publisher, name } = vscode.extensions.getExtension(
      "clydedsouza.crazy-rich-markdown-editor",
    ).packageJSON;
    assert.deepEqual(
      calls.filter(([command]) => command === "workbench.action.openSettings"),
      [["workbench.action.openSettings", `@ext:${publisher}.${name}`]],
    );
  } finally {
    vscode.commands.executeCommand = original;
    await closeSettings();
  }
});

test("real webview: the shortcuts button opens the list over the page, and Escape, the dark layer and the links work", async () => {
  const { run } = await startRealWebview();
  const external = spy(vscode.env, "openExternal", () => true);
  try {
    const before = await run("shortcutsState");
    assert.equal(before.found, true, "the window is on the page");
    assert.equal(before.open, false, "and closed");
    assert.equal(
      before.visible,
      false,
      "a closed window takes no room on the page",
    );

    const opened = await run("shortcutsOpen");
    assert.equal(opened.open, true);
    assert.equal(opened.visible, true);
    assert.equal(opened.title, "Keyboard shortcuts");
    assert.deepEqual(opened.groups, [
      "Text",
      "Headings",
      "Lists",
      "Blocks",
      "Editing",
      "Menus",
      "Links",
    ]);
    assert.ok(
      opened.rows >= 25,
      `the window lists the shortcuts: ${opened.rows}`,
    );
    assert.deepEqual(
      opened.bold,
      process.platform === "darwin" ? ["⌘", "B"] : ["Ctrl", "B"],
      "the keys fit the system of the user",
    );
    assert.match(
      opened.activeClass,
      /rme-modal-close/,
      "the focus is in the window",
    );
    assert.equal(
      opened.coversBar,
      true,
      "the window is over the bar at the top",
    );
    assert.equal(opened.dialogInside, true, "the window fits in the editor");
    assert.equal(opened.links.length, 2);
    assert.match(opened.credit, /^Created by /);
    assert.match(opened.links[1].text, /Buy me a coffee/);
    for (const link of opened.links) {
      assert.match(link.href, /^https:\/\//, "a link has a full address");
    }

    // A link goes to the host, which opens it outside VS Code. The window stays open.
    for (const [index, link] of opened.links.entries()) {
      const clicked = await run("clickModalLink", { index });
      assert.equal(
        clicked.prevented,
        true,
        "the page does not follow the link itself",
      );
      assert.equal(clicked.stillOpen, true);
      await waitFor(
        () => external.calls.length === index + 1,
        `the host to open link ${index}`,
      );
      assert.equal(
        external.calls[index][0].toString(),
        vscode.Uri.parse(link.href).toString(),
        "the host opens the address of the link",
      );
    }

    const closed = await run("pressEscape");
    assert.equal(closed.open, false, "Escape closes the window");
    assert.equal(
      closed.activeAction,
      "shortcuts",
      "the focus is back on the button",
    );

    await run("shortcutsOpen");
    const layer = await run("clickBackdrop");
    assert.equal(
      layer.open,
      false,
      "a click on the dark layer closes the window",
    );
    assert.equal(external.calls.length, 2, "nothing else opened");
  } finally {
    external.restore();
    const state = await run("shortcutsState");
    if (state.open) {
      await run("pressEscape");
    }
  }
});

test("real webview: Cmd+S and leaving the editor send the waiting text at once", async () => {
  const { run, document } = await startRealWebview();
  const save = await run("flush", { how: "save", text: "flushed-by-save" });
  assert.equal(save.before, 0, "the short delay has not sent the change yet");
  assert.equal(save.after, 1, "Cmd+S sends it at once");
  await waitFor(
    () => document.getText().includes("flushed-by-save"),
    "the text in the file",
  );

  const blur = await run("flush", { how: "blur", text: "flushed-by-blur" });
  assert.equal(blur.before, 0);
  assert.equal(blur.after, 1, "leaving the editor sends it at once");
  await waitFor(
    () => document.getText().includes("flushed-by-blur"),
    "the text in the file",
  );
});

test("real webview: Ctrl or Cmd plus a click opens a link, a plain click does not, and a heading link scrolls", async () => {
  const { run } = await startRealWebview();
  const external = spy(vscode.env, "openExternal", () => true);
  try {
    const filler = Array.from(
      { length: 60 },
      (_, index) => `Filler paragraph ${index}.`,
    ).join("\n\n");
    const { links } = await run("setContent", {
      markdown: `[web](https://example.com/page?x=1)\n\n[jump](#the-target)\n\n${filler}\n\n## The target\n\n${filler}`,
    });
    assert.deepEqual(links, ["https://example.com/page?x=1", "#the-target"]);

    const title = await run("linkTitle", {
      href: "https://example.com/page?x=1",
    });
    assert.match(
      title.title,
      /^https:\/\/example\.com\/page\?x=1 \((Cmd|Ctrl)\+click to open\)$/,
    );

    const plain = await run("clickLink", {
      href: "https://example.com/page?x=1",
    });
    assert.equal(
      plain.prevented,
      true,
      "the page does not follow the link itself",
    );
    assert.equal(external.calls.length, 0, "a plain click opens nothing");

    const meta = await run("clickLink", {
      href: "https://example.com/page?x=1",
      meta: true,
    });
    assert.equal(meta.prevented, true);
    await waitFor(
      () => external.calls.length === 1,
      "Cmd+click to open the link",
    );
    assert.equal(
      external.calls[0][0].toString(),
      vscode.Uri.parse("https://example.com/page?x=1").toString(),
      "the host opens the address of the link",
    );

    const ctrl = await run("clickLink", {
      href: "https://example.com/page?x=1",
      ctrl: true,
    });
    assert.equal(ctrl.prevented, true);
    await waitFor(
      () => external.calls.length === 2,
      "Ctrl+click to open the link",
    );

    const jump = await run("clickLink", { href: "#the-target", meta: true });
    assert.ok(
      jump.scrollY > 300,
      `the page scrolled to the heading: ${jump.scrollY}`,
    );
    assert.ok(
      jump.headingTop > 30 && jump.headingTop < 45,
      `the heading stops below the bar at the top, not under it: ${jump.headingTop}`,
    );
    assert.equal(
      external.calls.length,
      2,
      "a heading link opens nothing outside the page",
    );
  } finally {
    external.restore();
  }
});

test("real webview: a key that the editor handled does not reach VS Code, and a key that it did not handle does", async () => {
  const { run } = await startRealWebview();
  const bold = await run("keyLeak", { key: "b", shortcut: true });
  assert.equal(
    bold.handled,
    true,
    "Cmd+B or Ctrl+B is the bold shortcut of the editor",
  );
  assert.equal(
    bold.reachedWindow,
    0,
    "VS Code does not see it, so it does not also hide the side bar",
  );
  const other = await run("keyLeak", { key: "F9", shortcut: false });
  assert.equal(other.handled, false);
  assert.equal(
    other.reachedWindow,
    1,
    "a key that the editor does not use goes on to VS Code",
  );
});

// ---------- The keyboard shortcuts, in the real webview of this VS Code ----------

/** The names of the keys of a chord in the way that VS Code writes its default key bindings: `cmd+shift+s`, `ctrl+alt+x`. */
function vscodeKeyName(chord) {
  const named = {
    Enter: "enter",
    Tab: "tab",
    Backspace: "backspace",
    Delete: "delete",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Escape: "escape",
    Space: "space",
  };
  const mods = {
    Mod: process.platform === "darwin" ? "cmd" : "ctrl",
    Shift: "shift",
    Alt: "alt",
  };
  return chord
    .replace(/-(?=.)/g, "\u0000")
    .split("\u0000")
    .map((part) => mods[part] ?? named[part] ?? part.toLowerCase())
    .sort()
    .join("+");
}

/** VS Code's default key bindings, as VS Code lists them in its own file. */
async function readDefaultKeybindings() {
  await vscode.commands.executeCommand(
    "workbench.action.openDefaultKeybindingsFile",
  );
  await waitFor(
    () =>
      vscode.window.activeTextEditor &&
      /keybindings/i.test(
        vscode.window.activeTextEditor.document.uri.toString(),
      ),
    "the file of the default key bindings",
  );
  const text = vscode.window.activeTextEditor.document.getText();
  // Not closeAllEditors: the real webview of the other tests must stay open.
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  const bindings = [];
  for (const match of text
    .replace(/^\s*\/\/.*$/gm, "")
    .matchAll(/\{[^{}]*\}/g)) {
    try {
      const binding = JSON.parse(match[0].replace(/,\s*\}/g, "}"));
      if (binding.key && binding.command && !binding.command.startsWith("-"))
        bindings.push(binding);
    } catch {
      // A piece of text that is not a key binding.
    }
  }
  return bindings;
}

/**
 * Can this default key binding run while a webview editor of this extension has the focus? It cannot when its condition needs the
 * focus in a text editor, a list, a terminal or an input, a widget on the screen, or another kind of editor or view. The test errs
 * on the side of "yes": a binding with a condition that it does not know counts as active, so a new overlap does not go unseen.
 */
function canRunInWebview(when) {
  if (!when) return true;
  const blocked =
    /Focus|Focused|Focussed|Visible|Shown|^editor|^textInput|^notebook|^inChat|^chatInput|^inQuickInput|^inSettings|^inSnippet|^inDebug|^inReference|^inKeybindings|^inlineChat|^inline|^inInline|^suggest|^parameterHints|^renameInput|^codeAction|^findWidget|^replace/;
  const ourEditor = {
    activeEditor: ["WebviewEditor", "workbench.editors.webviewEditor"],
    activeCustomEditorId: ["richMarkdown.editor"],
  };
  return when.split("||").some((alternative) =>
    alternative.split("&&").every((atom) => {
      const text = atom.trim().replace(/^\(+|\)+$/g, "");
      if (text.startsWith("!")) return true; // "not focused" is true in a webview
      const comparison = /^([A-Za-z_][\w.]*)\s*(==|!=)\s*'([^']*)'/.exec(text);
      if (comparison) {
        const [, name, operator, value] = comparison;
        if (ourEditor[name])
          return (operator === "==") === ourEditor[name].includes(value);
        if (name === "focusedView") return operator !== "=="; // The webview editor is not a view of the side bar or the panel.
      }
      const name = /^[A-Za-z_][\w.]*/.exec(text);
      return !name || !blocked.test(name[0]);
    }),
  );
}

/**
 * The key tests change the text with key presses. Put the text of the other tests back, in the file and in the page.
 * After an edit, VS Code opens a text tab for the file next to the test panel. With many edits the tab can become the active one
 * and hide the panel, and a hidden page gets no animation frames. So the test closes the tab and shows the panel again.
 */
async function restoreRealDocument() {
  const { run, document, panel } = await startRealWebview();
  await sleep(500); // The page sends its last edit after a short delay.
  await replaceAll(document, REAL_DOC);
  await run("setContent", { markdown: REAL_DOC });
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (
        tab.input instanceof vscode.TabInputText &&
        tab.input.uri.toString() === document.uri.toString()
      ) {
        await vscode.window.tabGroups.close(tab);
      }
    }
  }
  panel.reveal(undefined, true);
  await waitFor(() => panel.visible, "the test panel to show again");
}

let probedKeys;
async function probeRealKeys() {
  if (!probedKeys) {
    const { run } = await startRealWebview();
    probedKeys = await run("probeKeys");
    await restoreRealDocument();
  }
  return probedKeys;
}

test("real webview: each formatting shortcut of the list does its job with a real keyboard, and VS Code does not see the key", async () => {
  const { run } = await startRealWebview();
  const lines = shortcuts
    .shortcutGroups()
    .slice(0, 4)
    .flatMap((group) => group.items);
  let checked = 0;
  for (const line of lines) {
    if (line.label === "Link") continue; // The test of Cmd or Ctrl plus K opens the link field.
    const format = keyProbe.FORMAT_OF[line.label];
    assert.ok(format, `the test knows the format of "${line.label}"`);
    for (const chord of line.keys) {
      for (const shape of ["win", "mac"]) {
        const result = await run("formatChord", { chord, shape });
        const where = `${line.label}, ${chord}, ${shape} keyboard`;
        assert.deepEqual(
          result.before,
          [],
          `${where}: nothing is on before the key`,
        );
        assert.equal(
          result.handled,
          true,
          `${where}: the editor handles the key`,
        );
        assert.deepEqual(
          result.afterFirst,
          [format],
          `${where}: the key turns on ${format}, and nothing else`,
        );
        assert.deepEqual(
          result.afterSecond,
          [],
          `${where}: the same key turns it off`,
        );
        assert.equal(
          result.reachedWindow,
          0,
          `${where}: VS Code does not see the key, so its own command does not run`,
        );
        checked++;
      }
    }
  }
  assert.equal(checked, 30, "fifteen formats, two keyboards");
  await restoreRealDocument();
});

test("real webview: the keys that VS Code needs for the whole window reach VS Code, and the editor does not change the text", async () => {
  const { run } = await startRealWebview();
  for (const [chord, what] of keyProbe.KEYS_FOR_VS_CODE) {
    for (const shape of ["win", "mac"]) {
      const result = await run("keyReach", { chord, shape });
      assert.equal(
        result.handled,
        false,
        `${chord} (${what}, ${shape} keyboard) is not handled by the editor`,
      );
      assert.equal(
        result.reachedWindow,
        1,
        `${chord} (${what}, ${shape} keyboard) goes on to VS Code`,
      );
      assert.equal(
        result.text,
        "some words here",
        `${chord} does not change the text`,
      );
    }
  }
  await restoreRealDocument();
});

test("real webview: the editor handles every listed key with both keyboards, and no other key except the keys of ordinary text editing", async () => {
  const handled = await probeRealKeys();
  // The toolbar is part of this page, so the key for a link is handled here, and a menu or VS Code handles the other keys.
  const outside = new Set(
    keyProbe.NOT_IN_THE_EDITOR.filter((key) => key !== "Mod-k"),
  );
  const listed = new Set(
    shortcuts
      .shortcutGroups()
      .flatMap((group) => group.items.flatMap((line) => line.keys))
      .filter((key) => !outside.has(key)),
  );
  assert.ok(listed.size >= 20, `the probe checks many keys: ${listed.size}`);
  assert.deepEqual(
    [...listed].filter((key) => !handled[key]),
    [],
    "a listed key that the editor does not handle",
  );
  assert.deepEqual(
    [...listed].filter((key) => handled[key] && handled[key].length < 2),
    [],
    "a listed key that works only on one kind of keyboard",
  );
  const extra = Object.keys(handled).filter(
    (name) => !listed.has(name) && !keyProbe.ORDINARY.test(name),
  );
  assert.deepEqual(
    extra,
    [],
    "a key that the editor handles and the list does not name: VS Code never sees it",
  );
});

/**
 * Keys that the editor takes from VS Code on purpose. The editor handles them only while the text has the focus.
 * Each key means the same in every rich text editor, so the user expects it. [chord, command of VS Code, the reason]
 */
const SHADOWED_ON_PURPOSE = [
  [
    "Mod-b",
    "workbench.action.toggleSidebarVisibility",
    "Bold. Cmd or Ctrl plus B is the key of bold everywhere",
  ],
  [
    "Mod-i",
    "workbench.action.chat.holdToVoiceChatInChatView",
    "Italic. Voice chat needs the key to be held, and Cmd or Ctrl plus I is italic everywhere",
  ],
  [
    "Mod-e",
    "actions.findWithSelection",
    "Inline code. The editor takes it only while the text has the focus",
  ],
  [
    "Mod-e",
    "workbench.action.quickOpen",
    "Inline code. On Windows and Linux, VS Code uses Ctrl+E for Quick Open as well as Ctrl+P",
  ],
  ["Mod-z", "undo", "Undo. The same meaning"],
  ["Mod-Shift-z", "redo", "Redo. The same meaning"],
  ["Mod-y", "redo", "Redo on Windows and Linux. The same meaning"],
];

test("real webview: the keys that the editor handles take only these keys from VS Code, and each one is a decision", async () => {
  const handled = await probeRealKeys();
  const defaults = await readDefaultKeybindings();
  assert.ok(
    defaults.length > 500,
    `VS Code gave its default key bindings: ${defaults.length}`,
  );

  // The key of the Link button has a chord with Cmd or Ctrl plus K as its first part. VS Code starts many chords with it.
  // The editor handles Cmd or Ctrl plus K only when text is selected, and then it opens the link field.
  const chords = Object.keys(handled)
    .filter((name) => !keyProbe.ORDINARY.test(name))
    .concat("Mod-k");
  const taken = {};
  for (const chord of chords) {
    const name = vscodeKeyName(chord);
    for (const binding of defaults) {
      const first = binding.key.split(" ")[0];
      const sameKey = first.toLowerCase().split("+").sort().join("+") === name;
      const isChord = binding.key.includes(" ");
      if (sameKey && !isChord && canRunInWebview(binding.when)) {
        (taken[chord] ??= []).push(binding.command);
      }
    }
  }
  // Show each conflict with its command. A conflict that is not in the list of decisions fails the test.
  const unexpected = [];
  for (const [chord, commands] of Object.entries(taken)) {
    for (const command of new Set(commands)) {
      if (
        !SHADOWED_ON_PURPOSE.some(
          ([decided, decidedCommand]) =>
            decided === chord && decidedCommand === command,
        )
      ) {
        unexpected.push(`${chord} takes ${command} from VS Code`);
      }
    }
  }
  assert.deepEqual(
    unexpected,
    [],
    "The editor handles a key that VS Code uses. Choose another key in webview/shortcuts.ts, or add the key to SHADOWED_ON_PURPOSE with the reason.",
  );
  // The decisions are still true: each key on the list is handled by the editor. Else the list is out of date.
  for (const [chord] of SHADOWED_ON_PURPOSE) {
    assert.ok(handled[chord], `${chord} is still handled by the editor`);
  }
  await restoreRealDocument();
});

test("real webview: the width setting changes the writing column", async () => {
  const { run, panel } = await startRealWebview();
  assert.equal((await run("width")).property, "820px", "the default width");
  await panel.webview.postMessage({
    type: "config",
    maxContentWidth: 555,
    showInfoBar: true,
  });
  await waitFor(
    async () => (await run("width")).property === "555px",
    "the new width",
  );
  await panel.webview.postMessage({
    type: "config",
    maxContentWidth: 820,
    showInfoBar: true,
  });
  await waitFor(
    async () => (await run("width")).property === "820px",
    "the old width again",
  );
});

test("real webview: Ctrl or Cmd plus K puts the focus in the link field, and Escape puts it back in the text", async () => {
  const { run } = await startRealWebview();
  await run("setContent", { markdown: "Hello world text for the toolbar." });
  const opened = await run("linkField", { text: "world" });
  assert.equal(opened.linkMode, true);
  assert.equal(
    opened.focusInField,
    true,
    "the field keeps the focus, so the user can type",
  );
  assert.equal(opened.toolbarVisible, true, "the toolbar stays on the screen");
  const left = await run("leaveLinkField");
  assert.equal(left.linkMode, false);
  assert.equal(left.focusInText, true, "the focus is back in the text");
});

test("real webview: the bar goes away when the setting is off, and comes back when it is on", async () => {
  const { run } = await startRealWebview();
  const before = await run("barState");
  assert.equal(before.hidden, false);
  assert.ok(before.height > 0);

  const settings = vscode.workspace.getConfiguration("richMarkdown");
  await settings.update(
    "showInfoBar",
    false,
    vscode.ConfigurationTarget.Workspace,
  );
  try {
    await waitFor(
      async () => (await run("barState")).hidden,
      "the bar to hide",
    );
    const off = await run("barState");
    assert.equal(off.height, 0, "the bar takes no room");
    assert.equal(off.htmlClass, true, "the page keeps no room for the bar");
  } finally {
    await settings.update(
      "showInfoBar",
      undefined,
      vscode.ConfigurationTarget.Workspace,
    );
  }

  const on = await waitFor(async () => {
    const state = await run("barState");
    return state.hidden ? undefined : state;
  }, "the bar to show again");
  assert.ok(on.height > 0);
  assert.equal(on.htmlClass, false);
  const stats = await waitFor(async () => {
    const answer = await run("stats");
    return answer.words > 0 ? answer : undefined;
  }, "the numbers after the bar is on again");
  assert.ok(stats.characters > 0);
});

test("real webview: every section of the GitHub page shows as the right rich content", async () => {
  const { run } = await startRealWebview();
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "fixtures", "gfm-sections.json"),
      "utf8",
    ),
  );
  assert.equal(fixture.sections.length, 23);
  for (const section of fixture.sections) {
    const result = await run("section", {
      markdown: section.markdown,
      expect: section.expect,
    });
    const where = `GitHub page, "${section.section}"`;
    assert.deepEqual(result.nodes, section.expect.nodes, `${where}: nodes`);
    assert.deepEqual(result.marks, section.expect.marks, `${where}: marks`);
    assert.deepEqual(
      result.dom,
      section.expect.dom ?? {},
      `${where}: elements`,
    );
    (section.expect.values ?? []).forEach((spec, index) => {
      assert.deepEqual(
        result.values[index],
        spec.list,
        `${where}: ${spec.selector} ${spec.of}`,
      );
    });
  }
});

// The examples of the GitHub page itself. The test uses a local copy when there is one, and otherwise it fetches the page source. It skips when it cannot.
// RME_GITHUB_EXAMPLES can name a file that `yarn check:github-page --out file.json` wrote. The test then uses that file.
test("real webview: the examples of the GitHub page itself read and write back", async () => {
  const { run } = await startRealWebview();
  let examples;
  try {
    const file = process.env.RME_GITHUB_EXAMPLES;
    if (file && fs.existsSync(file)) {
      examples = JSON.parse(fs.readFileSync(file, "utf8"));
    } else {
      const { loadExamples } = await import(
        require("node:url").pathToFileURL(
          path.join(root, "scripts", "github-page-extract.mjs"),
        ).href
      );
      examples = await loadExamples();
    }
  } catch (error) {
    console.log(
      `       (skipped: the page cannot be fetched: ${error && error.message})`,
    );
    return;
  }
  assert.ok(examples.length >= 50, `the page has examples: ${examples.length}`);
  const failed = [];
  for (const [index, example] of examples.entries()) {
    const result = await run("roundTrip", { markdown: example.source });
    if (!result.same)
      failed.push(`${index} (${example.section}, ${example.kind})`);
  }
  console.log(
    `       ${examples.length - failed.length}/${examples.length} examples of the page pass in the real webview`,
  );
  assert.deepEqual(failed, []);
});

test("real webview: the file stays valid Markdown after all these edits", async () => {
  const { document, panel } = await startRealWebview();
  const text = document.getText();
  assert.match(text, /^# Real webview\n/);
  assert.ok(text.includes("[^1]: The footnote text."));
  assert.ok(text.includes(":tada:"));
  assert.ok(text.includes("<ins>under</ins>"));
  assert.ok(text.includes("<details>\n<summary>Raw</summary>"));
  panel.dispose();
  realWebview = undefined;
});

test("real webview: front matter, the empty lines after it, and a missing newline at the end are kept", async () => {
  const { run, document } = await startRealWebview();
  const original = "---\ntitle: One\n---\n\n\nBody text here";
  await replaceAll(document, original);
  await waitFor(async () => {
    const panel = await run("frontMatter");
    return !panel.hidden && panel.value === "title: One";
  }, "the front matter panel");

  // The body changes. The front matter, the two empty lines and the missing newline stay as they were.
  await run("typeAtEnd", { text: " more" });
  await waitFor(
    () =>
      document.getText() === "---\ntitle: One\n---\n\n\nBody text here more",
    `the file after typing: ${JSON.stringify(document.getText())}`,
  );

  // The front matter changes. The body stays.
  await run("typeFrontMatter", { value: "title: Two\ntags: [a]" });
  await waitFor(
    () =>
      document.getText() ===
      "---\ntitle: Two\ntags: [a]\n---\n\n\nBody text here more",
    `the file after the front matter changed: ${JSON.stringify(document.getText())}`,
  );

  // A document without front matter hides the panel, and a file that ends with a newline keeps it.
  await replaceAll(document, "Plain text\n");
  await waitFor(
    async () => (await run("frontMatter")).hidden,
    "the panel to hide",
  );
  await run("typeAtEnd", { text: " and more" });
  await waitFor(
    () => document.getText() === "Plain text and more\n",
    `the file ends with a newline: ${JSON.stringify(document.getText())}`,
  );
  realWebview.panel.dispose();
  realWebview = undefined;
});

test("real webview: an MDX file shows its code in boxes with colors, keeps the text, and saves a change", async () => {
  const original = [
    "---",
    "title: MDX page",
    "---",
    "",
    "import { Chart } from '../components/Chart'",
    "",
    "# Title",
    "",
    '<Callout type="warning">',
    "",
    "Some **markdown** inside.",
    "",
    "</Callout>",
    "",
    "<Chart data={[1, 2, 3]} />",
    "",
    "Text with {props.name} and <Badge>new</Badge>.",
    "",
  ].join("\n");
  const { run, document, panel } = await launchRealWebview(
    "page.mdx",
    original,
  );
  try {
    const blocks = await run("mdxBlocks");
    assert.deepEqual(
      blocks.map((block) => block.label),
      ["MDX code", "MDX code", "MDX code"],
      "one box for the import, the component and the chart",
    );
    assert.equal(blocks[0].text, "import { Chart } from '../components/Chart'");
    assert.equal(
      blocks[1].text,
      '<Callout type="warning">\n\nSome **markdown** inside.\n\n</Callout>',
    );
    assert.ok(
      blocks.every((block) => block.colored),
      "the code has colors in a real webview",
    );
    assert.equal(
      blocks[0].boxHeightOk,
      true,
      "the colored copy fits the box and is not cut off",
    );
    assert.equal((await run("frontMatter")).value, "title: MDX page");
    assert.equal(
      (await run("mdxInline")).count,
      2,
      "the expression and the tag are small pieces of code",
    );

    // The selection color must let the colored text show through. An opaque color hid all the text once.
    for (const selector of [".rme-raw textarea", "#frontmatter-input"]) {
      const { alpha, color } = await run("selectionAlpha", { selector });
      assert.ok(
        alpha > 0 && alpha <= 0.5,
        `${selector}: the selection color lets the text show through (${color})`,
      );
    }

    // A change in one box changes that part of the file only.
    await run("typeMdx", {
      index: 2,
      value: '<Chart data={[4, 5]} color="red" />',
    });
    const expected = original.replace(
      "<Chart data={[1, 2, 3]} />",
      '<Chart data={[4, 5]} color="red" />',
    );
    await waitFor(
      () => document.getText() === expected,
      `the file after the change: ${JSON.stringify(document.getText())}`,
    );

    // A change in the text keeps the MDX parts exactly as they were.
    await run("typeAtEnd", { text: " more" });
    await waitFor(
      () =>
        document.getText() ===
        expected.replace("<Badge>new</Badge>.", "<Badge>new</Badge>. more"),
      `the file after typing: ${JSON.stringify(document.getText())}`,
    );
  } finally {
    panel.dispose();
  }
});

// ---------- The real extension, with a real webview ----------

test("the extension activates and exposes its API", async () => {
  const extension = vscode.extensions.getExtension(
    "clydedsouza.crazy-rich-markdown-editor",
  );
  assert.ok(extension, "extension is installed for development");
  await extension.activate();
  assert.equal(typeof extension.exports.getStats, "function");
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("richMarkdown.openRich"));
  assert.ok(commands.includes("richMarkdown.openSource"));
});

test("a Markdown file opens in the rich editor by default and the webview starts", async () => {
  const extension = vscode.extensions.getExtension(
    "clydedsouza.crazy-rich-markdown-editor",
  );
  const api = extension.exports;
  const uri = vscode.Uri.file(path.join(workspace, "doc.md"));
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("vscode.open", uri);

  const tab = await waitFor(() => {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    return active && active.input instanceof vscode.TabInputCustom
      ? active
      : undefined;
  }, "custom editor tab");
  assert.equal(tab.input.viewType, "richMarkdown.editor");
  assert.equal(tab.input.uri.fsPath, uri.fsPath);

  // The webview posts `ready` at the end of its script. This proves that the bundle ran under the CSP.
  const stats = await waitFor(() => {
    const value = api.getStats(uri);
    return value && value.ready >= 1 ? value : undefined;
  }, "webview ready message");
  assert.ok(stats.ready >= 1);
  assert.equal(stats.edits, 0, "opening a file must not edit it");
  const document = await vscode.workspace.openTextDocument(uri);
  assert.equal(
    document.isDirty,
    false,
    "opening a file must not make it dirty",
  );
});

test("an outside change reaches the real webview without an edit coming back", async () => {
  const extension = vscode.extensions.getExtension(
    "clydedsouza.crazy-rich-markdown-editor",
  );
  const api = extension.exports;
  const uri = vscode.Uri.file(path.join(workspace, "doc.md"));
  const document = await vscode.workspace.openTextDocument(uri);
  const before = api.getStats(uri);
  const updatesBefore = before.updates;
  await replaceAll(document, "# Changed\n\nFrom outside.\n");
  await waitFor(() => api.getStats(uri).updates > updatesBefore, "update sent");
  await sleep(800);
  assert.equal(
    api.getStats(uri).edits,
    0,
    "the webview must not answer with an edit",
  );
  assert.equal(document.getText(), "# Changed\n\nFrom outside.\n");
});

test("the source command switches to the text editor and the rich command switches back", async () => {
  const uri = vscode.Uri.file(path.join(workspace, "doc.md"));
  await vscode.commands.executeCommand("richMarkdown.openSource");
  await waitFor(() => {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    return active && active.input instanceof vscode.TabInputText;
  }, "text editor tab");

  await vscode.commands.executeCommand("richMarkdown.openRich", uri);
  await waitFor(() => {
    const active = vscode.window.tabGroups.activeTabGroup.activeTab;
    return active && active.input instanceof vscode.TabInputCustom;
  }, "custom editor tab again");
});

test("hiding the editor and showing it again keeps the page: it does not load again", async () => {
  const extension = vscode.extensions.getExtension(
    "clydedsouza.crazy-rich-markdown-editor",
  );
  const api = extension.exports;
  const file = path.join(workspace, "retain.md");
  fs.writeFileSync(file, "# Retain\n");
  fs.writeFileSync(path.join(workspace, "retain-other.txt"), "other\n");
  const uri = vscode.Uri.file(file);
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("vscode.open", uri);
  await waitFor(() => api.getStats(uri)?.ready >= 1, "the page to start");
  const readyBefore = api.getStats(uri).ready;

  // A second editor in the same group hides the rich editor.
  await vscode.window.showTextDocument(
    vscode.Uri.file(path.join(workspace, "retain-other.txt")),
    { preview: false },
  );
  await waitFor(
    () => activeTabPath()?.endsWith("retain-other.txt"),
    "the other editor to show",
  );
  await sleep(500);
  await vscode.commands.executeCommand("vscode.open", uri);
  await waitFor(
    () => activeTabPath() === file,
    "the rich editor to show again",
  );
  await sleep(1500);
  assert.equal(
    api.getStats(uri).ready,
    readyBefore,
    "the page was not loaded again",
  );
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
});

test("the rich command without an argument opens the file of the active text editor", async () => {
  const file = path.join(workspace, "retain.md");
  fs.writeFileSync(file, "# Active\n");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.window.showTextDocument(vscode.Uri.file(file), {
    preview: false,
  });
  await waitFor(
    () =>
      vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof
      vscode.TabInputText,
    "the text editor",
  );
  await vscode.commands.executeCommand("richMarkdown.openRich");
  await waitFor(() => {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    return input instanceof vscode.TabInputCustom && input.uri.fsPath === file;
  }, "the rich editor for the same file");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
});

test("the rich command without a Markdown file shows a message", async () => {
  const messages = spy(vscode.window, "showInformationMessage");
  try {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.commands.executeCommand("richMarkdown.openRich");
    assert.equal(messages.calls.length, 1);
    assert.equal(messages.calls[0][0], "Open a Markdown file first.");
  } finally {
    messages.restore();
  }
});

exports.run = async function run() {
  const failures = [];
  // RME_ONLY=text runs only the tests with that text in their name. Separate several texts with |.
  // A real webview test starts the shared page by itself.
  const only = process.env.RME_ONLY;
  const selected = only
    ? tests.filter((test) =>
        only.split("|").some((part) => test.name.includes(part)),
      )
    : tests;
  if (only && selected.length === 0) {
    throw new Error(`No VS Code test has "${only}" in its name.`);
  }
  for (const { name, fn } of selected) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (error) {
      failures.push(name);
      console.log(
        `  FAIL ${name}\n       ${String(
          error && error.stack ? error.stack : error,
        )
          .split("\n")
          .join("\n       ")}`,
      );
    }
  }
  console.log(
    `\n${selected.length - failures.length}/${selected.length} VS Code tests passed`,
  );
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} VS Code test(s) failed: ${failures.join("; ")}`,
    );
  }
};
