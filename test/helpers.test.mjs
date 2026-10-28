// Tests of the test helpers. Many test files bundle the same module at the same time, in separate processes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPath } from './helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);

/** The test runner marks its own processes. A child process that sees the mark prints the report of the runner, not its own text. */
const childEnv = () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

test('each test process writes its bundles in its own folder', () => {
  const mine = buildPath('editor');
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import { buildPath } from './test/helpers.mjs'; console.log('result:' + buildPath('editor'));",
    ],
    { cwd: root, encoding: 'utf8', env: childEnv() },
  );
  assert.equal(child.status, 0, child.stderr);
  const theirs = /^result:(.+)$/m.exec(child.stdout)?.[1];
  assert.ok(theirs, `the child printed its path: ${child.stdout}`);
  assert.notEqual(mine, theirs, 'two processes do not share a bundle file');
  for (const file of [mine, theirs]) {
    assert.ok(file.startsWith(path.join(root, 'test', '.build') + path.sep), `${file} is in the build folder`);
    assert.equal(path.basename(file), 'editor.mjs');
  }
  assert.ok(mine.includes(`${path.sep}${process.pid}${path.sep}`), 'the folder has the number of the process');
});

test('four processes bundle and import the editor at the same time, and each one gets a working module', async () => {
  const script =
    "import { loadModule } from './test/helpers.mjs'; const m = await loadModule('webview/editor.ts', 'editor'); console.log('result:' + typeof m.createEditor);";
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      run(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env: childEnv() }),
    ),
  );
  // The runner of tests may add its own lines to the output of a child, so the test reads only the line that has the mark.
  assert.deepEqual(
    results.map((result) => /^result:(.+)$/m.exec(result.stdout)?.[1]),
    ['function', 'function', 'function', 'function'],
  );
});
