import { execFile } from 'node:child_process';
import * as path from 'node:path';

/** A person who changed the file, with the newest commit of that person. */
export interface FileAuthor {
  name: string;
  /** The time of the commit, in milliseconds since 1970. */
  date: number;
  /** The first line of the commit message. */
  subject: string;
}

/** How many commits `git log` reads. The list of authors comes from these commits. */
export const MAX_COMMITS = 20;
const GIT_TIMEOUT_MS = 5000;
const FIELD = '\u001f';

/**
 * Read the output of `git log --format=%aN<US>%aE<US>%at<US>%s`, one commit on each line, newest first.
 * Return each person once, newest first. The e-mail address tells that two names are one person.
 */
export function parseGitLog(output: string): FileAuthor[] {
  const authors: FileAuthor[] = [];
  const seen = new Set<string>();
  for (const line of output.split('\n')) {
    const [name = '', email = '', seconds = '', ...subject] = line.split(FIELD);
    const time = Number(seconds);
    if (!name.trim() || !Number.isFinite(time) || seconds === '') {
      continue;
    }
    const key = (email.trim() || name).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    authors.push({ name: name.trim(), date: time * 1000, subject: subject.join(FIELD).trim() });
  }
  return authors;
}

/**
 * The people who changed a file in the last commits, newest first. This follows the file across renames.
 * The result is empty when the file is not in a Git repository, when no commit has it, or when Git fails.
 */
export function readGitAuthors(file: string, git = 'git'): Promise<FileAuthor[]> {
  const args = [
    '--no-pager',
    '-c',
    'i18n.logOutputEncoding=UTF-8',
    '-c',
    'log.showSignature=false',
    'log',
    '--follow',
    `--max-count=${MAX_COMMITS}`,
    `--format=%aN%x1f%aE%x1f%at%x1f%s`,
    '--',
    path.basename(file),
  ];
  return new Promise((resolve) => {
    execFile(
      git,
      args,
      {
        cwd: path.dirname(file),
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
      },
      (error, stdout) => resolve(error ? [] : parseGitLog(stdout)),
    );
  });
}
