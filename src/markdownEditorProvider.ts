import { randomBytes } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  MAX_UPLOAD_BYTES,
  MEDIA_EXTENSIONS,
  clipboardFileName,
  copyAsset,
  mediaItem,
  mediaKind,
  resolveAssetFolder,
  sanitizeFileName,
  saveAsset,
} from './assets';
import { FileAuthor, readGitAuthors } from './fileInfo';
import { findSelectionOffsets } from './chatSelection';
import { HostMessage, MediaItem, WebviewMessage } from './protocol';
import { coalesceRefresh } from './refreshQueue';
import { minimalChange } from './textDiff';

export const VIEW_TYPE = 'crazyRichMarkdown.editor';
/** The same editor for `.mdx` files. It has its own ID so that it is an option in "Open With", and `.md` files do not change. */
export const MDX_VIEW_TYPE = 'crazyRichMarkdown.mdxEditor';

export const isMdxFile = (uri: vscode.Uri): boolean => uri.path.toLowerCase().endsWith('.mdx');

/** The part of the API of the Git extension of VS Code that this file uses. */
interface GitExports {
  getAPI(version: 1): { git: { path: string } };
}

let gitProgram: Promise<string> | undefined;

/** The Git program that VS Code uses. It may not be in the PATH, for example on Windows. Else use `git`. */
function gitExecutable(): Promise<string> {
  gitProgram ??= (async () => {
    try {
      const extension = vscode.extensions.getExtension<GitExports>('vscode.git');
      const exports = extension?.isActive ? extension.exports : await extension?.activate();
      return exports?.getAPI(1).git.path || 'git';
    } catch {
      return 'git';
    }
  })();
  return gitProgram;
}

/** When the file was last saved to disk. The result is undefined for a file that has no time, such as a new file. */
async function modifiedTime(uri: vscode.Uri): Promise<number | undefined> {
  try {
    const { mtime } = await vscode.workspace.fs.stat(uri);
    return mtime > 0 ? mtime : undefined;
  } catch {
    return undefined;
  }
}

/** Counters for one open editor. Tests read them to see what the webview did. */
export interface EditorStats {
  /** How many times the webview said it is ready. */
  ready: number;
  /** How many edits the webview sent. */
  edits: number;
  /** How many times the host sent new document text to the webview. */
  updates: number;
}

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly stats = new Map<string, EditorStats>();
  private contextSelection: { panel: vscode.WebviewPanel; document: vscode.TextDocument; text: string } | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  register(): vscode.Disposable {
    const options = {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    };
    return vscode.Disposable.from(
      vscode.window.registerCustomEditorProvider(VIEW_TYPE, this, options),
      vscode.window.registerCustomEditorProvider(MDX_VIEW_TYPE, this, options),
    );
  }

  getStats(uri: vscode.Uri): EditorStats | undefined {
    return this.stats.get(uri.toString());
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const webview = panel.webview;
    const documentFolder = vscode.Uri.joinPath(document.uri, '..');
    const distUri = vscode.Uri.joinPath(this.context.extensionUri, 'dist');

    const assetFolder = (): vscode.Uri =>
      resolveAssetFolder(
        vscode.workspace.getConfiguration('crazyRichMarkdown', document.uri).get<string>('assetFolder', 'assets'),
        document.uri,
      );

    // The webview may load files only from these folders. The asset folder can be outside the others.
    const localResourceRoots = (): vscode.Uri[] => [
      distUri,
      documentFolder,
      assetFolder(),
      ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
    ];

    webview.options = { enableScripts: true, localResourceRoots: localResourceRoots() };
    webview.html = this.renderHtml(webview, distUri);

    const stats: EditorStats = { ready: 0, edits: 0, updates: 0 };
    this.stats.set(document.uri.toString(), stats);

    // The text that the webview currently shows. It stops echo updates between both sides.
    let webviewText = document.getText();
    let pendingText: string | undefined;
    let flushing = false;

    // The webview uses `\n`. Convert its text to the line ending of the file.
    const toDocumentEol = (text: string): string =>
      document.eol === vscode.EndOfLine.CRLF ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n');

    const post = (message: HostMessage): void => {
      void webview.postMessage(message);
    };

    const maxContentWidth = (): number =>
      vscode.workspace.getConfiguration('crazyRichMarkdown').get<number>('maxContentWidth', 820);

    const showInfoBar = (): boolean =>
      vscode.workspace.getConfiguration('crazyRichMarkdown').get<boolean>('showInfoBar', true);

    const pushDocumentToWebview = (): void => {
      stats.updates++;
      webviewText = document.getText();
      post({ type: 'update', text: webviewText });
    };

    // The date and the authors in the bar at the top. The date is cheap to read. The authors need a run of `git log`,
    // so the editor reads them only when the editor opens or shows again, when the window gets focus, and when a setting changes.
    let authors: FileAuthor[] = [];
    let disposed = false;

    const refreshFileInfo = coalesceRefresh(async (readGit) => {
      // With the bar off, the editor reads nothing, and it does not run Git.
      if (!showInfoBar()) {
        return;
      }
      if (readGit) {
        authors = await this.readAuthors(document);
      }
      const modified = await modifiedTime(document.uri);
      if (!disposed) {
        post({ type: 'fileInfo', modified, authors });
      }
    });

    const applyWebviewText = async (text: string): Promise<void> => {
      const change = minimalChange(document.getText(), text);
      if (!change) {
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)),
        change.text,
      );
      await vscode.workspace.applyEdit(edit);
    };

    // Apply webview edits one at a time. Only the newest text matters.
    const flush = async (): Promise<void> => {
      if (flushing) {
        return;
      }
      flushing = true;
      try {
        while (pendingText !== undefined) {
          const text = pendingText;
          pendingText = undefined;
          await applyWebviewText(text);
        }
      } finally {
        flushing = false;
      }
      // An outside change can arrive while edits apply. Send it to the webview now.
      if (document.getText() !== webviewText) {
        pushDocumentToWebview();
      }
    };

    const subscriptions: vscode.Disposable[] = [];
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(documentFolder, path.posix.basename(document.uri.path)),
    );

    subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() !== document.uri.toString()) {
          return;
        }
        if (event.contentChanges.length === 0) {
          return;
        }
        if (flushing || pendingText !== undefined) {
          return;
        }
        if (document.getText() === webviewText) {
          return;
        }
        pushDocumentToWebview();
      }),

      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('crazyRichMarkdown.maxContentWidth') ||
          event.affectsConfiguration('crazyRichMarkdown.showInfoBar')
        ) {
          post({ type: 'config', maxContentWidth: maxContentWidth(), showInfoBar: showInfoBar() });
        }
        // A bar that was off has no date and no authors yet.
        if (event.affectsConfiguration('crazyRichMarkdown.showInfoBar')) {
          void refreshFileInfo(true);
        }
        if (event.affectsConfiguration('crazyRichMarkdown.assetFolder', document.uri)) {
          webview.options = { ...webview.options, localResourceRoots: localResourceRoots() };
        }
        if (
          event.affectsConfiguration('crazyRichMarkdown.showLastAuthors', document.uri) ||
          event.affectsConfiguration('git.enabled', document.uri)
        ) {
          void refreshFileInfo(true);
        }
      }),

      // The time changes when the file is saved here, and when another program writes the file.
      vscode.workspace.onDidSaveTextDocument((saved) => {
        if (saved.uri.toString() === document.uri.toString()) {
          void refreshFileInfo(false);
        }
      }),
      fileWatcher,
      fileWatcher.onDidChange(() => void refreshFileInfo(false)),

      // A commit may have happened while the editor was hidden or the window was in the background.
      panel.onDidChangeViewState((event) => {
        if (event.webviewPanel.visible) {
          void refreshFileInfo(true);
        }
      }),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused && panel.visible) {
          void refreshFileInfo(true);
        }
      }),

      webview.onDidReceiveMessage(async (message: WebviewMessage) => {
        switch (message.type) {
          case 'ready':
            stats.ready++;
            webviewText = document.getText();
            post({
              type: 'init',
              text: webviewText,
              baseUri: webview.asWebviewUri(documentFolder).toString(),
              maxContentWidth: maxContentWidth(),
              showInfoBar: showInfoBar(),
              mdx: isMdxFile(document.uri),
            });
            void refreshFileInfo(true);
            break;

          case 'edit': {
            stats.edits++;
            const text = toDocumentEol(message.text);
            webviewText = text;
            pendingText = text;
            await flush();
            break;
          }

          case 'contextSelection':
            this.contextSelection = { panel, document, text: message.text };
            break;

          case 'pickMedia':
            await this.pickMedia(document.uri, assetFolder(), post);
            break;

          case 'saveAsset':
            await this.saveUpload(document.uri, assetFolder(), message, post);
            break;

          case 'assetTooLarge':
            void vscode.window.showWarningMessage(
              `"${String(message.name).slice(0, 80)}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB. ` +
                'Use the slash menu item "Image or video" to copy it from disk.',
            );
            break;

          case 'openLink':
            await this.openLink(message.href, document.uri);
            break;

          case 'openSettings':
            // `@ext:` limits the list of settings to the ones of this extension.
            await vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${this.context.extension.id}`);
            break;
        }
      }),
    );

    panel.onDidDispose(() => {
      disposed = true;
      subscriptions.forEach((subscription) => subscription.dispose());
      this.stats.delete(document.uri.toString());
      if (this.contextSelection?.panel === panel) {
        this.contextSelection = undefined;
      }
    });
  }

  async addToCopilotChat(): Promise<void> {
    const selection = this.selectedSourceRange();
    if (!selection) {
      return;
    }

    try {
      await this.withSelectedTextEditor(selection, async () => {
        await vscode.commands.executeCommand('workbench.action.chat.attachSelection');
      });
      await vscode.commands.executeCommand('workbench.action.chat.open', { query: '', isPartialQuery: true });
    } catch (error) {
      void vscode.window.showErrorMessage(`Cannot add this selection to Copilot Chat. ${errorText(error)}`);
    }
  }

  async addToClaudeCodeChat(): Promise<void> {
    const selection = this.selectedSourceRange();
    if (!selection) {
      return;
    }
    if (!vscode.extensions.getExtension('anthropic.claude-code')) {
      void vscode.window.showInformationMessage('Install the Claude Code extension to use this action.');
      return;
    }

    try {
      await this.withSelectedTextEditor(selection, async () => {
        // `insertAtMention` reads the selection of the active text editor and writes an
        // `@file#L1-L2` reference into the prompt box of the Claude Code chat that is already
        // open, so no second chat appears. Without an open chat it has nowhere to write and
        // fails; then open one, as before.
        if (await this.insertClaudeMention()) {
          return;
        }
        await vscode.commands.executeCommand('claude-vscode.editor.open');
      });
      await vscode.commands.executeCommand('claude-vscode.focus');
    } catch (error) {
      void vscode.window.showErrorMessage(`Cannot add this selection to Claude Code. ${errorText(error)}`);
    }
  }

  /** False when no open Claude Code chat can take the reference, so the caller opens one. */
  private async insertClaudeMention(): Promise<boolean> {
    try {
      await vscode.commands.executeCommand('claude-vscode.insertAtMention');
      return true;
    } catch {
      return false;
    }
  }

  private selectedSourceRange():
    { document: vscode.TextDocument; range: vscode.Range; panel: vscode.WebviewPanel } | undefined {
    const selection = this.contextSelection;
    if (!selection || selection.text.trim().length === 0) {
      void vscode.window.showInformationMessage('Select text in the Markdown editor first.');
      return undefined;
    }
    const offsets = findSelectionOffsets(selection.document.getText(), selection.text);
    if (!offsets) {
      void vscode.window.showInformationMessage(
        'Could not match this selection to the Markdown source. Try selecting a shorter text range.',
      );
      return undefined;
    }
    return {
      document: selection.document,
      panel: selection.panel,
      range: new vscode.Range(selection.document.positionAt(offsets.start), selection.document.positionAt(offsets.end)),
    };
  }

  private async withSelectedTextEditor<T>(
    selection: { document: vscode.TextDocument; range: vscode.Range; panel: vscode.WebviewPanel },
    action: () => Promise<T>,
  ): Promise<T> {
    const existingTextTab = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .find(
        (tab) =>
          tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === selection.document.uri.toString(),
      );
    const editor = await vscode.window.showTextDocument(selection.document, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });
    const previousSelection = existingTextTab ? editor.selection : undefined;
    editor.selection = new vscode.Selection(selection.range.start, selection.range.end);

    try {
      return await action();
    } finally {
      if (previousSelection) {
        editor.selection = previousSelection;
      } else {
        const textTab = vscode.window.tabGroups.all
          .flatMap((group) => group.tabs)
          .find(
            (tab) =>
              tab.input instanceof vscode.TabInputText &&
              tab.input.uri.toString() === selection.document.uri.toString(),
          );
        if (textTab) {
          await vscode.window.tabGroups.close(textTab);
        }
      }
    }
  }

  /** The people who changed the file in the last Git commits. It is empty when the setting is off or Git has none. */
  private async readAuthors(document: vscode.TextDocument): Promise<FileAuthor[]> {
    if (document.uri.scheme !== 'file') {
      return [];
    }
    const shown = vscode.workspace
      .getConfiguration('crazyRichMarkdown', document.uri)
      .get<boolean>('showLastAuthors', true);
    const gitOn = vscode.workspace.getConfiguration('git', document.uri).get<boolean>('enabled', true);
    return shown && gitOn ? readGitAuthors(document.uri.fsPath, await gitExecutable()) : [];
  }

  /** Let the user choose files. Copy them into the asset folder and tell the webview to insert them. */
  private async pickMedia(
    documentUri: vscode.Uri,
    folder: vscode.Uri,
    post: (message: HostMessage) => void,
  ): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: true,
      defaultUri: vscode.Uri.joinPath(documentUri, '..'),
      filters: { 'Images and videos': MEDIA_EXTENSIONS },
      openLabel: 'Insert',
    });
    if (!picked || picked.length === 0) {
      return;
    }

    const items: MediaItem[] = [];
    try {
      for (const source of picked) {
        const asset = await copyAsset(folder, source);
        const item = mediaItem(documentUri, asset);
        if (item) {
          items.push(item);
        }
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Cannot copy the file to the asset folder. ${errorText(error)}`);
    }
    this.announce(documentUri, folder, items, post);
  }

  /** Save a file that the user pasted or dropped on the editor. */
  private async saveUpload(
    documentUri: vscode.Uri,
    folder: vscode.Uri,
    message: Extract<WebviewMessage, { type: 'saveAsset' }>,
    post: (message: HostMessage) => void,
  ): Promise<void> {
    const bytes = toBytes(message.data);
    const name = typeof message.name === 'string' ? message.name : '';
    const mime = typeof message.mime === 'string' ? message.mime : '';

    if (!bytes) {
      return;
    }
    // Only images and videos may be written. The file name comes from outside.
    if (!mediaKind(name, mime)) {
      void vscode.window.showWarningMessage(`"${name.slice(0, 80)}" is not an image or a video, so it was not saved.`);
      return;
    }
    if (bytes.length > MAX_UPLOAD_BYTES) {
      void vscode.window.showWarningMessage(`"${name.slice(0, 80)}" is too large.`);
      return;
    }

    try {
      const fileName = clipboardFileName(sanitizeFileName(name, mime));
      const asset = await saveAsset(folder, fileName, bytes);
      const item = mediaItem(documentUri, asset);
      this.announce(documentUri, folder, item ? [item] : [], post);
    } catch (error) {
      void vscode.window.showErrorMessage(`Cannot save the file in the asset folder. ${errorText(error)}`);
    }
  }

  private announce(
    documentUri: vscode.Uri,
    folder: vscode.Uri,
    items: MediaItem[],
    post: (message: HostMessage) => void,
  ): void {
    if (items.length === 0) {
      return;
    }
    const where = vscode.workspace.asRelativePath(folder, false);
    vscode.window.setStatusBarMessage(`Saved ${items.length} file${items.length === 1 ? '' : 's'} in ${where}`, 4000);
    post({ type: 'insertMedia', items });
  }

  private async openLink(href: string, documentUri: vscode.Uri): Promise<void> {
    if (/^(https?|mailto|tel):/i.test(href)) {
      await vscode.env.openExternal(vscode.Uri.parse(href));
      return;
    }

    if (href.startsWith('#')) {
      return;
    }

    // A relative link points to a file next to the document.
    const [pathPart] = href.split(/[?#]/);
    let decoded = pathPart;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      // Keep the raw path when it has no valid escape.
    }
    const target =
      decoded.startsWith('/') || path.isAbsolute(decoded)
        ? vscode.Uri.file(decoded)
        : vscode.Uri.joinPath(documentUri, '..', decoded);

    try {
      await vscode.workspace.fs.stat(target);
      await vscode.commands.executeCommand('vscode.open', target);
    } catch {
      void vscode.window.showWarningMessage(`Cannot open link target: ${href}`);
    }
  }

  private renderHtml(webview: vscode.Webview, distUri: vscode.Uri): string {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js'));
    const style = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.css'));
    const mermaid = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'mermaid.js'));
    const nonce = createNonce();

    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `media-src ${webview.cspSource} https:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${style}" />
  <title>Crazy Rich Markdown Editor</title>
</head>
<body>
  <div id="stats" class="rme-stats" hidden></div>
  <div id="app">
    <details id="frontmatter" class="rme-frontmatter" hidden>
      <summary>Front matter</summary>
      <textarea
        id="frontmatter-input"
        data-vscode-context='{"webviewSection":"editor"}'
        spellcheck="false"
        rows="4"
      ></textarea>
    </details>
    <div id="editor" data-vscode-context='{"webviewSection":"editor"}'></div>
  </div>
  <script nonce="${nonce}" src="${script}" data-mermaid="${mermaid}"></script>
</body>
</html>`;
  }
}

function toBytes(data: unknown): Uint8Array | undefined {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createNonce(): string {
  return randomBytes(16).toString('hex');
}
