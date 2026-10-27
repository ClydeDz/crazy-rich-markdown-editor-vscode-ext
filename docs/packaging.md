# Packaging and publishing

## Yarn

- Yarn 1 (`packageManager: yarn@1.22.22`). Never run npm here and never create `package-lock.json`.
- The project `.npmrc` and `.yarnrc` pin `https://registry.yarnpkg.com`, so `yarn.lock` names only the public registry. Do not delete them.
- To install through a mirror once: `yarn install --registry <address>`.
- `test/yarn.test.mjs` guards this: no npm command, only public `resolved` URLs, the lockfile covers `package.json`, and `yarn check --integrity` passes.
- The warning "Workspaces can only be enabled in private projects" comes from the global Yarn settings, not from this project.

## Release and install (local)

1. Change `version` in `package.json`. Change the `.vsix` name in the README install steps.
2. `yarn test`
3. `yarn package` makes `rich-markdown-editor-<version>.vsix`. It runs `vscode:prepublish`, which builds in production mode.
4. `code` is not on the PATH. Install with:
   `"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension <vsix> --force`
5. Run **Developer: Reload Window** in VS Code. An old window can keep the older editor.

## Marketplace and GitHub release

- Set `publisher` in `package.json` to the ID of your Marketplace publisher, and set the `VSCE_PAT` repository secret.
- `.github/workflows/test.yml` runs the tests (unit on every pull request and on `main`, real VS Code on `main`). `.github/workflows/publish.yml` publishes new versions from `main` to the Marketplace, then creates a `v<version>` GitHub release with the VSIX. The publish job needs the repository's `contents: write` permission for the release.
- `yarn check:publish` checks the package. The README must have no relative file links.
- Placeholder links `creatorUrl` and `coffeeUrl` in `webview/about.ts` are for the user to change. An empty address hides the link.
