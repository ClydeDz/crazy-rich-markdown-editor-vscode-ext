// A check of the editor against every section of the GitHub page "Basic writing and formatting syntax".
// Each section has an example in test/fixtures/gfm-sections.json. The check tells what the editor must make of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModule, makeEditor } from './helpers.mjs';
import { createRequire } from 'node:module';

const { countDocument, readDom } = createRequire(import.meta.url)('./gfm-check.cjs');

const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/gfm-sections.json', import.meta.url), 'utf8'));

const load = (markdown) => makeEditor(createEditor, markdown);

test('every section of the GitHub page has an example or a note', () => {
  const covered = new Set(fixture.sections.map((section) => section.section.replace(/ \(.*\)$/, '')));
  const missing = fixture.pageSections.filter((title) => !covered.has(title) && !fixture.notes[title]);
  assert.deepEqual(missing, []);
  assert.equal(fixture.pageSections.length, 24);
});

test('every syntax form that the GitHub page documents is used by an example', () => {
  const missing = [];
  const pages = new Map();
  for (const section of fixture.sections) {
    const title = section.section.replace(/ \(.*\)$/, '');
    const entry = pages.get(title) ?? { forms: [], markdown: '' };
    entry.forms.push(...(section.forms ?? []));
    entry.markdown += `${section.markdown}\n`;
    pages.set(title, entry);
  }
  for (const [title, { forms, markdown }] of pages) {
    assert.ok(forms.length > 0, `${title} lists its forms`);
    for (const form of forms) {
      if (!markdown.includes(form)) {
        missing.push(`${title}: ${JSON.stringify(form)}`);
      }
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(pages.size, 22, 'the 22 sections that are Markdown syntax');
});

for (const section of fixture.sections) {
  test(`GitHub page, "${section.section}": the example reads and writes back`, () => {
    const editor = load(section.markdown);
    const written = getMarkdown(editor);
    assert.equal(written, section.roundtrip ?? section.markdown);
    // Writing the result again must not change it.
    const again = load(written);
    assert.equal(getMarkdown(again), written);
    editor.destroy();
    again.destroy();
  });

  test(`GitHub page, "${section.section}": the example shows as the right rich content`, () => {
    const editor = load(section.markdown);
    const { nodes, marks } = countDocument(editor.getJSON());
    assert.deepEqual(nodes, section.expect.nodes, 'nodes');
    assert.deepEqual(marks, section.expect.marks, 'marks');

    const { dom, values } = readDom(editor.view.dom, section.expect);
    assert.deepEqual(dom, section.expect.dom ?? {}, 'elements');
    (section.expect.values ?? []).forEach((spec, index) => {
      assert.deepEqual(values[index], spec.list, `${spec.selector} ${spec.of}`);
    });
    editor.destroy();
  });
}

test('GitHub page: all examples in one document', () => {
  const markdown = fixture.sections.map((section) => section.markdown).join('\n\n');
  const expected = fixture.sections.map((section) => section.roundtrip ?? section.markdown).join('\n\n');
  const editor = load(markdown);
  assert.equal(getMarkdown(editor), expected);

  const { nodes, marks } = countDocument(editor.getJSON());
  const sum = (key) =>
    fixture.sections.reduce((all, section) => {
      for (const [name, count] of Object.entries(section.expect[key])) {
        all[name] = (all[name] ?? 0) + count;
      }
      return all;
    }, {});
  assert.deepEqual(nodes, sum('nodes'));
  assert.deepEqual(marks, sum('marks'));
  editor.destroy();
});

test('GitHub page: the two sections that are not Markdown syntax are covered another way', async () => {
  const suite = readFileSync(new URL('./vscode/suite.cjs', import.meta.url), 'utf8');
  for (const name of [
    'a pasted image is copied to the assets folder next to the document',
    'real webview: a pasted image is copied to the assets folder and shows in the editor',
    'real webview: a dropped video is copied to the assets folder and shows as a player',
  ]) {
    assert.ok(suite.includes(name), name);
  }
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'richMarkdown.openSource'));
  assert.ok(fixture.notes['Uploading assets'] && fixture.notes['Disabling Markdown rendering']);
});
