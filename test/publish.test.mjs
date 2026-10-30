import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decidePublish, publishedVersions } from '../scripts/publish-lib.mjs';
import { runCheckPublish } from '../scripts/check-publish.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(path.join(root, '.github', 'workflows', 'publish.yml'), 'utf8');
const require = createRequire(import.meta.url);

test('publishedVersions reads the versions from the output of vsce show', () => {
  const output = JSON.stringify({
    publisher: { publisherName: 'acme' },
    versions: [{ version: '1.2.0' }, { version: '1.1.0' }, { version: '1.1.0' }],
  });
  assert.deepEqual(publishedVersions(output), ['1.2.0', '1.1.0']);
});

test('publishedVersions returns nothing when the extension is not on the Marketplace', () => {
  // vsce show prints the word undefined and exits with code 0 for an extension that does not exist.
  assert.deepEqual(publishedVersions('undefined'), []);
  assert.deepEqual(publishedVersions(''), []);
  assert.deepEqual(publishedVersions('null'), []);
  assert.deepEqual(publishedVersions('{}'), []);
  assert.deepEqual(publishedVersions('{"versions":"x"}'), []);
  assert.deepEqual(publishedVersions('not json'), []);
});

test('decidePublish publishes a version that the Marketplace does not hold', () => {
  const decision = decidePublish({ publisher: 'acme', version: '1.3.0', published: ['1.2.0'], hasToken: true });
  assert.deepEqual({ publish: decision.publish, ok: decision.ok }, { publish: true, ok: true });
  assert.match(decision.message, /1\.3\.0/);
});

test('decidePublish skips a version that is already published, and does not fail', () => {
  const decision = decidePublish({
    publisher: 'acme',
    version: '1.2.0',
    published: ['1.2.0', '1.1.0'],
    hasToken: true,
  });
  assert.deepEqual({ publish: decision.publish, ok: decision.ok }, { publish: false, ok: true });
  assert.match(decision.message, /already on the Marketplace/);
});

test('decidePublish fails when the publisher is not a real one', () => {
  for (const publisher of ['local', '', undefined]) {
    const decision = decidePublish({ publisher, version: '1.0.0', published: [], hasToken: true });
    assert.deepEqual({ publish: decision.publish, ok: decision.ok }, { publish: false, ok: false }, String(publisher));
    assert.match(decision.message, /publisher/);
  }
});

test('decidePublish fails when there is no token', () => {
  const decision = decidePublish({ publisher: 'acme', version: '1.0.0', published: [], hasToken: false });
  assert.deepEqual({ publish: decision.publish, ok: decision.ok }, { publish: false, ok: false });
  assert.match(decision.message, /VSCE_PAT/);
});

test('decidePublish tells about the publisher before the token', () => {
  const decision = decidePublish({ publisher: 'local', version: '1.0.0', published: [], hasToken: false });
  assert.match(decision.message, /publisher/);
});

/** Run the script with a manifest in a folder of its own. The cases here stop before the script asks the Marketplace. */
function runScript(manifest, env = {}) {
  const folder = mkdtempSync(path.join(tmpdir(), 'rme-publish-'));
  try {
    const manifestPath = path.join(folder, 'package.json');
    const outputPath = path.join(folder, 'output.txt');
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(outputPath, '');
    const base = { ...process.env, GITHUB_OUTPUT: outputPath, GITHUB_ACTIONS: 'true' };
    delete base.VSCE_PAT;
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'check-publish.mjs'), folder, '--manifest', manifestPath],
      {
        env: { ...base, ...env },
        encoding: 'utf8',
      },
    );
    return { status: result.status, stdout: result.stdout, output: readFileSync(outputPath, 'utf8') };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test('the script fails with a clear error when the publisher is local', () => {
  const run = runScript({ name: 'demo', version: '1.0.0', publisher: 'local' }, { VSCE_PAT: 'x' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^::error::The publisher in package\.json is "local"/m);
  assert.match(run.output, /publish=false/);
});

test('the script fails with a clear error when VSCE_PAT is not set', () => {
  const run = runScript({ name: 'demo', version: '1.0.0', publisher: 'acme' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^::error::The secret VSCE_PAT is not set/m);
  assert.match(run.output, /publish=false/);
});

// These rules protect the Marketplace from a release that nobody asked for.

test('the workflow publishes only from main, and never for a pull request', () => {
  assert.match(workflow, /^on:\n {2}push:\n {4}branches: \[main\]/m);
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.match(publishJob, /needs: build/);
  assert.match(publishJob, /if: github\.ref == 'refs\/heads\/main' && github\.event_name != 'pull_request'/);
  assert.match(publishJob, /environment:\s*\n\s+name: marketplace/);
  assert.doesNotMatch(
    workflow.slice(0, workflow.indexOf('\n  publish:')),
    /vsce publish/,
    'the build job does not publish',
  );
});

test('the workflow publishes the file that the build job made, and reads the token from a secret', () => {
  assert.match(workflow, /vsce publish --packagePath "\$VSIX"/);
  const tokenLines = workflow.split('\n').filter((line) => /VSCE_PAT:/.test(line));
  assert.ok(tokenLines.length >= 2);
  for (const line of tokenLines) {
    assert.match(line, /VSCE_PAT: \$\{\{ secrets\.VSCE_PAT \}\}$/, line);
  }
  assert.match(workflow, /^permissions:\n {2}contents: read$/m, 'the workflow defaults to read-only');
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.match(publishJob, /^    permissions:\n      contents: write$/m, 'only the publish job can create releases');
});

test('the workflow creates a versioned GitHub release with the VSIX after Marketplace publishing', () => {
  const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));
  assert.match(publishJob, /run: yarn vsce publish --packagePath "\$VSIX"/);
  const publishIndex = publishJob.indexOf('run: yarn vsce publish');
  const releaseIndex = publishJob.indexOf('      - name: Create GitHub release');
  assert.ok(releaseIndex > publishIndex, 'the release step follows Marketplace publishing');
  const releaseStep = publishJob.slice(releaseIndex);
  assert.match(releaseStep, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(releaseStep, /node -p "require\('\.\/package\.json'\)\.version"/);
  assert.match(releaseStep, /gh release create "\$TAG" "\$VSIX" --title "\$VERSION" --generate-notes/);
  assert.match(releaseStep, /gh release upload "\$TAG" "\$VSIX" --clobber/);
});

test('every action in the workflow has a version', () => {
  const uses = workflow.split('\n').filter((line) => /^\s*- uses:|^\s+uses:/.test(line));
  assert.ok(uses.length >= 5);
  for (const line of uses) {
    assert.match(line, /uses: actions\/[a-z-]+@v\d+$/, line);
  }
});

test('the package leaves out the workflow files', () => {
  assert.match(readFileSync(path.join(root, '.vscodeignore'), 'utf8'), /^\.github\/\*\*$/m);
});

// The count of files in the .vsix. The pull request template and the create-pr and release skills
// say this number, so a change of the package moves the test and the three checklists together.
const PACKAGE_FILES = 28;

/**
 * The files that `yarn package` puts in the .vsix. `dist/` is built when it is missing, because
 * the unit tests of CI run without a build.
 */
async function packagedFiles() {
  if (!existsSync(path.join(root, 'dist', 'extension.js'))) {
    const build = spawnSync(process.execPath, [path.join(root, 'esbuild.mjs'), '--production'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);
  }
  const { listFiles, PackageManager } = require('@vscode/vsce');
  return listFiles({ cwd: root, packageManager: PackageManager.None });
}

test('the package holds exactly 28 files, so a file that sneaks in is noticed', async () => {
  const files = await packagedFiles();
  assert.equal(
    files.length,
    PACKAGE_FILES,
    `the package changed. Update PACKAGE_FILES and the three checklists: ${files.join(', ')}`,
  );
});

test('the checklists name the file count that the package has', () => {
  const checklists = [
    ['.github/pull_request_template.md', `package of ${PACKAGE_FILES} files`],
    ['.claude/skills/create-pr/SKILL.md', `file count is ${PACKAGE_FILES}`],
    ['.claude/skills/release/SKILL.md', `file count must stay at ${PACKAGE_FILES}`],
  ];
  for (const [file, phrase] of checklists) {
    assert.ok(readFileSync(path.join(root, file), 'utf8').includes(phrase), `${file} must say "${phrase}"`);
  }
});

// TODO: Check validity of test after publishing
test.skip('the README has no link to a file in the project, because vsce refuses to package it without a repository address', () => {
  const readme = readFileSync(path.join(root, 'README.md'), 'utf8').replace(/```[\s\S]*?```/g, '');
  const links = [...readme.matchAll(/\]\(([^)\s]+)/g)].map((match) => match[1]);
  assert.ok(links.length > 0, 'the README has links to check');
  const relative = links.filter((href) => !/^(https?:|mailto:|#)/i.test(href));
  assert.deepEqual(relative, [], 'a link to a file needs the repository address in package.json');
});

/**
 * Run the publish check with an injected `yarn` runner, so the test can inspect its arguments and return a fake answer
 * without relying on platform-specific executable shims.
 */
function runWithFakeYarn({ answer, exitCode = 0, manifestFirst = false }) {
  const folder = mkdtempSync(path.join(tmpdir(), 'rme-publish-'));
  try {
    const manifestPath = path.join(folder, 'package.json');
    const outputPath = path.join(folder, 'output.txt');
    writeFileSync(manifestPath, JSON.stringify({ name: 'demo', version: '1.0.0', publisher: 'acme' }));
    writeFileSync(path.join(folder, 'demo-1.0.0.vsix'), 'x');
    writeFileSync(outputPath, '');
    const args = manifestFirst ? ['--manifest', manifestPath, folder] : [folder, '--manifest', manifestPath];
    const calls = [];
    let stdout = '';
    const status = runCheckPublish({
      args,
      env: { ...process.env, VSCE_PAT: 'x', GITHUB_OUTPUT: outputPath, GITHUB_ACTIONS: 'true' },
      exec(command, commandArgs) {
        calls.push({ command, args: commandArgs });
        if (exitCode !== 0) {
          throw new Error('fake Marketplace failure');
        }
        return answer;
      },
      log(message) {
        stdout += `${message}\n`;
      },
    });
    return { folder, status, stdout, output: readFileSync(outputPath, 'utf8'), calls };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

test('the script asks the Marketplace through yarn, and publishes a version that is new', () => {
  const run = runWithFakeYarn({ answer: JSON.stringify({ versions: [{ version: '0.9.0' }] }) });
  assert.deepEqual(
    run.calls,
    [{ command: 'yarn', args: ['--silent', 'vsce', 'show', 'acme.demo', '--json'] }],
    'one call, with the extension ID and no Yarn banner',
  );
  assert.equal(run.status, 0);
  assert.match(run.output, /publish=true/);
  assert.match(run.output, /vsix=.*demo-1\.0\.0\.vsix/);
});

test('the script does not publish a version that the Marketplace already holds', () => {
  const run = runWithFakeYarn({ answer: JSON.stringify({ versions: [{ version: '1.0.0' }, { version: '0.9.0' }] }) });
  assert.equal(run.status, 0, 'a skip is not an error');
  assert.match(run.output, /publish=false/);
  assert.match(run.stdout, /already on the Marketplace/);
});

test('the script publishes the first version of an extension that the Marketplace does not know', () => {
  const run = runWithFakeYarn({ answer: 'undefined' });
  assert.equal(run.status, 0);
  assert.match(run.output, /publish=true/);
});

test('the script stops, and does not publish, when yarn or the Marketplace fails', () => {
  const run = runWithFakeYarn({ answer: '', exitCode: 1 });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^::error::The Marketplace did not answer for acme\.demo/m);
  assert.match(run.output, /publish=false/);
});

test('the script finds the folder of the package when the manifest option comes first', () => {
  const run = runWithFakeYarn({ answer: 'undefined', manifestFirst: true });
  assert.equal(run.status, 0, run.stdout);
  const vsix = /^vsix=(.*)$/m.exec(run.output)?.[1];
  assert.equal(
    vsix,
    path.join(run.folder, 'demo-1.0.0.vsix'),
    'the package is in the folder, and the manifest is not taken for the folder',
  );
});
