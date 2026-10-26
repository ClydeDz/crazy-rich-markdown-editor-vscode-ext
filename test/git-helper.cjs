// Makes small Git repositories for the tests. Every repository lives in a folder that the test names.
// The helper never touches the project folder: a test must pass a folder in the temporary directory of the system.
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** True when a `git` program is installed. */
function gitAvailable() {
  return spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
}

/** Git without the settings of the user (a global setting can turn on commit signing, which would stop a test). */
function git(directory, args, env = {}) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${os.devNull}`, ...args], {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1', ...env },
  });
}

/**
 * Write a file and commit it in an existing repository.
 * A step is { file, content, author: 'Name <email>', date: '2026-01-05T10:00:00Z', message, renameFrom? }.
 * With `renameFrom`, the commit renames that file to `file`.
 */
function commit(directory, step) {
  const match = /^(.*) <(.*)>$/.exec(step.author);
  const env = {
    GIT_AUTHOR_NAME: match[1],
    GIT_AUTHOR_EMAIL: match[2],
    GIT_COMMITTER_NAME: match[1],
    GIT_COMMITTER_EMAIL: match[2],
    GIT_AUTHOR_DATE: step.date,
    GIT_COMMITTER_DATE: step.date,
  };
  if (step.renameFrom) {
    git(directory, ['mv', step.renameFrom, step.file]);
  }
  const target = path.join(directory, step.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, step.content);
  git(directory, ['add', '-A']);
  git(directory, ['commit', '-q', '-m', step.message], env);
}

/** Make a repository in `directory`, and add one commit for each step (see `commit`). */
function makeRepo(directory, steps) {
  if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()))) {
    throw new Error(`Refusing to make a Git repository outside the temporary directory: ${directory}`);
  }
  fs.mkdirSync(directory, { recursive: true });
  git(directory, ['init', '-q']);
  for (const step of steps) {
    commit(directory, step);
  }
}

module.exports = { gitAvailable, makeRepo, commit };
