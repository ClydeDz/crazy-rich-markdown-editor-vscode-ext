---
name: prove-test-fails
description: Use whenever you write a new test or change an existing test (test/*.test.mjs, test/vscode/suite.cjs). Before you call the test done, break the code it covers on purpose and confirm that the test fails for the right reason, then restore the code. A test that has never failed has not been shown to test anything.
---

# Prove that the test can fail

A test that passes is not enough. A test can pass because it checks nothing: a wrong selector, an assertion that is always true, a stale value, or code that never runs. The only proof is to break the code and watch the test fail.

Do this every time you add a test or change what a test checks. Do it before you tell the user that the test is done.

## Steps

1. Write or change the test. Run it alone and see it pass:
   `node --test test/<file>.test.mjs --test-name-pattern="<part of the name>"`
   (A VS Code test runs with `RME_ONLY="<part of the name>" yarn test:vscode`.)
2. Choose a **small break** in the code that the test covers. It must break the exact behavior the test name claims. Examples: turn off the handler, return the wrong value, flip a condition, delete the line that does the work. Do not break something the test does not claim.
3. Save a copy of the file first. This folder has no Git, so a broken file has no undo.
   `cp <file> "$TMPDIR/<name>.orig"` (or use the scratchpad folder)
4. Make the break with Edit. Keep it to one place.
5. Run the same test again. It must **fail**.
6. Read the failure. It must fail for the right reason: your assertion, with a message that matches the break.
   - Good: `AssertionError: Tab types a tab`.
   - Not good: a timeout, a syntax error, `createEditor is not a function`, a missing element, or a crash before the assertion. The test then did not prove the behavior. Fix the break or the test, and run again.
7. **Restore the file at once.** Copy the saved copy back, and check that it is exact:
   `cp "$TMPDIR/<name>.orig" <file> && cmp "$TMPDIR/<name>.orig" <file>`
   Never leave a break in the code. Never end a turn with a broken file.
8. Run the test again. It must pass.
9. If the test claims more than one behavior, repeat with a different break for each claim. One break proves one claim.

## When the test does not fail

The break survived. That means one of these:
- The test does not check what its name says. Fix the assertion, and repeat from step 4.
- The break does not change the behavior (for example a check that the code makes twice). Choose a break that does.
- The code under test is not reached. Check that the test sets up the state it needs (the selection, the document, the focus).

Do not keep a test that you cannot make fail.

## Edited tests

When you change an existing test, break the code in the way the old test caught, and confirm the changed test still fails. A change that loosens an assertion can make a test pass for a break that it caught before.

## Notes

- `loadModule` in `test/helpers.mjs` bundles the sources when the test runs, so a break in `webview/*.ts` takes effect at once. You do not need `yarn build`. A real VS Code test does need the build, and `yarn test:vscode` does it.
- For a break you want to keep as a regression check, add it to `HAND_MUTANTS` in `scripts/mutations.mjs` (see the `test-quality-audit` skill).
- Do not use this skill for the whole suite. For that, run `yarn mutate`.

## Report

For each test, say in one line: the break you made, and the failure message that you saw. For example: "Broke `Tab` in `webview/codeBlock.ts` (returned false). The test failed with 'Tab types a tab'. I restored the file and the test passes."
If you could not make a test fail, say so and say why.
