// Tests that the project uses Yarn, and that nothing in it asks for npm. A wrong lockfile or a leftover `npm` command
// breaks the build on GitHub, or makes a second lockfile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('package.json'));
const lock = read('yarn.lock');
const workflow = read('.github/workflows/publish.yml');

/** The files in a folder of the project, with the names of the files that end in one of the extensions. */
const files = (folder, extensions) =>
  readdirSync(path.join(root, folder))
    .filter((name) => extensions.some((extension) => name.endsWith(extension)))
    .map((name) => path.join(folder, name));

test('the project has a Yarn lockfile and no npm lockfile', () => {
  assert.match(lock, /^# yarn lockfile v1$/m);
  assert.equal(existsSync(path.join(root, 'package-lock.json')), false, 'a second lockfile would drift from yarn.lock');
  assert.equal(existsSync(path.join(root, 'npm-shrinkwrap.json')), false);
  assert.equal(existsSync(path.join(root, 'pnpm-lock.yaml')), false);
});

test('package.json names Yarn 1 as the package manager, and its scripts call yarn', () => {
  assert.match(manifest.packageManager, /^yarn@1\.\d+\.\d+$/);
  assert.equal(manifest.scripts['vscode:prepublish'], 'yarn build --production');
  assert.match(manifest.scripts['test:vscode'], /^yarn build && /);
  assert.match(manifest.scripts.package, /^vsce package --yarn /, 'vsce runs the prepublish script with yarn');
});

test('no script, workflow, setting or document asks for an npm command', () => {
  const places = [
    'package.json',
    'README.md',
    '.github/workflows/publish.yml',
    ...files('.vscode', ['.json']),
    ...files('scripts', ['.mjs']),
    ...files('test', ['.mjs', '.cjs']).filter((file) => file !== path.join('test', 'yarn.test.mjs')),
    ...files(path.join('test', 'vscode'), ['.cjs', '.mjs', '.js']),
    'esbuild.mjs',
  ];
  const found = [];
  for (const place of places) {
    read(place)
      .split('\n')
      .forEach((line, index) => {
        if (/\bnpm (run|ci|install|i|test|exec|publish|audit)\b|\bnpx\b|"type": "npm"/.test(line)) {
          found.push(`${place}:${index + 1}: ${line.trim().slice(0, 100)}`);
        }
      });
  }
  assert.deepEqual(found, []);
});

test('the workflow installs with yarn from the lockfile, and caches the yarn packages', () => {
  const caches = workflow.split('\n').filter((line) => /^\s+cache:/.test(line));
  assert.equal(caches.length, 2, 'both jobs set up node with a cache');
  for (const line of caches) assert.match(line, /cache: yarn$/);
  const installs = workflow.split('\n').filter((line) => /^\s+- run: yarn install/.test(line));
  assert.equal(installs.length, 2, 'both jobs install the packages');
  for (const line of installs)
    assert.match(line, /yarn install --frozen-lockfile$/, 'a lockfile that is out of date fails the build');
  for (const command of ['yarn typecheck', 'yarn test', 'yarn package']) {
    assert.ok(workflow.includes(`- run: ${command}\n`), `the build job runs ${command}`);
  }
  assert.match(workflow, /run: yarn vsce publish --packagePath "\$VSIX"/);
});

test('.npmrc and .yarnrc pin the public registry, so a new package never gets the address of a mirror', () => {
  // Yarn reads ~/.npmrc, and the registry in it wins over .yarnrc. A file in the project folder wins over ~/.npmrc.
  assert.match(read('.npmrc'), /^registry=https:\/\/registry\.yarnpkg\.com\/$/m);
  assert.match(read('.yarnrc'), /^registry "https:\/\/registry\.yarnpkg\.com"$/m);
});

test(
  'a new package gets a public address in yarn.lock, also when ~/.npmrc names a private mirror',
  { skip: spawnSync('yarn', ['--version']).status !== 0 },
  () => {
    // Work in a folder of its own, with the settings of the project and a fake home folder that names a mirror.
    const folder = mkdtempSync(path.join(tmpdir(), 'rme-yarn-'));
    const home = path.join(folder, 'home');
    const project = path.join(folder, 'project');
    try {
      mkdirSync(home);
      mkdirSync(project);
      writeFileSync(path.join(home, '.npmrc'), 'registry=https://mirror.invalid/npm/\n');
      for (const name of ['.npmrc', '.yarnrc']) writeFileSync(path.join(project, name), read(name));
      writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ name: 'probe', version: '1.0.0', private: true }),
      );
      // The public registry answers. The mirror does not exist, so a lockfile with its name would also fail to install.
      const run = spawnSync('yarn', ['add', 'left-pad@1.3.0', '--no-progress'], {
        cwd: project,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          npm_config_userconfig: path.join(home, '.npmrc'),
        },
      });
      assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
      const lockfile = readFileSync(path.join(project, 'yarn.lock'), 'utf8');
      assert.match(lockfile, /resolved "https:\/\/registry\.yarnpkg\.com\/left-pad\//);
      assert.equal(lockfile.includes('mirror.invalid'), false);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  },
);

test('the lockfile has an entry for each range in package.json', () => {
  const keys = new Set();
  for (const header of lock.matchAll(/^("?[^\s#][^\n]*"?):$/gm)) {
    for (const key of header[1].split(',')) keys.add(key.trim().replace(/^"|"$/g, ''));
  }
  const missing = [];
  for (const section of ['dependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(manifest[section])) {
      if (!keys.has(`${name}@${range}`)) missing.push(`${name}@${range}`);
    }
  }
  assert.deepEqual(missing, [], 'run yarn install, and commit yarn.lock');
});

test('the packages that Tiptap asks for as peers are direct dependencies, so Yarn does not warn about them', () => {
  for (const name of ['@tiptap/extension-list', '@tiptap/extensions', '@floating-ui/dom']) {
    assert.ok(manifest.dependencies[name], `${name} is a dependency`);
  }
});

test('the extension package leaves out the lockfile and the Yarn settings', () => {
  const ignore = read('.vscodeignore').split('\n');
  for (const name of ['yarn.lock', '.yarnrc', '.npmrc'])
    assert.ok(ignore.includes(name), `${name} is in .vscodeignore`);
});

test('the installed packages agree with yarn.lock', { skip: spawnSync('yarn', ['--version']).status !== 0 }, () => {
  const run = spawnSync('yarn', ['check', '--integrity'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
});
