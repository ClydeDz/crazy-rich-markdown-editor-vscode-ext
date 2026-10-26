// Runs every example of the GitHub page through the editor, when the page can be fetched.
// Without the internet the test is skipped. The page text is read at run time. It is not saved in this project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkExamples, extractExamples, loadExamples } from '../scripts/github-page-lib.mjs';

test('the examples of the GitHub page itself read and write back', async (t) => {
  let examples;
  try {
    examples = await loadExamples();
  } catch (error) {
    t.skip(`the page cannot be fetched: ${error instanceof Error ? error.message : error}`);
    return;
  }
  // The page has about 60 examples. A much smaller number means that the page changed and the finder needs a look.
  assert.ok(examples.length >= 50, `the finder found ${examples.length} examples`);
  const sections = new Set(examples.map((example) => example.section));
  for (const section of ['Headings', 'Styling text', 'Lists', 'Footnotes', 'Alerts']) {
    assert.ok(sections.has(section), `examples of "${section}"`);
  }

  const { failures } = await checkExamples(examples);
  assert.deepEqual(
    failures.map((failure) => `${failure.section} (${failure.kind}): ${failure.problem}`),
    [],
  );
});

test('the finder takes code blocks, table cells and code spans, and skips template tags', () => {
  const source = [
    '## Section one',
    '',
    '```markdown',
    '# A heading',
    '```',
    '',
    '| Style | Example |',
    '| - | - |',
    '| Bold | `**bold**` |',
    '',
    'Write `[link](url)` here, and `plainword`, and `{% data x %}`.',
    '',
    '```text',
    '{% raw %}',
    '```',
  ].join('\n');
  const found = extractExamples(source).map((example) => `${example.section}|${example.kind}|${example.source}`);
  assert.deepEqual(found, [
    'Section one|code block|# A heading',
    'Section one|table cell|**bold**',
    'Section one|code span|[link](url)',
  ]);
});

test('a local copy of the examples is used when it exists, and the page is not fetched', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'gfm-local-'));
  try {
    const file = path.join(folder, 'examples.json');
    const copy = [{ section: 'Headings', kind: 'code block', source: '# A heading' }];
    writeFileSync(file, JSON.stringify(copy));
    assert.deepEqual(await loadExamples(file), copy);
    const { failures } = await checkExamples(copy);
    assert.deepEqual(failures, []);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
