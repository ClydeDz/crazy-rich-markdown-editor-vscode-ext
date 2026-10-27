# Decisions that are final

Do not reopen these. Do not ask again.

- **Menu name.** The extension `displayName` is "Crazy Rich Markdown Editor", and the custom editors are named "Markdown Editor" and "MDX Editor". VS Code shows the editor name followed by the extension name in the dropdown, for example "Markdown Editor - Crazy Rich Markdown Editor". `yarn menu:named` and `yarn menu:single` switch the style only when the user asks.
- **Package and view type IDs do not change.** Package `crazy-rich-markdown-editor` (id `clydedsouza.crazy-rich-markdown-editor`) and view types `crazyRichMarkdown.editor` and `crazyRichMarkdown.mdxEditor` stay stable. Commands and settings use the `crazyRichMarkdown.*` prefix. Existing settings using `richMarkdown.*` must be renamed in user or workspace settings.
- **This folder is a Git repository.** Run Git tests with temporary repositories under the test workspace; do not make test repositories in the project root.
- **GitHub page examples** (the "Basic writing and formatting syntax" page) are fetched at run time by `scripts/github-page-extract.mjs`. Tests skip when offline. The user may save a copy with `yarn check:github-page --out test/fixtures/github-page-examples.json`. Do not store the page text yourself. The 24 sections in `test/fixtures/gfm-sections.json` are self-written.
- **Yarn, not npm.**
- **MDX.** An `.mdx` file opens through "Open With" (view type `crazyRichMarkdown.mdxEditor`, priority `option`). It does not open by default, so `.md` files and the user's setup do not change. Every MDX box has the one label `MDX code`: the editor does not tell an import from a component from an expression. The editor does not draw components and does not check the code, because a component needs the project's own code and packages. The slash item **MDX code** adds an empty box that the user fills. The rule is the round trip: the file must come back as it was written.
