import 'katex/dist/katex.min.css';
import './styles.css';
import type { Editor } from '@tiptap/core';
import { createEditor, createImageResolver, getMarkdown, setMarkdown } from './editor';
import { videoHtml } from './media';
import { joinFrontMatter, splitFrontMatter } from './frontMatter';
import { enhanceFrontMatter } from './frontMatterView';
import { findHeadingForAnchor } from './anchors';
import { configureDiagrams } from './diagrams';
import { createMediaInput, isMediaFile } from './mediaInput';
import { createSlashMenu } from './slashMenu';
import { ABOUT } from './about';
import { shortcutGroups } from './shortcuts';
import { createShortcutsModal } from './shortcutsModal';
import { applyTextChange, indentChange, newLineChange } from './textIndent';
import { createStatsBar, documentStats, proseText } from './stats';
import type { FileInfo } from './stats';
import { createFloatingToolbars } from './toolbar';

interface VsCodeApi {
  postMessage(message: unknown): void;
}
declare function acquireVsCodeApi(): VsCodeApi;

type HostMessage =
  | { type: 'init'; text: string; baseUri: string; maxContentWidth: number; showInfoBar: boolean; mdx?: boolean }
  | { type: 'update'; text: string }
  | { type: 'config'; maxContentWidth: number; showInfoBar: boolean }
  | { type: 'insertMedia'; items: { kind: 'image' | 'video'; src: string; alt: string }[] }
  | ({ type: 'fileInfo' } & FileInfo);

// The page gives the address of the mermaid script and the nonce that its security policy asks for.
const bootScript = document.currentScript as HTMLScriptElement | null;
configureDiagrams({ mermaidSrc: bootScript?.dataset.mermaid, nonce: bootScript?.nonce });

const vscode = acquireVsCodeApi();

const SEND_DELAY_MS = 120;
/** The host refuses larger files from the webview. The file picker has no limit. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const editorElement = document.getElementById('editor') as HTMLElement;
const frontMatterDetails = document.getElementById('frontmatter') as HTMLDetailsElement;
const frontMatterInput = document.getElementById('frontmatter-input') as HTMLTextAreaElement;
const frontMatterView = enhanceFrontMatter(frontMatterDetails, frontMatterInput, {
  // The trash button takes the front matter out of the file. The Markdown below it stays.
  onDelete: () => {
    frontMatter = undefined;
    showFrontMatter();
    scheduleEdit();
  },
});
const statsElement = document.getElementById('stats');
const shortcutsModal = createShortcutsModal({
  groups: shortcutGroups(),
  about: ABOUT,
  openLink: (href) => vscode.postMessage({ type: 'openLink', href }),
});
const stats = statsElement
  ? createStatsBar(statsElement, {
      onOpenSettings: () => vscode.postMessage({ type: 'openSettings' }),
      onOpenShortcuts: () => shortcutsModal.open(),
    })
  : undefined;

let editor: Editor | undefined;
let frontMatter: string | undefined;
/** The blank lines between the front matter and the body. */
let frontMatterGap = '\n';
let endsWithNewline = true;
/** The last full text that both sides agree on. */
let syncedText = '';
let sendTimer: number | undefined;

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function applyWidth(width: number): void {
  document.documentElement.style.setProperty('--rme-max-width', `${width}px`);
}

function showFrontMatter(): void {
  const hasFrontMatter = frontMatter !== undefined;
  frontMatterDetails.hidden = !hasFrontMatter;
  if (hasFrontMatter && frontMatterInput.value !== frontMatter) {
    frontMatterInput.value = frontMatter ?? '';
    frontMatterView.refresh();
  }
  autosizeFrontMatter();
}

function autosizeFrontMatter(): void {
  frontMatterInput.style.height = 'auto';
  // A closed panel reports a height of zero. Keep the automatic height then.
  if (frontMatterInput.scrollHeight > 0) {
    frontMatterInput.style.height = `${frontMatterInput.scrollHeight + 2}px`;
  }
}

function serialize(): string {
  const body = editor ? getMarkdown(editor).replace(/\s+$/, '') : '';
  const full = joinFrontMatter(frontMatter, frontMatter !== undefined && body.length > 0 ? frontMatterGap + body : body);
  if (full.length === 0) {
    return '';
  }
  return endsWithNewline ? `${full.replace(/\n+$/, '')}\n` : full.replace(/\n+$/, '');
}

/** Show the lines of the file and the words and characters of the text. */
function refreshStats(): void {
  // With the bar off, the editor does not count.
  if (editor && stats?.isEnabled()) {
    stats.update(documentStats(syncedText, proseText(editor)));
  }
}

function sendEdit(): void {
  window.clearTimeout(sendTimer);
  sendTimer = undefined;
  const text = serialize();
  if (text !== syncedText) {
    syncedText = text;
    vscode.postMessage({ type: 'edit', text });
  }
  refreshStats();
}

function scheduleEdit(): void {
  window.clearTimeout(sendTimer);
  sendTimer = window.setTimeout(sendEdit, SEND_DELAY_MS);
}

/** Take new text from the host and split it into front matter and body. */
function loadText(raw: string): string {
  const text = normalizeNewlines(raw);
  endsWithNewline = text.length === 0 || text.endsWith('\n');
  const split = splitFrontMatter(text);
  frontMatter = split.yaml;
  const leadingNewlines = /^\n*/.exec(split.body)?.[0] ?? '';
  frontMatterGap = leadingNewlines.length === split.body.length ? '\n' : leadingNewlines;
  showFrontMatter();
  syncedText = text;
  return split.body;
}

/** Send pasted and dropped files to the host. It copies them into the asset folder. */
async function sendFiles(files: File[]): Promise<void> {
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      vscode.postMessage({ type: 'assetTooLarge', name: file.name });
      continue;
    }
    const data = new Uint8Array(await file.arrayBuffer());
    vscode.postMessage({ type: 'saveAsset', name: file.name, mime: file.type, data });
  }
}

function start(message: Extract<HostMessage, { type: 'init' }>): void {
  applyWidth(message.maxContentWidth);
  stats?.setEnabled(message.showInfoBar);
  const body = loadText(message.text);
  const toolbars = createFloatingToolbars();

  editor = createEditor({
    element: editorElement,
    markdown: body,
    resolveImageSrc: createImageResolver(message.baseUri),
    mdx: message.mdx === true,
    extensions: [
      ...toolbars.extensions,
      createSlashMenu({
        mdx: message.mdx === true,
        onPickMedia: () => vscode.postMessage({ type: 'pickMedia' }),
        hasFrontMatter: () => frontMatter !== undefined,
        // The block opens, and the cursor goes into it. The file then starts with `---`, an empty block and `---`.
        onAddFrontMatter: () => {
          frontMatter = '';
          showFrontMatter();
          frontMatterDetails.open = true;
          frontMatterInput.focus();
          scheduleEdit();
        },
      }),
      createMediaInput({ onFiles: (files) => void sendFiles(files) }),
    ],
  });
  toolbars.bind(editor);
  refreshStats();
  stats?.show();

  editor.on('update', scheduleEdit);
  // Send waiting changes before the focus moves away.
  editor.on('blur', () => {
    if (sendTimer !== undefined) {
      sendEdit();
    }
  });

  // VS Code starts its own handling of a file drag, and opens the dropped file as a new editor, unless the page
  // has already handled the first drag event. The text area handles it, but the margins of the page do not.
  // These listeners make a file drop work on the whole page, and they take a drop outside the text area too.
  const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  window.addEventListener(
    'dragenter',
    (event) => {
      if (hasFiles(event)) {
        event.preventDefault();
      }
    },
    true,
  );
  window.addEventListener(
    'dragover',
    (event) => {
      if (hasFiles(event)) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'copy';
        }
      }
    },
    true,
  );
  window.addEventListener(
    'drop',
    (event) => {
      // A drop on the text area is handled by the editor. VS Code marks every drop as handled before the
      // page can see it, so this listener runs first (capture) and takes only a drop outside the text area.
      if (!hasFiles(event) || editor?.view.dom.contains(event.target as Node)) {
        return;
      }
      const files = Array.from(event.dataTransfer?.files ?? []).filter(isMediaFile);
      event.preventDefault();
      if (files.length > 0) {
        editor?.chain().focus('end').run();
        void sendFiles(files);
      }
    },
    true,
  );

  // Open links with Ctrl or Cmd plus click.
  editorElement.addEventListener('click', (event) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) {
      return;
    }
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      const href = anchor.getAttribute('href');
      if (href?.startsWith('#')) {
        // A link to a heading in this document.
        findHeadingForAnchor(editorElement, href)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } else if (href) {
        vscode.postMessage({ type: 'openLink', href });
      }
    }
  });
  editorElement.addEventListener('mouseover', (event) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (anchor && !anchor.title) {
      const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';
      anchor.title = `${anchor.getAttribute('href') ?? ''} (${mod}+click to open)`;
    }
  });
}

function update(text: string): void {
  if (!editor) {
    return;
  }
  const normalized = normalizeNewlines(text);
  if (normalized === syncedText) {
    return;
  }
  const { from, to } = editor.state.selection;
  const body = loadText(text);
  setMarkdown(editor, body);
  const size = editor.state.doc.content.size;
  editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
  refreshStats();
}

frontMatterDetails.addEventListener('toggle', autosizeFrontMatter);

// Tab and Enter work like they do in a code editor. A tab key press does not leave the field,
// and YAML needs spaces for the indent.
frontMatterInput.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) {
    return;
  }
  const { value, selectionStart, selectionEnd } = frontMatterInput;
  if (event.key === 'Tab') {
    event.preventDefault();
    applyTextChange(frontMatterInput, indentChange(value, selectionStart, selectionEnd, event.shiftKey));
  } else if (event.key === 'Enter' && !event.shiftKey) {
    const change = newLineChange(value, selectionStart, selectionEnd);
    if (change) {
      event.preventDefault();
      applyTextChange(frontMatterInput, change);
    }
  }
});

frontMatterInput.addEventListener('input', () => {
  frontMatter = frontMatterInput.value;
  autosizeFrontMatter();
  scheduleEdit();
});

// VS Code reads every key press in the webview and may run a shortcut of its own.
// For example Cmd+B would hide the sidebar, and Cmd+Z would run a second undo.
// The editor stops a key that it has already handled, so VS Code never sees it.
document.body.addEventListener('keydown', (event) => {
  if (event.defaultPrevented) {
    event.stopPropagation();
  }
});

// Send the newest text before VS Code saves the file.
window.addEventListener(
  'keydown',
  (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && sendTimer !== undefined) {
      sendEdit();
    }
  },
  true,
);

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'init':
      if (!editor) {
        start(message);
      }
      break;
    case 'update':
      update(message.text);
      break;
    case 'config':
      applyWidth(message.maxContentWidth);
      stats?.setEnabled(message.showInfoBar);
      // A bar that was off has old numbers.
      refreshStats();
      break;
    case 'fileInfo':
      stats?.updateFile(message);
      break;
    case 'insertMedia':
      editor
        ?.chain()
        .focus()
        .insertContent(
          message.items.map((item) =>
            item.kind === 'video'
              ? { type: 'video', attrs: { raw: videoHtml(item.src) } }
              : { type: 'image', attrs: { src: item.src, alt: item.alt } },
          ),
        )
        .run();
      break;
  }
});

vscode.postMessage({ type: 'ready' });
