---
name: release
description: Release the extension locally. Bump the version, run the tests, package the .vsix with yarn and install it in the local VS Code. Use when the user says to bump, package or install a new version. This does not publish to the Marketplace.
disable-model-invocation: true
argument-hint: "[patch | minor | major | x.y.z]"
---

# Local release

This skill puts a new version in the local VS Code. It never publishes to the Marketplace (see `docs/packaging.md` for that).

The argument is the new version, or `patch`, `minor` or `major`. When the user gives none, use `patch` for a fix and `minor` for a new feature, and say which one you chose.

## Steps

1. Read the current `version` in `package.json`. Work out the new version.
2. Replace the old version with the new one in `package.json` and in `README.md`. The README has the `.vsix` name in its install steps. Use `sed -i '' 's/<old>/<new>/g'` and check that both files changed.
3. Run `yarn test`. If a test fails, stop. Show the failure. Do not package.
4. Run `yarn package`. It must print `Packaged: ...rich-markdown-editor-<new>.vsix`. The file count must stay at 30. A higher count means a new file is in the package: check `.vscodeignore`.
5. Install it:
   `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension rich-markdown-editor-<new>.vsix --force`
   The output must say `successfully installed`.
6. Check the install: `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --list-extensions --show-versions | grep rich-markdown`

## Report

Tell the user, in short sentences:
- The new version is built and installed.
- They must run **Developer: Reload Window** in VS Code. An old window keeps the old editor.
- How many unit tests passed. Say if you did not run `yarn test:vscode`.
- Nothing is committed, because this folder has no Git repository.

## Rules

- Use Yarn, never npm.
- Never run `git init`.
- Do not delete the older `.vsix` files unless the user asks.
- If the change touched code that talks to VS Code, suggest `yarn test:vscode` before the release.
