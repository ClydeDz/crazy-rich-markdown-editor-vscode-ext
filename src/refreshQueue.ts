/**
 * Runs `task` one at a time. A call that comes while the task runs does not start a second run. It waits, and one more run
 * follows. All the calls that wait count as one: the follow-up run reads Git when any of them asked for it.
 * The editor uses this for the date and the authors in the bar, so a burst of events makes at most one extra read of `git log`.
 */
export function coalesceRefresh(task: (readGit: boolean) => Promise<void>): (readGit: boolean) => Promise<void> {
  let running = false;
  let waiting: { readGit: boolean } | undefined;

  const run = async (readGit: boolean): Promise<void> => {
    if (running) {
      waiting = { readGit: (waiting?.readGit ?? false) || readGit };
      return;
    }
    running = true;
    try {
      await task(readGit);
    } finally {
      running = false;
    }
    if (waiting) {
      const next = waiting;
      waiting = undefined;
      await run(next.readGit);
    }
  };
  return run;
}
