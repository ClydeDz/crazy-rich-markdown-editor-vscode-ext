// Tests of src/assets.ts in plain Node. The `vscode` module is a stand-in (test/vscode-stub.mjs).
// test/vscode/suite.cjs runs the same code in a real VS Code, with the real `vscode` module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadModule } from './helpers.mjs';
import { Uri } from './vscode-stub.mjs';

const assets = await loadModule('src/assets.ts', 'assets', { vscode: true });

/** Each case works in a folder of its own in the temporary directory. */
async function inTempFolder(body) {
  const folder = mkdtempSync(path.join(tmpdir(), 'rme-assets-'));
  globalThis.__rmeWorkspaceFolders = [{ uri: Uri.file(folder) }];
  try {
    await body(folder);
  } finally {
    globalThis.__rmeWorkspaceFolders = [];
    rmSync(folder, { recursive: true, force: true });
  }
}

const bytes = (...values) => new Uint8Array(values);

// ---------- Names ----------

test('sanitizeFileName removes folders, unsafe characters and leading dots', () => {
  assert.equal(assets.sanitizeFileName('../../evil.png'), 'evil.png');
  assert.equal(assets.sanitizeFileName('C:\\Users\\me\\My Photo.PNG'), 'My-Photo.png');
  assert.equal(assets.sanitizeFileName('a<b>:c|d?.jpg'), 'abcd.jpg');
  assert.equal(assets.sanitizeFileName('.hidden.png'), 'hidden.png');
  assert.equal(assets.sanitizeFileName('a\u0000b\u001fc\u007f.png'), 'abc.png', 'control characters');
  assert.equal(assets.sanitizeFileName('two   spaces.png'), 'two-spaces.png');
});

test('sanitizeFileName takes the extension from the file type when the name has none', () => {
  assert.equal(assets.sanitizeFileName('', 'image/png'), 'file.png');
  assert.equal(assets.sanitizeFileName('noextension', 'video/mp4'), 'noextension.mp4');
  assert.equal(assets.sanitizeFileName('noextension', 'IMAGE/JPEG'), 'noextension.jpg', 'the file type is not case sensitive');
  assert.equal(assets.sanitizeFileName('noextension'), 'noextension');
  assert.equal(assets.sanitizeFileName('pic.png', 'video/mp4'), 'pic.png', 'the extension of the name wins');
});

test('sanitizeFileName cuts a long name at 80 characters and does not leave a dash at the end', () => {
  assert.equal(assets.sanitizeFileName(`${'x'.repeat(200)}.png`), `${'x'.repeat(80)}.png`);
  assert.equal(assets.sanitizeFileName(`${'x'.repeat(79)} y.png`), `${'x'.repeat(79)}.png`, 'the dash that the cut leaves is removed');
  assert.equal(assets.sanitizeFileName('name---.png'), 'name.png');
  assert.equal(assets.sanitizeFileName('---.png'), 'file.png', 'nothing is left of the name');
});

test('mediaKind accepts only images and videos, and looks at the extension first', () => {
  for (const name of ['a.png', 'a.JPG', 'a.jpeg', 'a.gif', 'a.svg', 'a.webp', 'a.avif', 'a.bmp']) {
    assert.equal(assets.mediaKind(name), 'image', name);
  }
  for (const name of ['a.mp4', 'a.MOV', 'a.webm', 'a.m4v', 'a.ogv']) {
    assert.equal(assets.mediaKind(name), 'video', name);
  }
  assert.equal(assets.mediaKind('blob', 'image/webp'), 'image', 'no extension: the file type decides');
  assert.equal(assets.mediaKind('blob', 'video/quicktime'), 'video');
  assert.equal(assets.mediaKind('script.js'), undefined);
  assert.equal(assets.mediaKind('run.sh', 'image/png'), undefined, 'a wrong extension is not saved');
  assert.equal(assets.mediaKind('a.html', 'text/html'), undefined);
  assert.equal(assets.mediaKind('blob'), undefined);
  assert.equal(assets.mediaKind('blob', 'application/pdf'), undefined);
});

test('MEDIA_EXTENSIONS lists every image and video extension, and the size limit is 50 MB', () => {
  assert.deepEqual(assets.MEDIA_EXTENSIONS, ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp', 'mp4', 'mov', 'webm', 'm4v', 'ogv']);
  assert.equal(assets.MAX_UPLOAD_BYTES, 50 * 1024 * 1024);
});

test('clipboardFileName gives the clipboard name `image` a time stamp, and keeps other names', () => {
  const now = new Date(2026, 9, 24, 18, 5, 9);
  assert.equal(assets.clipboardFileName('image.png', now), 'image-20261024-180509.png');
  assert.equal(assets.clipboardFileName('IMAGE.PNG', now), 'image-20261024-180509.png', 'the name is not case sensitive, and the extension is lower case');
  assert.equal(assets.clipboardFileName('image', now), 'image-20261024-180509', 'no extension');
  assert.equal(assets.clipboardFileName('holiday.png', now), 'holiday.png');
  assert.equal(assets.clipboardFileName('image2.png', now), 'image2.png');
  assert.equal(assets.clipboardFileName('image.png', new Date(2026, 0, 2, 3, 4, 5)), 'image-20260102-030405.png', 'numbers have two digits');
});

test('altText makes a readable text from a file name', () => {
  assert.equal(assets.altText('image-20261024-180509.png'), 'image', 'a time stamp is removed');
  assert.equal(assets.altText('team-photo_2.png'), 'team photo 2');
  assert.equal(assets.altText('Team--Photo__x.jpeg'), 'Team Photo x', 'runs of dashes and underscores are one space');
  assert.equal(assets.altText('noextension'), 'noextension');
  assert.equal(assets.altText('demo.mp4'), 'demo');
});

// ---------- Links ----------

test('relativeLink writes a path from the document, with URL escapes in each part', () => {
  const doc = Uri.file('/w/docs/guide.md');
  assert.equal(assets.relativeLink(doc, Uri.file('/w/docs/assets/a.png')), 'assets/a.png');
  assert.equal(assets.relativeLink(doc, Uri.file('/w/docs/assets/my pic (1).png')), 'assets/my%20pic%20%281%29.png');
  assert.equal(assets.relativeLink(doc, Uri.file('/w/img/a.png')), '../img/a.png');
  assert.equal(assets.relativeLink(doc, Uri.file('/w/docs/a.png')), 'a.png');
  assert.equal(assets.relativeLink(doc, Uri.file('/w/docs/a#b?c.png')), 'a%23b%3Fc.png');
  assert.equal(assets.relativeLink(doc, Uri.file('/w/docs/é 田.png')), '%C3%A9%20%E7%94%B0.png');
  assert.equal(assets.relativeLink(doc, Uri.file('/other/place/a.png')), '../../other/place/a.png');
});

test('mediaItem builds the item that the editor inserts', () => {
  const doc = Uri.file('/w/docs/guide.md');
  assert.deepEqual(assets.mediaItem(doc, Uri.file('/w/docs/assets/team-photo.png')), {
    kind: 'image',
    src: 'assets/team-photo.png',
    alt: 'team photo',
  });
  assert.deepEqual(assets.mediaItem(doc, Uri.file('/w/docs/assets/demo-clip.mp4')), { kind: 'video', src: 'assets/demo-clip.mp4', alt: '' });
  assert.equal(assets.mediaItem(doc, Uri.file('/w/docs/assets/notes.txt')), undefined);
});

// ---------- The asset folder ----------

test('resolveAssetFolder reads the setting, and the folder is relative to the document', () => {
  const doc = Uri.file('/w/notes/guide.md');
  const at = (setting, uri = doc) => assets.resolveAssetFolder(setting, uri).path;
  assert.equal(at('assets'), '/w/notes/assets');
  assert.equal(at('.'), '/w/notes');
  assert.equal(at(''), '/w/notes', 'an empty setting means the folder of the document');
  assert.equal(at('   '), '/w/notes', 'spaces only');
  assert.equal(at(undefined), '/w/notes');
  assert.equal(at('../shared/img'), '/w/shared/img');
  assert.equal(at('  assets  '), '/w/notes/assets', 'spaces around the setting do not count');
  assert.equal(at('..\\shared\\img'), '/w/shared/img', 'a backslash is a slash');
  assert.equal(at('a/b/c'), '/w/notes/a/b/c');
});

test('resolveAssetFolder fills in the variables', () => {
  return inTempFolder((folder) => {
    const doc = Uri.file(`${folder}/notes/guide.md`);
    const rel = (setting) => path.posix.relative(folder, assets.resolveAssetFolder(setting, doc).path);
    assert.equal(rel('${documentDirname}/pics'), 'notes/pics');
    assert.equal(rel('${documentBasenameNoExtension}.assets'), 'notes/guide.assets');
    assert.equal(rel('media/${documentBasenameNoExtension}'), 'notes/media/guide');
    assert.equal(rel('${documentFileName}.files'), 'notes/guide.md.files');
    assert.equal(rel('${workspaceFolder}/docs/images'), 'docs/images');
    assert.equal(rel('${documentWorkspaceFolder}/docs/images'), 'docs/images');
    assert.equal(rel('${documentBasenameNoExtension}/${documentBasenameNoExtension}'), 'notes/guide/guide', 'a variable can occur twice');
    assert.equal(rel('${unknownVariable}'), 'notes/${unknownVariable}', 'an unknown variable stays as it is');
  });
});

test('resolveAssetFolder uses the folder of the document when the document is outside every workspace folder', () => {
  const doc = Uri.file('/not/in/a/workspace/guide.md');
  globalThis.__rmeWorkspaceFolders = [];
  assert.equal(assets.resolveAssetFolder('${workspaceFolder}/img', doc).path, '/not/in/a/workspace/img');
});

test('resolveAssetFolder keeps an absolute path, and reads a Windows drive path', () => {
  const doc = Uri.file('/w/notes/guide.md').with({ query: 'q=1', fragment: 'f' });
  const absolute = assets.resolveAssetFolder('/tmp/a/../b', doc);
  assert.equal(absolute.path, '/tmp/b', 'the path is cleaned');
  assert.equal(absolute.scheme, 'file');
  assert.equal(absolute.query, '');
  assert.equal(absolute.fragment, '');
  assert.equal(assets.resolveAssetFolder('C:/images', doc).path, '/C:/images');
  assert.equal(assets.resolveAssetFolder('D:\\media\\pics', doc).path, '/D:/media/pics');
});

// ---------- Saving files ----------

test('saveAsset makes the folder, writes the file, and returns its address', () =>
  inTempFolder(async (folder) => {
    const target = await assets.saveAsset(Uri.file(`${folder}/a/b/assets`), 'pic.png', bytes(1, 2, 3));
    assert.equal(target.path, `${folder}/a/b/assets/pic.png`);
    assert.deepEqual([...readFileSync(target.path)], [1, 2, 3]);
  }),
);

test('saveAsset uses a file again when the name and the content are the same, and numbers other content', () =>
  inTempFolder(async (folder) => {
    const assetFolder = Uri.file(`${folder}/assets`);
    const save = async (...content) => path.basename((await assets.saveAsset(assetFolder, 'a.png', bytes(...content))).path);
    assert.equal(await save(1, 1), 'a.png');
    assert.equal(await save(1, 1), 'a.png', 'the same content');
    assert.equal(await save(2, 2, 2), 'a-1.png', 'other content of another size');
    assert.equal(await save(3), 'a-2.png');
    assert.equal(await save(2, 2, 2), 'a-1.png', 'a numbered file is also used again');
    assert.equal(await save(9, 9), 'a-3.png', 'the same size as a.png, other content');
    assert.deepEqual(readdirSync(`${folder}/assets`).sort(), ['a-1.png', 'a-2.png', 'a-3.png', 'a.png']);
    assert.deepEqual([...readFileSync(`${folder}/assets/a.png`)], [1, 1], 'the first file does not change');
  }),
);

test('saveAsset numbers a file that has no extension before the end of the name', () =>
  inTempFolder(async (folder) => {
    const assetFolder = Uri.file(`${folder}/assets`);
    await assets.saveAsset(assetFolder, 'blob', bytes(1));
    const second = await assets.saveAsset(assetFolder, 'blob', bytes(2));
    assert.equal(path.basename(second.path), 'blob-1');
  }),
);

test('copyAsset copies a file from another folder into the asset folder, with a safe name', () =>
  inTempFolder(async (folder) => {
    mkdirSync(`${folder}/photos`);
    writeFileSync(`${folder}/photos/My Pic (1).PNG`, bytes(4, 5, 6));
    const copied = await assets.copyAsset(Uri.file(`${folder}/assets`), Uri.file(`${folder}/photos/My Pic (1).PNG`));
    assert.equal(copied.path, `${folder}/assets/My-Pic-(1).png`);
    assert.deepEqual([...readFileSync(copied.path)], [4, 5, 6]);
    assert.equal(existsSync(`${folder}/photos/My Pic (1).PNG`), true, 'the original stays');
  }),
);

test('copyAsset does not copy a file that is already in the asset folder', () =>
  inTempFolder(async (folder) => {
    mkdirSync(`${folder}/assets`);
    writeFileSync(`${folder}/assets/here.png`, bytes(1));
    const source = Uri.file(`${folder}/assets/here.png`);
    assert.equal((await assets.copyAsset(Uri.file(`${folder}/assets`), source)).path, source.path);
    assert.equal((await assets.copyAsset(Uri.file(`${folder}/assets/`), source)).path, source.path, 'a folder with a slash at the end');
    assert.deepEqual(readdirSync(`${folder}/assets`), ['here.png']);
  }),
);

test('copyAsset uses a copy again when the same file is picked twice, and numbers a file with other content', () =>
  inTempFolder(async (folder) => {
    mkdirSync(`${folder}/one`);
    mkdirSync(`${folder}/two`);
    writeFileSync(`${folder}/one/pic.png`, bytes(1, 2));
    writeFileSync(`${folder}/two/pic.png`, bytes(3, 4));
    const assetFolder = Uri.file(`${folder}/assets`);
    const first = await assets.copyAsset(assetFolder, Uri.file(`${folder}/one/pic.png`));
    const again = await assets.copyAsset(assetFolder, Uri.file(`${folder}/one/pic.png`));
    const other = await assets.copyAsset(assetFolder, Uri.file(`${folder}/two/pic.png`));
    assert.equal(path.basename(first.path), 'pic.png');
    assert.equal(path.basename(again.path), 'pic.png');
    assert.equal(path.basename(other.path), 'pic-1.png', 'same name and same size, other content');
    assert.deepEqual([...readFileSync(other.path)], [3, 4]);
  }),
);

test('saveAsset gives up with a clear error when 1000 files with that name and other content are already there', () =>
  inTempFolder(async (folder) => {
    mkdirSync(`${folder}/assets`);
    writeFileSync(`${folder}/assets/a.png`, bytes(0));
    for (let index = 1; index < 1000; index++) {
      writeFileSync(`${folder}/assets/a-${index}.png`, bytes(0));
    }
    // Every name is taken by a file of one byte. This file has two bytes, so it cannot use any of them.
    await assert.rejects(() => assets.saveAsset(Uri.file(`${folder}/assets`), 'a.png', bytes(1, 2)), /Cannot find a free file name for a\.png/);
    assert.equal(existsSync(`${folder}/assets/a-1000.png`), false, 'the 1001st name is not used');

    // With one name free, the file is saved there.
    rmSync(`${folder}/assets/a-999.png`);
    const saved = await assets.saveAsset(Uri.file(`${folder}/assets`), 'a.png', bytes(1, 2));
    assert.equal(path.basename(saved.path), 'a-999.png');
  }),
);
