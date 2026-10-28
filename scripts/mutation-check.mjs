// Breaks the code on purpose, one small change at a time, and runs the tests after each change.
// A test suite that is valid fails after every change that alters the behavior. A change that no test notices
// is a "survivor". It shows a gap in the tests, or a change that does not alter the behavior.
//
// The script never touches this project. It works in copies in the temporary folder of the system.
//
// Usage: node scripts/mutation-check.mjs [options]
//   --suite unit|vscode|all   Which tests to run. `unit` is `yarn test`. `vscode` is `yarn test:vscode`, which is slow
//                             and uses the VS Code that is installed. Default: unit.
//   --jobs N                  Mutants that run at the same time. Default 3 for unit and 2 for vscode.
//   --seed N                  Picks the random mutants. The same seed picks the same mutants. Default 1.
//   --per-file N              Random mutants for each file. Default: one for about 22 lines of code, from 2 to 18.
//   --only TEXT[,TEXT...]     Run only the mutants whose id or file has one of these texts.
//   --hand-only | --auto-only Run only the mutants that scripts/mutations.mjs lists, or only the random ones.
//   --list                    Show the mutants and stop.
//   --report FILE             Write the result as JSON. Default: rme-mutation-report.json in the temporary folder.
// The exit code is 1 when a mutant survived.
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTO_FILES, HAND_MUTANTS } from './mutations.mjs';
import { applyMutant, describeMutant, findMutants, isValidSyntax, seededShuffle } from './mutation-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const suiteOption = option('--suite', 'unit');
const suites = suiteOption === 'all' ? ['unit', 'vscode'] : [suiteOption];
const seed = Number(option('--seed', '1'));
const perFileOption = option('--per-file');
const only = option('--only');
const reportPath = option('--report', path.join(tmpdir(), 'rme-mutation-report.json'));
const jobsFor = (suite) => Number(option('--jobs', suite === 'unit' ? '3' : '2'));
const useHand = !args.includes('--auto-only');
const useAuto = !args.includes('--hand-only');

const TIMEOUT_MS = { unit: 180_000, vscode: 480_000 };

// ---------- Choose the mutants ----------

const read = (file) => readFileSync(path.join(root, file), 'utf8');

function handMutants() {
  return HAND_MUTANTS.map((hand) => {
    const source = read(hand.file);
    const first = source.indexOf(hand.find);
    if (first < 0 || source.indexOf(hand.find, first + 1) >= 0) {
      throw new Error(
        `The mutant "${hand.id}" must match exactly once in ${hand.file}: ${JSON.stringify(hand.find.slice(0, 60))}`,
      );
    }
    const mutant = {
      start: first,
      end: first + hand.find.length,
      replacement: hand.replace,
      operator: hand.why,
      line: source.slice(0, first).split('\n').length,
    };
    if (!isValidSyntax(applyMutant(source, mutant), hand.file)) {
      throw new Error(`The mutant "${hand.id}" breaks the syntax of ${hand.file}.`);
    }
    return {
      id: hand.id,
      kind: 'hand',
      suite: hand.suite ?? 'unit',
      file: hand.file,
      accepted: hand.accepted,
      mutant,
      description: `${hand.why}   | ${describeMutant(source, mutant).split('|').pop().trim()}`,
    };
  });
}

function autoMutants() {
  const result = [];
  for (const file of AUTO_FILES) {
    const source = read(file);
    const codeLines = source.split('\n').filter((line) => line.trim() && !line.trim().startsWith('//')).length;
    const wanted = perFileOption ? Number(perFileOption) : Math.min(18, Math.max(2, Math.round(codeLines / 22)));
    const fileSeed = seed + [...file].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    let taken = 0;
    for (const mutant of seededShuffle(findMutants(source), fileSeed)) {
      if (taken >= wanted) break;
      if (!isValidSyntax(applyMutant(source, mutant), file)) continue;
      taken++;
      result.push({
        id: `${file}:${mutant.line}:${mutant.operator}`,
        kind: 'auto',
        suite: 'unit',
        file,
        mutant,
        description: describeMutant(source, mutant),
      });
    }
  }
  return result;
}

const mutants = [...(useHand ? handMutants() : []), ...(useAuto ? autoMutants() : [])]
  .filter((item) => suites.includes(item.suite))
  .filter((item) => !only || only.split(',').some((part) => item.id.includes(part) || item.file.includes(part)));

if (args.includes('--list')) {
  for (const item of mutants)
    console.log(`${item.kind.padEnd(5)} ${item.suite.padEnd(6)} ${item.id}\n        ${item.description}`);
  console.log(`\n${mutants.length} mutants.`);
  process.exit(0);
}
if (mutants.length === 0) {
  console.log('No mutants to run.');
  process.exit(0);
}

// ---------- Copies of the project ----------

const scratch = mkdtempSync(path.join(tmpdir(), 'rme-mutate-'));
let cleaned = false;
function cleanUp() {
  if (!cleaned) {
    cleaned = true;
    rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
process.on('exit', cleanUp);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));

const SKIP = new Set(['node_modules', 'dist', '.git', '.claude', '.build']);
function makeJob(name) {
  const directory = path.join(scratch, name);
  cpSync(root, directory, {
    recursive: true,
    filter: (source) => !SKIP.has(path.basename(source)) && !source.endsWith('.vsix'),
  });
  symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
  return directory;
}

/** The test of the GitHub page needs the examples. Fetch them once, and put them in the copies (not in this project). */
async function prepareExamples() {
  const { fetchExamples, LOCAL_COPY } = await import('./github-page-lib.mjs');
  if (existsSync(LOCAL_COPY)) return undefined;
  try {
    return JSON.stringify(await fetchExamples());
  } catch (error) {
    console.log(
      `The GitHub page cannot be fetched (${error instanceof Error ? error.message : error}). Its test is skipped in every run.`,
    );
    return undefined;
  }
}

// ---------- Run the tests ----------

function run(command, commandArgs, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true' },
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // The process has ended.
      }
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: timedOut ? -1 : code, timedOut, output });
    });
  });
}

async function runSuite(suite, directory) {
  if (suite === 'unit') {
    const result = await run(
      process.execPath,
      ['--test', '--test-reporter=tap', '--test-concurrency=3', 'test/*.test.mjs'],
      directory,
      TIMEOUT_MS.unit,
    );
    const failed = [...result.output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
    return { ...result, failed };
  }
  const built = await run(process.execPath, ['esbuild.mjs'], directory, 120_000);
  if (built.code !== 0) return { ...built, failed: [], buildFailed: true };
  const result = await run(process.execPath, ['test/vscode/run.mjs'], directory, TIMEOUT_MS.vscode);
  const failed = [...result.output.matchAll(/^\s+FAIL (.+)$/gm)].map((match) => match[1]);
  return { ...result, failed };
}

const results = [];
let finished = 0;

async function worker(suite, directory, queue) {
  for (let item = queue.shift(); item; item = queue.shift()) {
    const file = path.join(directory, item.file);
    const original = readFileSync(file, 'utf8');
    writeFileSync(file, applyMutant(original, item.mutant));
    let outcome;
    try {
      outcome = await runSuite(suite, directory);
    } finally {
      writeFileSync(file, original);
    }
    let status;
    if (outcome.timedOut) status = 'killed-by-timeout';
    else if (outcome.code === 0) status = 'survived';
    else if (outcome.failed.length === 0) status = 'killed-by-crash';
    else status = 'killed';
    finished++;
    results.push({ ...item, mutant: undefined, status, failedTests: outcome.failed.slice(0, 5) });
    const by = outcome.failed[0] ? `  <- ${outcome.failed[0].slice(0, 90)}` : '';
    console.log(
      `[${finished}/${mutants.length}] ${status.toUpperCase().padEnd(17)} ${item.id}${status === 'survived' ? `\n      ${item.description}` : by}`,
    );
  }
}

try {
  const examples = await prepareExamples();
  for (const suite of suites) {
    const queue = mutants.filter((item) => item.suite === suite);
    if (queue.length === 0) continue;
    const jobs = Math.min(jobsFor(suite), queue.length);
    const directories = [];
    for (let index = 0; index < jobs; index++) {
      const directory = makeJob(`${suite}${index}`);
      if (examples) {
        mkdirSync(path.join(directory, 'test', 'fixtures'), { recursive: true });
        writeFileSync(path.join(directory, 'test', 'fixtures', 'github-page-examples.json'), examples);
      }
      directories.push(directory);
    }
    // The tests must pass without a change. If they do not, every result would be wrong.
    const baseline = await Promise.all(directories.map((directory) => runSuite(suite, directory)));
    const broken = baseline.find((outcome) => outcome.code !== 0);
    if (broken) {
      console.error(
        `The ${suite} tests fail without any change. Fix them first.\n${broken.failed.join('\n') || broken.output.slice(-1500)}`,
      );
      process.exit(2);
    }
    console.log(`The ${suite} tests pass without a change. ${queue.length} mutants, ${jobs} at a time.\n`);
    await Promise.all(directories.map((directory) => worker(suite, directory, queue)));
  }
} finally {
  cleanUp();
}

const allSurvivors = results.filter((item) => item.status === 'survived');
const accepted = allSurvivors.filter((item) => item.accepted);
const survivors = allSurvivors.filter((item) => !item.accepted);
const count = (status) => results.filter((item) => item.status === status).length;
console.log(
  `\n${results.length} mutants: ${count('killed')} killed by a failing test, ${count('killed-by-crash')} by a crash, ${count('killed-by-timeout')} by a timeout, ${survivors.length} survived${accepted.length ? `, ${accepted.length} more survived and are accepted` : ''}.`,
);
for (const item of survivors) console.log(`SURVIVED ${item.id}\n    ${item.description}`);
for (const item of accepted) console.log(`ACCEPTED ${item.id}\n    ${item.accepted}`);
writeFileSync(reportPath, JSON.stringify(results, null, 1));
console.log(`\nThe report is in ${reportPath}`);
process.exit(survivors.length > 0 ? 1 : 0);
