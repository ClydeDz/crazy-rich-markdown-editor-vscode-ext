// Fetches the source of the GitHub page "Basic writing and formatting syntax" and runs every Markdown example
// of that page through the editor. The page text is read at run time. It is not saved in this project.
//
// For each example the script checks that:
//   1. the editor reads it without an error,
//   2. the text that the editor writes back reads as the same document (nothing changes on a second pass),
//   3. the letters and digits of the example are still in the text that the editor writes.
//
// Usage: node scripts/check-github-page.mjs [--show] [--out examples.json]
//   --show  prints the text of an example that fails (it helps to find the cause)
//   --out   fetches the page and saves the examples to a file. To keep a local copy that the tests use without the
//           internet, save it as test/fixtures/github-page-examples.json. The text is CC BY 4.0: keep the attribution.
import { writeFileSync } from 'node:fs';
import { checkExamples, fetchExamples, loadExamples } from './github-page-lib.mjs';

const show = process.argv.includes('--show');
const outIndex = process.argv.indexOf('--out');
const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

let examples;
try {
  // --out always fetches the page again. Without it, a local copy is used when it exists.
  examples = outFile ? await fetchExamples() : await loadExamples();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}
if (outFile) {
  writeFileSync(outFile, JSON.stringify(examples, null, 1));
}

const { bySection, failures } = await checkExamples(examples);
const width = Math.max(...[...bySection.keys()].map((name) => name.length));
for (const [name, row] of bySection) {
  console.log(`${name.padEnd(width)}  ${row.passed}/${row.total}${row.passed === row.total ? '' : '  <-- problem'}`);
}
console.log(`\n${examples.length - failures.length}/${examples.length} examples of the page pass.`);
for (const failure of failures) {
  console.log(`FAIL [${failure.section}, ${failure.kind}] ${failure.problem}`);
  if (show) {
    console.log(`     ${JSON.stringify(failure.source).slice(0, 300)}`);
  }
}
process.exit(failures.length > 0 ? 1 : 0);
