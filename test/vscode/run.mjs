// Runs the integration tests inside a real VS Code. It uses the VS Code that is already installed.
// Set VSCODE_EXECUTABLE to use another build. Set RME_ONLY=text to run only the tests with that text in their name (several texts: a|b).
import { build } from 'esbuild';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Which VS Code to use, in this order:
//   1. VSCODE_EXECUTABLE.
//   2. The VS Code of macOS in /Applications.
//   3. On a CI machine (CI is set, as GitHub Actions does) or with RME_DOWNLOAD_VSCODE=1: a download into `.vscode-test`.
//      VSCODE_VERSION picks the version. The default is `stable`.
const MAC_VSCODE = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
let vscodeExecutablePath = process.env.VSCODE_EXECUTABLE ?? (existsSync(MAC_VSCODE) ? MAC_VSCODE : undefined);
if (!vscodeExecutablePath && (process.env.CI || process.env.RME_DOWNLOAD_VSCODE)) {
  vscodeExecutablePath = await downloadAndUnzipVSCode(process.env.VSCODE_VERSION ?? 'stable');
}
if (!vscodeExecutablePath || !existsSync(vscodeExecutablePath)) {
  console.error(
    `VS Code not found at ${vscodeExecutablePath ?? MAC_VSCODE}. Set VSCODE_EXECUTABLE, or RME_DOWNLOAD_VSCODE=1 to download it.`,
  );
  process.exit(2);
}
// A Linux CI machine runs as a normal user inside a container. The sandbox of Electron cannot start there.
const ciLinuxArgs =
  process.env.CI && process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : [];

// The extension must be built. The suite also needs the provider as a CommonJS module.
await build({
  entryPoints: [path.join(root, 'src/markdownEditorProvider.ts')],
  outfile: path.join(root, 'test/.build/provider.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  logLevel: 'silent',
});

await build({
  entryPoints: [path.join(root, 'src/assets.ts')],
  outfile: path.join(root, 'test/.build/assets.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  logLevel: 'silent',
});

await build({
  entryPoints: [path.join(root, 'webview/shortcuts.ts')],
  outfile: path.join(root, 'test/.build/shortcuts.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  logLevel: 'silent',
});

const scratch = await mkdtemp(path.join(tmpdir(), 'rme-vscode-'));
const workspace = path.join(scratch, 'workspace');
await mkdir(workspace, { recursive: true });
await writeFile(path.join(workspace, 'doc.md'), '# Title\n\nSome **text** here.\n');

let failed = false;
try {
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, 'test/vscode/suite.cjs'),
    extensionTestsEnv: {
      RME_WORKSPACE: workspace,
      ...(process.env.RME_GITHUB_EXAMPLES ? { RME_GITHUB_EXAMPLES: process.env.RME_GITHUB_EXAMPLES } : {}),
      ...(process.env.RME_ONLY ? { RME_ONLY: process.env.RME_ONLY } : {}),
    },
    launchArgs: [
      workspace,
      `--user-data-dir=${path.join(scratch, 'user-data')}`,
      `--extensions-dir=${path.join(scratch, 'extensions')}`,
      '--disable-extensions',
      '--disable-workspace-trust',
      '--skip-welcome',
      '--skip-release-notes',
      ...ciLinuxArgs,
    ],
  });
} catch (error) {
  console.error('VS Code tests failed.', error?.message ?? error);
  failed = true;
} finally {
  // The folder holds the settings, the test workspace and the repositories that some tests make (about 15 MB).
  await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
}
if (failed) {
  process.exit(1);
}
