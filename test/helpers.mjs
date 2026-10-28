import assert from 'node:assert/strict';
import { after } from 'node:test';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { rmSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Every test file runs in its own process, and the files bundle the same modules at the same time (11 of them bundle the editor).
// A folder that all processes share lets one process import a bundle while another one still writes it. The import then
// finds an empty module, and the test fails with "createEditor is not a function". So each process writes in its own folder.
const outDir = path.join(root, 'test', '.build', String(process.pid));
process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));

/** Where `loadModule` writes the bundle with this name, for the process that runs now. */
export function buildPath(name) {
  return path.join(outDir, `${name}.mjs`);
}

let domReady = false;

/** Install a browser-like global scope. Tiptap needs it. */
export function installDom() {
  if (domReady) return;
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'https://localhost/',
  });
  const { window } = dom;
  const names = [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'HTMLElement',
    'DocumentFragment',
    'DOMParser',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'Range',
    'Selection',
    'Event',
    'KeyboardEvent',
    'MouseEvent',
    'CustomEvent',
    'HTMLInputElement',
    'ResizeObserver',
    'XMLSerializer',
    'URL',
  ];
  for (const name of names) {
    if (name === 'window') {
      globalThis.window = window;
      continue;
    }
    const value = window[name];
    if (value === undefined) continue;
    try {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    } catch {
      // Node already has a read-only global with this name.
    }
  }
  if (!window.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // jsdom has no layout, so give ProseMirror the geometry calls it asks for.
  window.Range.prototype.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
  });
  window.Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} });
  window.document.elementFromPoint = () => null;
  // jsdom does not scroll. A test can read the elements that the code asked to scroll into view.
  globalThis.__scrolledIntoView = [];
  window.Element.prototype.scrollIntoView = function scrollIntoView(options) {
    globalThis.__scrolledIntoView.push({ element: this, options });
  };

  // jsdom does not throw an error that a listener throws. It sends the error to the window, and the test goes on
  // with a half finished page. Keep these errors, and fail the test file at its end.
  const hiddenErrors = [];
  window.addEventListener('error', (event) => {
    hiddenErrors.push(event.error ?? new Error(event.message));
    event.preventDefault();
  });
  after(() => {
    assert.deepEqual(
      hiddenErrors.map((error) =>
        String((error && error.stack) || error)
          .split('\n')
          .slice(0, 3)
          .join(' | '),
      ),
      [],
      'an event listener threw an error that jsdom did not report',
    );
  });
  domReady = true;
}

/**
 * Bundle a TypeScript module from the repo and import it.
 * With `{ vscode: true }` the module gets test/vscode-stub.mjs in place of the `vscode` module.
 */
export async function loadModule(entry, name, options = {}) {
  installDom();
  const outfile = buildPath(name);
  await build({
    entryPoints: [path.join(root, entry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    loader: { '.css': 'empty' },
    alias: options.vscode ? { vscode: path.join(root, 'test', 'vscode-stub.mjs') } : undefined,
  });
  return import(pathToFileURL(outfile).href + `?t=${Date.now()}`);
}

export function makeEditor(createEditor, markdown, extra = {}) {
  const element = document.createElement('div');
  document.body.append(element);
  return createEditor({ element, markdown, ...extra });
}

let nextListenerId = 0;
const listenerIds = new WeakMap();
const idOfListener = (listener) => {
  if (!listenerIds.has(listener)) listenerIds.set(listener, ++nextListenerId);
  return listenerIds.get(listener);
};
const isCapture = (options) =>
  options === true || (typeof options === 'object' && options !== null && options.capture === true);

/**
 * Run `body`, and return the listeners that it added to `target` (the document or the window) and did not remove.
 * An entry looks like `mousedown|capture|7`. A listener that stays on the page after its menu closed is a leak.
 * A listener is removed only with the same type and the same capture flag as when it was added.
 */
export function leakedListeners(target, body) {
  const live = new Set();
  const add = target.addEventListener;
  const remove = target.removeEventListener;
  const key = (type, listener, options) =>
    `${type}|${isCapture(options) ? 'capture' : 'bubble'}|${idOfListener(listener)}`;
  target.addEventListener = function (type, listener, options) {
    live.add(key(type, listener, options));
    return add.call(this, type, listener, options);
  };
  target.removeEventListener = function (type, listener, options) {
    live.delete(key(type, listener, options));
    return remove.call(this, type, listener, options);
  };
  try {
    body();
  } finally {
    target.addEventListener = add;
    target.removeEventListener = remove;
    delete target.addEventListener;
    delete target.removeEventListener;
  }
  return [...live];
}
