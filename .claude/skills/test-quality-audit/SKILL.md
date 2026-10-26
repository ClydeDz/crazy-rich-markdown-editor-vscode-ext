---
name: test-quality-audit
description: Check how good the tests are with the mutation tool (yarn mutate). The tool breaks the code on purpose and checks that a test fails. Use after a new feature or a big change, to find code that no test protects. This audits the tests, not the product.
---

# Test quality audit (mutation check)

`yarn mutate` (`scripts/mutation-check.mjs`) makes small breaks in the code, one at a time, in copies in the temporary folder. It never touches the project. After each break it runs the tests.

- A test fails: the break is **killed**. The tests protect that code.
- All tests pass: the break **survived**. Either the tests have a gap, or the break does not change what the code does.

## Steps

1. Make sure the tests pass first: `yarn test`. A failing suite kills every break and tells you nothing.
2. If you added a file in `webview/`, `src/` or `scripts/`, add it to `AUTO_FILES` in `scripts/mutations.mjs`. Random breaks only go into the files of that list.
3. Add hand-made breaks for the new behavior in `HAND_MUTANTS` in the same file. A hand-made break turns one behavior off on purpose, for example a key handler or a menu item. Each one needs:
   - `id`, `suite` (`unit` or `vscode`), `file`, `why` (what it breaks).
   - `find`: exact text that occurs **once** in the file. The tool refuses a text that occurs twice.
   - `replace`: the broken text. It must keep the syntax valid.
4. Run the audit. A full run is long, so start it in the background and read the report when it ends:
   - Your new files only: `yarn mutate --only webview/yourFile.ts,your-hand-id`
   - Hand-made breaks only: `yarn mutate --hand-only`
   - A list without a run: `yarn mutate --list`
   - Keep the defaults for jobs (3 for unit). A higher number makes the machine slow and causes false timeouts.
   - `--suite vscode` runs the real VS Code tests for each break. It is slow. Use it only for hand-made breaks with `suite: "vscode"`.
5. Read the survivors in the output (or the JSON report in the temporary folder: `rme-mutation-report.json`). Look at each survivor and decide:
   - **A gap in the tests:** write a test that fails with the break. Run the break again to see it killed.
   - **No test can tell the difference** (the break does not change the behavior, for example a check that the code makes twice): do not write a test. Add `accepted: "<reason>"` to a hand-made break, or add a line with the reason to the list of known survivors at the top of `scripts/mutations.mjs`.
6. Run `yarn test` again.

## Report

Say in short sentences:
- How many breaks ran, how many were killed, how many survived.
- For each survivor: a gap (and the test you added) or accepted (and the reason).
- Which suite you ran. Say if you did not run the VS Code suite.

## Rules

- Do not write a test only to kill a break that cannot change the behavior.
- Do not run the whole audit in the foreground. It can take longer than the tool timeout.
- The tool changes only copies in the temporary folder. The project files stay as they are. If a run is stopped, nothing in the project needs a repair.
