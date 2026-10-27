// A small stand-in for the `vscode` module, for unit tests that run in Node. `loadModule(..., { vscode: true })` uses it.
// It holds only what src/assets.ts uses: `Uri`, `workspace.getWorkspaceFolder` and `workspace.fs`.
// The integration tests in test/vscode/suite.cjs run the same code against the real `vscode` module.
import { constants, promises as fs } from 'node:fs';
import path from 'node:path';

export class Uri {
  constructor(scheme, authority, uriPath, query, fragment) {
    this.scheme = scheme;
    this.authority = authority;
    this.path = uriPath;
    this.query = query;
    this.fragment = fragment;
  }

  static file(fsPath) {
    const normalized = fsPath.replace(/\\/g, '/');
    return new Uri('file', '', normalized.startsWith('/') ? normalized : `/${normalized}`, '', '');
  }

  static joinPath(base, ...parts) {
    return base.with({ path: path.posix.join(base.path, ...parts) });
  }

  with(change) {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  get fsPath() {
    if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(this.path)) {
      return this.path.slice(1).replace(/\//g, '\\');
    }
    return this.path;
  }

  toString() {
    return `${this.scheme}://${this.authority}${encodeURI(this.path)}`;
  }
}

/** A test sets `globalThis.__rmeWorkspaceFolders = [{ uri }]` to say which workspace folders are open. */
export const workspace = {
  getWorkspaceFolder(uri) {
    const folders = globalThis.__rmeWorkspaceFolders ?? [];
    return folders.find((folder) => {
      const base = folder.uri.path.replace(/\/$/, '');
      return uri.path === base || uri.path.startsWith(`${base}/`);
    });
  },
  fs: {
    async stat(uri) {
      const stats = await fs.stat(uri.fsPath);
      return { size: stats.size, mtime: stats.mtimeMs, ctime: stats.ctimeMs, type: stats.isDirectory() ? 2 : 1 };
    },
    async createDirectory(uri) {
      await fs.mkdir(uri.fsPath, { recursive: true });
    },
    async writeFile(uri, bytes) {
      await fs.writeFile(uri.fsPath, bytes);
    },
    async readFile(uri) {
      return new Uint8Array(await fs.readFile(uri.fsPath));
    },
    async copy(source, target, options = {}) {
      await fs.copyFile(source.fsPath, target.fsPath, options.overwrite ? 0 : constants.COPYFILE_EXCL);
    },
  },
};
