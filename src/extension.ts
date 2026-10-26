import * as vscode from 'vscode';
import { isMdxFile, MarkdownEditorProvider, MDX_VIEW_TYPE, VIEW_TYPE } from './markdownEditorProvider';

/** What `activate` returns. Tests use it to look at the open editors. */
export interface ExtensionApi {
  getStats: MarkdownEditorProvider['getStats'];
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const provider = new MarkdownEditorProvider(context);

  context.subscriptions.push(
    provider.register(),

    vscode.commands.registerCommand('richMarkdown.openRich', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target) {
        void vscode.window.showInformationMessage('Open a Markdown file first.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, isMdxFile(target) ? MDX_VIEW_TYPE : VIEW_TYPE);
    }),

    vscode.commands.registerCommand('richMarkdown.openSource', async () => {
      await vscode.commands.executeCommand('workbench.action.reopenTextEditor');
    }),
  );

  return { getStats: (uri) => provider.getStats(uri) };
}

export function deactivate(): void {}
