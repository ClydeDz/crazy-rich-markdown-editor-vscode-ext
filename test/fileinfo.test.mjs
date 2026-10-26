import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadModule } from './helpers.mjs';

const { gitAvailable, makeRepo } = createRequire(import.meta.url)('./git-helper.cjs');
const { parseGitLog, readGitAuthors, MAX_COMMITS } = await loadModule('src/fileInfo.ts', 'fileInfo');

const US = '\u001f';
const line = (name, email, seconds, subject) => [name, email, seconds, subject].join(US);

test('parseGitLog returns each person once, newest first', () => {
  const output = [
    line('Bob', 'bob@example.org', '1790000000', 'Fix typo'),
    line('Alice', 'alice@example.org', '1780000000', 'Add intro'),
    line('Bob Smith', 'BOB@example.org', '1770000000', 'An older commit of Bob'),
    '',
  ].join('\n');
  assert.deepEqual(parseGitLog(output), [
    { name: 'Bob', date: 1790000000000, subject: 'Fix typo' },
    { name: 'Alice', date: 1780000000000, subject: 'Add intro' },
  ]);
});

test('parseGitLog treats a person without an e-mail address by the name', () => {
  const output = [line('Carol', '', '300', 'one'), line('carol', '', '200', 'two'), line('Dan', '', '100', 'three')].join('\n');
  assert.deepEqual(
    parseGitLog(output).map((author) => author.name),
    ['Carol', 'Dan'],
  );
});

test('parseGitLog skips a line that is not a commit', () => {
  const output = ['', 'garbage', line('', 'x@example.org', '1', 'no name'), line('Eve', 'eve@example.org', 'soon', 'bad time'), line('Fay', 'fay@example.org', '5', 'ok')].join('\n');
  assert.deepEqual(parseGitLog(output), [{ name: 'Fay', date: 5000, subject: 'ok' }]);
  assert.deepEqual(parseGitLog(''), []);
});

test('parseGitLog keeps a subject that has the separator character in it', () => {
  assert.equal(parseGitLog(line('Gus', 'gus@example.org', '1', `a${US}b`))[0].subject, `a${US}b`);
});

const git = gitAvailable() ? test : test.skip;

/** Each case makes its own repository in the temporary directory of the system. */
function inTempFolder(body) {
  const folder = mkdtempSync(path.join(tmpdir(), 'rme-git-'));
  return Promise.resolve(body(folder)).finally(() => rmSync(folder, { recursive: true, force: true }));
}

const at = (iso) => Date.parse(iso);

git('readGitAuthors reads the people who changed a file, newest first, and ignores other files', () =>
  inTempFolder(async (folder) => {
    makeRepo(folder, [
      { file: 'doc.md', content: 'one\n', author: 'Alice Smith <alice@example.org>', date: '2026-01-05T10:00:00Z', message: 'Add the first draft' },
      { file: 'doc.md', content: 'one\ntwo\n', author: 'Bob Lee <bob@example.org>', date: '2026-02-10T11:30:00Z', message: 'Fix the second line' },
      { file: 'other.md', content: 'x\n', author: 'Carol Diaz <carol@example.org>', date: '2026-02-20T09:00:00Z', message: 'A different file' },
      { file: 'doc.md', content: 'one\ntwo\nthree\n', author: 'Alice Smith <alice@example.org>', date: '2026-03-01T09:15:00Z', message: 'Add the third line' },
    ]);
    const authors = await readGitAuthors(path.join(folder, 'doc.md'));
    assert.deepEqual(authors, [
      { name: 'Alice Smith', date: at('2026-03-01T09:15:00Z'), subject: 'Add the third line' },
      { name: 'Bob Lee', date: at('2026-02-10T11:30:00Z'), subject: 'Fix the second line' },
    ]);
  }),
);

git('readGitAuthors works for a file in a folder of the repository', () =>
  inTempFolder(async (folder) => {
    makeRepo(folder, [{ file: 'docs/guide/page.md', content: 'x\n', author: 'Ina Roy <ina@example.org>', date: '2026-04-01T08:00:00Z', message: 'Add the page' }]);
    const authors = await readGitAuthors(path.join(folder, 'docs', 'guide', 'page.md'));
    assert.deepEqual(authors.map((author) => author.name), ['Ina Roy']);
  }),
);

git('readGitAuthors follows a file that was renamed', () =>
  inTempFolder(async (folder) => {
    makeRepo(folder, [
      { file: 'old.md', content: 'A long enough text,\nso that Git sees\nthe same file after the move.\n', author: 'Erin Park <erin@example.org>', date: '2026-01-02T10:00:00Z', message: 'Add old.md' },
      { file: 'new.md', renameFrom: 'old.md', content: 'A long enough text,\nso that Git sees\nthe same file after the move.\n', author: 'Dave Kim <dave@example.org>', date: '2026-01-03T10:00:00Z', message: 'Rename the file' },
    ]);
    const authors = await readGitAuthors(path.join(folder, 'new.md'));
    assert.deepEqual(authors.map((author) => author.name), ['Dave Kim', 'Erin Park']);
  }),
);

git('readGitAuthors keeps names and subjects that have non-ASCII characters', () =>
  inTempFolder(async (folder) => {
    makeRepo(folder, [{ file: 'doc.md', content: 'x\n', author: 'Zoë Müller 田中 <zoe@example.org>', date: '2026-05-01T10:00:00Z', message: 'Écrire « bonjour » 🎉' }]);
    const [author] = await readGitAuthors(path.join(folder, 'doc.md'));
    assert.equal(author.name, 'Zoë Müller 田中');
    assert.equal(author.subject, 'Écrire « bonjour » 🎉');
  }),
);

git('readGitAuthors reads at most the last commits', () =>
  inTempFolder(async (folder) => {
    const steps = [];
    for (let index = 0; index < MAX_COMMITS + 3; index++) {
      steps.push({
        file: 'doc.md',
        content: `${index}\n`,
        author: `Person ${index} <p${index}@example.org>`,
        date: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        message: `Commit ${index}`,
      });
    }
    makeRepo(folder, steps);
    const authors = await readGitAuthors(path.join(folder, 'doc.md'));
    assert.equal(authors.length, MAX_COMMITS);
    assert.equal(authors[0].name, `Person ${MAX_COMMITS + 2}`, 'the newest commit comes first');
  }),
);

git('readGitAuthors gives an empty list for a file that no commit has', () =>
  inTempFolder(async (folder) => {
    makeRepo(folder, [{ file: 'committed.md', content: 'x\n', author: 'Hal Wu <hal@example.org>', date: '2026-01-01T00:00:00Z', message: 'Add' }]);
    writeFileSync(path.join(folder, 'untracked.md'), 'not in Git\n');
    assert.deepEqual(await readGitAuthors(path.join(folder, 'untracked.md')), []);
    assert.deepEqual(await readGitAuthors(path.join(folder, 'missing.md')), []);
  }),
);

git('readGitAuthors gives an empty list outside a Git repository', () =>
  inTempFolder(async (folder) => {
    writeFileSync(path.join(folder, 'doc.md'), 'x\n');
    assert.deepEqual(await readGitAuthors(path.join(folder, 'doc.md')), []);
  }),
);

test('readGitAuthors gives an empty list, and does not throw, when the git program does not exist', async () => {
  assert.deepEqual(await readGitAuthors(path.join(tmpdir(), 'doc.md'), 'no-such-git-program-zz'), []);
});
