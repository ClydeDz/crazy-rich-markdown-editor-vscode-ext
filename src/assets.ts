import * as path from 'path';
import * as vscode from 'vscode';
import type { MediaItem } from './protocol';

export type MediaKind = MediaItem['kind'];

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp'];
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v', 'ogv'];

export const MEDIA_EXTENSIONS = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS];

/** The largest file that the webview may send. Larger files go through the file picker. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
  'video/ogg': 'ogv',
};

function extensionOf(fileName: string): string {
  return path.posix.extname(fileName).slice(1).toLowerCase();
}

/** Tell if a file is an image or a video. Only these file types may be saved as assets. */
export function mediaKind(fileName: string, mime?: string): MediaKind | undefined {
  const extension = extensionOf(fileName) || MIME_EXTENSIONS[(mime ?? '').toLowerCase()] || '';
  if (IMAGE_EXTENSIONS.includes(extension)) {
    return 'image';
  }
  if (VIDEO_EXTENSIONS.includes(extension)) {
    return 'video';
  }
  return undefined;
}

/**
 * Make a safe file name from a name that came from outside.
 * It removes folders, control characters and characters that Windows does not allow.
 */
export function sanitizeFileName(name: string, mime?: string): string {
  const last = name.split(/[\\/]/).pop() ?? '';
  let clean = last
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .trim();

  let extension = extensionOf(clean);
  if (!extension) {
    extension = MIME_EXTENSIONS[(mime ?? '').toLowerCase()] ?? '';
  } else {
    clean = clean.slice(0, -(extension.length + 1));
  }
  let base = clean.slice(0, 80).replace(/[-.\s]+$/, '');
  if (!base) {
    base = 'file';
  }
  return extension ? `${base}.${extension}` : base;
}

/** A file name for a clipboard image. The clipboard gives the same name `image.png` every time. */
export function clipboardFileName(fileName: string, now: Date = new Date()): string {
  const extension = extensionOf(fileName);
  const base = fileName.slice(0, fileName.length - (extension ? extension.length + 1 : 0)).toLowerCase();
  if (base !== 'image' && base !== '') {
    return fileName;
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `image-${stamp}${extension ? `.${extension}` : ''}`;
}

/** Alternative text for an image, made from its file name. */
export function altText(fileName: string): string {
  const extension = extensionOf(fileName);
  const base = fileName.slice(0, fileName.length - (extension ? extension.length + 1 : 0));
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s*\d{8}\s\d{6}$/, '')
    .trim();
}

const VARIABLES = /\$\{(documentDirname|documentBasenameNoExtension|documentFileName|workspaceFolder|documentWorkspaceFolder)\}/g;

/**
 * Find the folder for new assets. The setting is a path that is relative to the folder of the document.
 * It can also be an absolute path. These variables work in it:
 *
 * - `${documentDirname}`: the folder of the document.
 * - `${documentBasenameNoExtension}`: the file name of the document without the extension.
 * - `${documentFileName}`: the file name of the document.
 * - `${workspaceFolder}` and `${documentWorkspaceFolder}`: the workspace folder that holds the document.
 */
export function resolveAssetFolder(setting: string | undefined, document: vscode.Uri): vscode.Uri {
  const documentFolder = vscode.Uri.joinPath(document, '..');
  const fileName = path.posix.basename(document.path);
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document)?.uri ?? documentFolder;
  const workspaceFolderPath =
    process.platform === 'win32'
      ? workspaceFolder.path.replace(
          /^\/([a-zA-Z]):(?=\/)/,
          (_match, drive: string) => `/${drive.toLowerCase()}:`,
        )
      : workspaceFolder.path;

  let value = (setting ?? '').trim().replace(/\\/g, '/');
  if (value === '') {
    value = '.';
  }
  value = value.replace(VARIABLES, (_all, name: string) => {
    switch (name) {
      case 'documentDirname':
        return documentFolder.path;
      case 'documentBasenameNoExtension':
        return path.posix.basename(fileName, path.posix.extname(fileName));
      case 'documentFileName':
        return fileName;
      default:
        return workspaceFolderPath;
    }
  });

  if (/^[a-zA-Z]:\//.test(value)) {
    value = `/${value}`;
  }
  if (value.startsWith('/')) {
    return document.with({ path: path.posix.normalize(value), query: '', fragment: '' });
  }
  return vscode.Uri.joinPath(documentFolder, value);
}

/** The link to an asset, written for the Markdown file. Each part of the path has URL escapes. */
export function relativeLink(document: vscode.Uri, asset: vscode.Uri): string {
  const relative = path.posix.relative(path.posix.dirname(document.path), asset.path);
  return relative
    .split('/')
    .map((part) =>
      part === '..' || part === '.' ? part : encodeURIComponent(part).replace(/\(/g, '%28').replace(/\)/g, '%29'),
    )
    .join('/');
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

async function sizeOf(uri: vscode.Uri): Promise<number | undefined> {
  try {
    return (await vscode.workspace.fs.stat(uri)).size;
  } catch {
    return undefined;
  }
}

/**
 * Put a file in the asset folder. Existing files stay as they are:
 * a file with the same name and the same content is used again, and a file with other content gets a number.
 */
async function placeAsset(folder: vscode.Uri, fileName: string, content: Uint8Array | vscode.Uri): Promise<vscode.Uri> {
  await vscode.workspace.fs.createDirectory(folder);

  const extension = path.posix.extname(fileName);
  const base = fileName.slice(0, fileName.length - extension.length);
  const fs = vscode.workspace.fs;
  const incomingSize = content instanceof Uint8Array ? content.length : await sizeOf(content);

  for (let index = 0; index < 1000; index++) {
    const target = vscode.Uri.joinPath(folder, index === 0 ? fileName : `${base}-${index}${extension}`);
    const existingSize = await sizeOf(target);

    if (existingSize === undefined) {
      if (content instanceof Uint8Array) {
        await fs.writeFile(target, content);
      } else {
        await fs.copy(content, target, { overwrite: false });
      }
      return target;
    }

    if (existingSize === incomingSize) {
      const incoming = content instanceof Uint8Array ? content : await fs.readFile(content);
      if (sameBytes(await fs.readFile(target), incoming)) {
        return target;
      }
    }
  }
  throw new Error(`Cannot find a free file name for ${fileName} in ${folder.toString()}.`);
}

/** Save bytes from the webview, for example a pasted image. */
export function saveAsset(folder: vscode.Uri, fileName: string, bytes: Uint8Array): Promise<vscode.Uri> {
  return placeAsset(folder, fileName, bytes);
}

/** Copy a file from disk into the asset folder. A file that is already there is not copied. */
export async function copyAsset(folder: vscode.Uri, source: vscode.Uri): Promise<vscode.Uri> {
  const inside = source.scheme === folder.scheme && path.posix.dirname(source.path) === folder.path.replace(/\/$/, '');
  if (inside) {
    return source;
  }
  return placeAsset(folder, sanitizeFileName(path.posix.basename(source.path)), source);
}

/** Build the item that the webview inserts for a saved asset. */
export function mediaItem(document: vscode.Uri, asset: vscode.Uri): MediaItem | undefined {
  const fileName = path.posix.basename(asset.path);
  const kind = mediaKind(fileName);
  if (!kind) {
    return undefined;
  }
  return { kind, src: relativeLink(document, asset), alt: kind === 'image' ? altText(fileName) : '' };
}
