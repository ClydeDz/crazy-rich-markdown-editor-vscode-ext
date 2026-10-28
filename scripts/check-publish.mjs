// Tells the publish workflow if it must publish the package. It checks the setup, asks the Marketplace which
// versions it holds, and compares them with the version in package.json.
//
// Usage: node scripts/check-publish.mjs [folder-with-the-vsix] [--manifest package.json]
//   The script writes `publish=true|false` and `vsix=<path>` to the file that GITHUB_OUTPUT names.
//   It exits with code 1 when the setup is not complete (no publisher, no VSCE_PAT, or no package file).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { decidePublish, publishedVersions } from './publish-lib.mjs';

export function runCheckPublish({
  args = process.argv.slice(2),
  env = process.env,
  exec = execFileSync,
  log = console.log,
} = {}) {
  const manifestIndex = args.indexOf('--manifest');
  const manifestPath = manifestIndex >= 0 ? args[manifestIndex + 1] : 'package.json';
  const manifestValueIndex = manifestIndex >= 0 ? manifestIndex + 1 : -1;
  const folder = args.find((arg, index) => !arg.startsWith('--') && index !== manifestValueIndex) ?? '.';

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const { publisher, name, version } = manifest;
  const vsix = path.join(folder, `${name}-${version}.vsix`);

  const note = (level, message) => log(env.GITHUB_ACTIONS ? `::${level}::${message}` : `${level}: ${message}`);
  const setOutput = (key, value) => {
    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  };
  const summary = (text) => {
    if (env.GITHUB_STEP_SUMMARY) {
      appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
    }
  };
  const fail = (message) => {
    note('error', message);
    summary(`### Not published\n${message}`);
    setOutput('publish', 'false');
    return 1;
  };

  const hasToken = Boolean(env.VSCE_PAT);
  const setup = decidePublish({ publisher, version, published: [], hasToken });
  if (!setup.ok) {
    return fail(setup.message);
  }

  let output;
  try {
    output = exec('yarn', ['--silent', 'vsce', 'show', `${publisher}.${name}`, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    return fail(
      `The Marketplace did not answer for ${publisher}.${name}: ${error instanceof Error ? error.message : error}`,
    );
  }

  const decision = decidePublish({ publisher, version, published: publishedVersions(output), hasToken });
  if (decision.publish && !existsSync(vsix)) {
    return fail(`The package file ${vsix} does not exist. The build job must make it.`);
  }

  note('notice', decision.message);
  summary(`### ${decision.publish ? 'Publishing' : 'Not published'}\n${decision.message}`);
  setOutput('publish', String(decision.publish));
  setOutput('vsix', vsix);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCheckPublish();
}
