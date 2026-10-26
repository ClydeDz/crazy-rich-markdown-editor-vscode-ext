// Starts a separate VS Code, opens a Markdown file in the rich editor, clicks the editor type dropdown,
// and prints the items of the menu that VS Code opens. That menu is a native macOS menu, so a screenshot of
// the page does not show it. The script reads the items in the main process of VS Code instead.
// It also prints how the Extensions list shows this extension.
//
// Usage: node scripts/capture-editor-menu.mjs [path/to/extension.vsix] [--screenshots folder]
//   --screenshots  also saves pictures of the VS Code window: the rich editor and the Extensions list.
//   --page-menu    asks VS Code to draw its menus in the page (setting window.menuStyle = custom), so that a
//                  picture shows the open dropdown menu too (menu.png). Without it the menu is a native menu.
//   --zoom-live n  after the editor opened, sets window.zoomLevel to n while the window is open, and saves editor-zoomed.png.
//   --setting      name=value puts a VS Code setting in the separate VS Code (the value is JSON). Use it several times.
//   --light        uses the light theme (Default Light Modern), so that a picture shows the bar on a light page.
//   --git          makes the file part of a small Git repository with four authors, so that the bar at the top
//                  shows them. The repository is in the temporary folder of the script, never in this project.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = process.env.VSCODE_APP ?? '/Applications/Visual Studio Code.app';
const cli = `${app}/Contents/Resources/app/bin/code`;
const binary = `${app}/Contents/MacOS/Code`;
const pageMenu = process.argv.includes('--page-menu');
const lightTheme = process.argv.includes('--light');
const zoomLive = process.argv.includes('--zoom-live') ? process.argv[process.argv.indexOf('--zoom-live') + 1] : undefined;
const shotsIndex = process.argv.indexOf('--screenshots');
const shotsDir = shotsIndex >= 0 ? process.argv[shotsIndex + 1] : undefined;
const vsix =
  process.argv.find((arg, index) => index > 1 && arg.endsWith('.vsix')) ??
  path.join(root, readdirSync(root).filter((file) => file.endsWith('.vsix')).sort().at(-1) ?? 'missing.vsix');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const work = mkdtempSync(path.join(tmpdir(), 'rmecdp'));
mkdirSync(path.join(work, 'ws'));
// --setting name=value (several times) puts a VS Code setting in the settings of the separate VS Code. The value is JSON.
const extraSettings = Object.fromEntries(
  process.argv.flatMap((arg, index) => {
    if (process.argv[index - 1] !== '--setting') return [];
    const split = arg.indexOf('=');
    let value = arg.slice(split + 1);
    try {
      value = JSON.parse(value);
    } catch {
      // A value that is not JSON stays a string.
    }
    return [[arg.slice(0, split), value]];
  }),
);
const settings = {
  ...(pageMenu ? { 'window.menuStyle': 'custom', 'window.titleBarStyle': 'custom' } : {}),
  ...(lightTheme ? { 'workbench.colorTheme': 'Default Light Modern' } : {}),
  ...extraSettings,
};
if (Object.keys(settings).length > 0) {
  mkdirSync(path.join(work, 'u/User'), { recursive: true });
  writeFileSync(path.join(work, 'u/User/settings.json'), JSON.stringify(settings));
}
copyFileSync(path.join(root, 'test/harness/sample.md'), path.join(work, 'ws/sample.md'));
if (process.argv.includes('--git')) {
  const { makeRepo } = createRequire(import.meta.url)('../test/git-helper.cjs');
  const sample = readFileSync(path.join(root, 'test/harness/sample.md'), 'utf8');
  const step = (author, date, message, content = sample) => ({ file: 'sample.md', content, author, date, message });
  // The last commit puts the original text back, so that the editor shows the sample.
  makeRepo(path.join(work, 'ws'), [
    step('Lee Chen <lee@example.org>', '2026-08-25T09:00:00Z', 'Typo', `${sample}\nA line.\n`),
    step('Ana Souza <ana@example.org>', '2026-09-24T09:00:00Z', 'First draft'),
    step('Tom Becker <tom@example.org>', '2026-10-16T09:00:00Z', 'Fix the table toolbar', `${sample}\nAnother line.\n`),
    step('Priya Raman <priya@example.org>', '2026-10-23T09:00:00Z', 'Explain the asset folder setting'),
  ]);
}

/** A small client for a DevTools or Node inspector WebSocket. */
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 1;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
    }
  };
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, sessionId }));
      }),
    close: () => socket.close(),
  };
}

async function waitForJson(url, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    try {
      return await (await fetch(url)).json();
    } catch {
      if (Date.now() - start > timeoutMs) throw new Error(`Timed out: ${url}`);
      await sleep(500);
    }
  }
}

let child;
try {
  execFileSync(cli, [`--user-data-dir=${work}/u`, `--extensions-dir=${work}/e`, '--install-extension', vsix], { stdio: 'pipe' });
  child = spawn(
    binary,
    [
      `--user-data-dir=${work}/u`, `--extensions-dir=${work}/e`, '--disable-workspace-trust', '--skip-welcome',
      '--skip-release-notes', '--remote-debugging-port=9333', '--inspect=9229',
      path.join(work, 'ws'), path.join(work, 'ws/sample.md'),
    ],
    { stdio: 'ignore' },
  );

  // Hook the native menu in the main process. The hook records the items and does not show the menu.
  const inspectorList = await waitForJson('http://127.0.0.1:9229/json/list');
  const main = await connect(inspectorList[0].webSocketDebuggerUrl);
  if (!pageMenu) await main.send('Runtime.evaluate', {
    expression: `(() => {
      const { Menu } = process.mainModule.require('electron');
      globalThis.__menus = [];
      Menu.prototype.popup = function (options) {
        globalThis.__menus.push(this.items.map((item) => ({ label: item.label, type: item.type, checked: item.checked })));
        if (options && typeof options.callback === 'function') options.callback();
      };
    })()`,
  });

  const version = await waitForJson('http://127.0.0.1:9333/json/version');
  const browser = await connect(version.webSocketDebuggerUrl);
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    const { targetInfos } = await browser.send('Target.getTargets');
    page = targetInfos.find((target) => target.type === 'page' && target.url.includes('workbench'));
    if (!page) await sleep(500);
  }
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const evaluate = async (expression) => {
    const result = await browser.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 400));
    return result.result.value;
  };
  const click = async (x, y) => {
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId);
    await sleep(150);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, sessionId);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, sessionId);
  };

  // The file opens as text the first time. Press the title bar button that opens the rich editor.
  for (let i = 0; i < 40; i++) {
    const opened = await evaluate(`(() => {
      if (document.querySelector('.breadcrumbs-editor-type')) return 'rich';
      const action = [...document.querySelectorAll('.editor-actions a, .editor-actions .action-label')]
        .find((e) => /Open in (Crazy )?Rich/.test(e.getAttribute('aria-label') || ''));
      if (action) { action.click(); return 'clicked'; }
      return 'waiting';
    })()`);
    if (opened === 'rich') break;
    await sleep(700);
  }
  await sleep(1500);

  const shoot = async (name) => {
    if (!shotsDir) return;
    mkdirSync(shotsDir, { recursive: true });
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(path.join(shotsDir, name), Buffer.from(data, 'base64'));
  };
  await shoot('editor.png');
  if (zoomLive !== undefined) {
    // Change the zoom of the window while it is open, as a user does with Cmd and +. VS Code applies the setting at once.
    mkdirSync(path.join(work, 'u/User'), { recursive: true });
    writeFileSync(path.join(work, 'u/User/settings.json'), JSON.stringify({ ...settings, 'window.zoomLevel': Number(zoomLive) }));
    await sleep(3000);
    await shoot('editor-zoomed.png');
  }

  const button = await evaluate(`(() => { const el = document.querySelector('.breadcrumbs-editor-type'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: el.textContent.trim() }; })()`);
  await click(button.x, button.y);
  await sleep(1200);
  let menus;
  if (pageMenu) {
    await shoot('menu.png');
    const labels = await evaluate(`[...document.querySelectorAll('.context-view .monaco-menu .action-item, .context-view .monaco-menu .action-label')].map((e) => ({ label: (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ').trim(), checked: e.getAttribute('aria-checked') === 'true' })).filter((i) => i.label)`);
    const seen = new Set();
    menus = [labels.filter((item) => (seen.has(item.label) ? false : seen.add(item.label)))];
  } else {
    menus = JSON.parse((await main.send('Runtime.evaluate', { expression: 'JSON.stringify(globalThis.__menus)', returnByValue: true })).result.value);
  }

  // How the Extensions list shows the extension.
  await click(25, 233);
  await sleep(2500);
  await shoot('extensions.png');
  const rows = await evaluate(`[...document.querySelectorAll('.extensions-list .monaco-list-row')].map((row) => row.innerText.replace(/\\n+/g, ' | ')).filter((text) => /rich|markdown/i.test(text))`);

  console.log('Editor type button:', JSON.stringify(button.text));
  console.log('Editor type menu:');
  for (const item of menus[0] ?? []) {
    console.log(item.type === 'separator' ? '  ----' : `  ${item.checked ? '[x]' : '[ ]'} ${item.label}`);
  }
  console.log('Extensions list row:', JSON.stringify(rows));
  main.close();
  browser.close();
} finally {
  child?.kill();
  await sleep(4000);
  rmSync(work, { recursive: true, force: true });
}
