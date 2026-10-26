// Tells the publish workflow if it must publish the package. It checks the setup, asks the Marketplace which
// versions it holds, and compares them with the version in package.json.
//
// Usage: node scripts/check-publish.mjs [folder-with-the-vsix] [--manifest package.json]
//   The script writes `publish=true|false` and `vsix=<path>` to the file that GITHUB_OUTPUT names.
//   It exits with code 1 when the setup is not complete (no publisher, no VSCE_PAT, or no package file).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { decidePublish, publishedVersions } from './publish-lib.mjs';

const args = process.argv.slice(2);
const manifestIndex = args.indexOf('--manifest');
const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : 'package.json';
const manifestValueIndex = manifestIndex >= 0 ? manifestIndex + 1 : -1;
const folder = args.find((arg, index) => !arg.startsWith('--') && index !== manifestValueIndex) ?? '.';

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const { publisher, name, version } = manifest;
const vsix = path.join(folder, `${name}-${version}.vsix`);

const inActions = Boolean(process.env.GITHUB_ACTIONS);
const note = (level, message) => console.log(inActions ? `::${level}::${message}` : `${level}: ${message}`);
const setOutput = (key, value) => {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
};
const summary = (text) => {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  }
};

function fail(message) {
  note('error', message);
  summary(`### Not published\n${message}`);
  setOutput('publish', 'false');
  process.exit(1);
}

const hasToken = Boolean(process.env.VSCE_PAT);
const setup = decidePublish({ publisher, version, published: [], hasToken });
if (!setup.ok) {
  fail(setup.message);
}

// Ask the Marketplace. A failed request stops the workflow: it must not publish without this answer.
let output;
try {
  output = execFileSync('yarn', ['--silent', 'vsce', 'show', `${publisher}.${name}`, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  fail(`The Marketplace did not answer for ${publisher}.${name}: ${error instanceof Error ? error.message : error}`);
}

const decision = decidePublish({ publisher, version, published: publishedVersions(output), hasToken });
if (decision.publish && !existsSync(vsix)) {
  fail(`The package file ${vsix} does not exist. The build job must make it.`);
}

note('notice', decision.message);
summary(`### ${decision.publish ? 'Publishing' : 'Not published'}\n${decision.message}`);
setOutput('publish', String(decision.publish));
setOutput('vsix', vsix);
