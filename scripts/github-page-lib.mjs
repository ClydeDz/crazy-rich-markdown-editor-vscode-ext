// Runs the examples of the GitHub page "Basic writing and formatting syntax" through the editor.
// github-page-extract.mjs fetches the page and finds the examples. The page text is not saved in this project.
//
// For each example this file checks that:
//   1. the editor reads it without an error,
//   2. the text that the editor writes back reads as the same document (nothing changes on a second pass),
//   3. the letters and digits of the example are still in the text that the editor writes.
//
import { loadModule, makeEditor } from '../test/helpers.mjs';

export { LOCAL_COPY, SOURCE, extractExamples, fetchExamples, loadExamples } from './github-page-extract.mjs';

const alnum = (text) =>
  text
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&#?\w+;/g, '')
    .match(/[\p{L}\p{N}]/gu)
    ?.join('') ?? '';

/** Run examples through the editor. It gives the result for each section and the examples that failed. */
export async function checkExamples(examples) {
  const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
  const load = (markdown) => makeEditor(createEditor, markdown);

  const bySection = new Map();
  const failures = [];
  for (const example of examples) {
    const row = bySection.get(example.section) ?? { total: 0, passed: 0 };
    row.total++;
    bySection.set(example.section, row);

    let problem;
    try {
      const first = load(example.source);
      const written = getMarkdown(first);
      const second = load(written);
      if (JSON.stringify(second.getJSON()) !== JSON.stringify(first.getJSON())) {
        problem = 'the written text reads as another document';
      } else if (alnum(example.source) !== alnum(written)) {
        problem = 'letters or digits were lost or added';
      }
      first.destroy();
      second.destroy();
    } catch (error) {
      problem = `the editor failed: ${error instanceof Error ? error.message : error}`;
    }
    if (problem) {
      failures.push({ ...example, problem });
    } else {
      row.passed++;
    }
  }
  return { bySection, failures };
}
