// Tests of the queue that runs the refresh of the bar at the top (the date and the authors) one at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers.mjs';

const { coalesceRefresh } = await loadModule('src/refreshQueue.ts', 'refreshQueue');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};

/** A task that waits for the test to let it finish. It records its calls and how many runs overlap. */
function slowTask() {
  const calls = [];
  const gates = [];
  const state = { active: 0, mostActive: 0 };
  const task = async (readGit) => {
    calls.push(readGit);
    state.active++;
    state.mostActive = Math.max(state.mostActive, state.active);
    const gate = deferred();
    gates.push(gate);
    await gate.promise;
    state.active--;
  };
  return { task, calls, gates, state };
}

test('one call runs the task once, with the value that the call gave', async () => {
  const seen = [];
  const refresh = coalesceRefresh(async (readGit) => {
    seen.push(readGit);
  });
  await refresh(true);
  await refresh(false);
  assert.deepEqual(seen, [true, false]);
});

test('a call that comes while the task runs waits, and one more run follows', async () => {
  const { task, calls, gates, state } = slowTask();
  const refresh = coalesceRefresh(task);
  const first = refresh(false);
  assert.deepEqual(calls, [false], 'the first call starts the task at once');

  await refresh(false);
  await refresh(false);
  assert.deepEqual(calls, [false], 'the calls that come later do not start a second run');

  gates[0].resolve();
  await sleep(10);
  assert.equal(calls.length, 2, 'one follow-up run starts when the first run ends, not one for each call');
  gates[1].resolve();
  await first;
  assert.equal(calls.length, 2);
  assert.equal(state.mostActive, 1, 'two runs never overlap');
});

test('the follow-up run reads Git when any call that waited asked for it', async () => {
  const { task, calls, gates } = slowTask();
  const refresh = coalesceRefresh(task);
  const first = refresh(false);
  await refresh(false);
  await refresh(true);
  await refresh(false);
  gates[0].resolve();
  await sleep(10);
  assert.deepEqual(calls, [false, true], 'one call asked for Git, so the follow-up asks for it');
  gates[1].resolve();
  await first;
});

test('the follow-up run does not read Git when no call that waited asked for it, also when the first call did', async () => {
  const { task, calls, gates } = slowTask();
  const refresh = coalesceRefresh(task);
  const first = refresh(true);
  await refresh(false);
  await refresh(false);
  gates[0].resolve();
  await sleep(10);
  assert.deepEqual(calls, [true, false], 'the value of the first call does not carry over');
  gates[1].resolve();
  await first;
});

test('a call that waits gives its answer at once, and does not wait for the run', async () => {
  const { task, gates } = slowTask();
  const refresh = coalesceRefresh(task);
  const first = refresh(false);
  const answer = await Promise.race([refresh(true).then(() => 'answered'), sleep(100).then(() => 'still waiting')]);
  assert.equal(answer, 'answered');
  gates[0].resolve();
  await sleep(10);
  gates[1].resolve();
  await first;
});

test('the call that started the run ends after the follow-up run', async () => {
  const { task, gates } = slowTask();
  const refresh = coalesceRefresh(task);
  let ended = false;
  const first = refresh(false).then(() => (ended = true));
  await refresh(true);
  gates[0].resolve();
  await sleep(10);
  assert.equal(ended, false, 'the follow-up run is still working');
  gates[1].resolve();
  await first;
  assert.equal(ended, true);
});

test('after the runs end, the next call runs at once, and with its own value', async () => {
  const { task, calls, gates } = slowTask();
  const refresh = coalesceRefresh(task);
  const first = refresh(true);
  gates[0].resolve();
  await first;
  const second = refresh(false);
  assert.deepEqual(calls, [true, false]);
  gates[1].resolve();
  await second;
});

test('a task that fails does not block the next call, and the call that started it gets the error', async () => {
  let attempt = 0;
  const seen = [];
  const refresh = coalesceRefresh(async (readGit) => {
    seen.push(readGit);
    attempt++;
    if (attempt === 1) throw new Error('git stopped');
  });
  await assert.rejects(refresh(true), /git stopped/);
  await refresh(false);
  assert.deepEqual(seen, [true, false], 'the queue works after a failure');
});
