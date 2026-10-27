---
name: create-pr
description: Open a draft pull request for the current branch. Run the checks, fill in the pull request template with the real results, show the title and body to the user, and create the draft with gh after the user agrees. Use only when the user asks for a pull request.
disable-model-invocation: true
---

# Create a pull request

The template is `.github/pull_request_template.md`. Its checklist is the list of checks that every change must pass. Fill it with facts, not hopes.

**This project folder has no Git repository, on purpose.** Never run `git init` here. A pull request needs a repository, so do step 1 first.

## Steps

1. Find out where you are: `git rev-parse --is-inside-work-tree`.
   - **No repository** (this folder): do not run Git commands that make one. Do steps 3 to 5 and write the title and the body to `pr-description.md` in the scratchpad folder. Tell the user that there is no repository here, and give them the path. Ask whether they want to open the pull request from their other repository. Stop there.
   - **A repository** (for example the user's other repo with a copy of this code): go on.
2. Check the branch and the base:
   - `git branch --show-current` must not be the default branch. If it is, ask the user for a branch name, and create it.
   - Find the default branch: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`.
   - Read what changes: `git status`, `git diff <base>...HEAD --stat` and the diff itself. If there is nothing to send, say so and stop.
3. Run the checks. Run them for real and keep the output:
   - `yarn typecheck`
   - `yarn test` (note the number of tests that passed)
   - `yarn test:vscode` when the change touches `src/`, the real webview, keys or focus. It is slow. If you skip it, say why. CI does not run it on a pull request (only on `main`), so this local run is the only check before the merge.
   - `yarn package` and check that the file count is 30. Remove the new `.vsix` if the user did not ask for it.
   If a check fails, stop. Show the failure. Do not open a pull request with a failing check.
4. Fill the template from `.github/pull_request_template.md`:
   - Write **What and why** and **Changes** from the diff, in short plain sentences. Do not copy commit messages without reading them.
   - Tick a box **only** if you ran that check in this turn and it passed, or if you can show it from the diff (for example "no UI change"). Leave other boxes open and explain in **Not done or not checked**.
   - For "every new or changed test failed when I broke the code": tick it only if the `prove-test-fails` steps were done for each test in the diff. If not, do them now or leave the box open.
   - Never remove the checklist. Never tick a box to make the description look better.
   - Delete the Screenshots section if there is no UI change.
5. Write the title as `Taxonomy: Short title`, with the taxonomy `Feat`, `Fix`, `Chore`, `Docs` or `Test`. If there is a ticket, use `[TICKET] Taxonomy: Short title`. Keep it under 70 characters.
   End the body with this line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
6. **Show the title and the full body to the user and ask for approval.** A pull request is public and cannot be fully taken back. Do not create it before the user says yes.
7. After approval:
   - Push the branch: `git push -u origin <branch>`.
   - Create a **draft**: `gh pr create --draft --base <base> --title "<title>" --body-file <file>`
   - Never mark it ready for review. Never enable auto-merge, unless the user asks.
8. Report the pull request link, which boxes are ticked, and which are open.

## Rules

- Do not commit for the user unless they ask. If there are uncommitted changes, ask first, and then make the commit message end with the attribution line that the session gives.
- Do not push to the default branch.
- Use Yarn, never npm.
- Do not put secrets, tokens or the user's email in the description.
