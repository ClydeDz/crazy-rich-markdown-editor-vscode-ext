# Decisions that are final

Do not reopen these. Do not ask again.

- **Menu name.** `displayName` is `Built-in`, so the editor dropdown shows one name. VS Code drops the extension name only when it is exactly `Built-in`. The product name is "Crazy Rich Markdown Editor". The real name is the first words of the `description`. `yarn menu:named` and `yarn menu:single` switch the style only when the user asks. Open question for the user, not for you: the Marketplace listing would show `Built-in`.
- **IDs do not change.** Package `rich-markdown-editor` (id `clydedsouza.crazy-rich-markdown-editor`), viewType `richMarkdown.editor`, commands and settings `richMarkdown.*`. A new id would orphan saved settings and the editor association.
- **No Git in this folder.** The user tests Git features in another repository. After a Git test, `ls -d .git` here must still fail.
- **GitHub page examples** (the "Basic writing and formatting syntax" page) are fetched at run time by `scripts/github-page-extract.mjs`. Tests skip when offline. The user may save a copy with `yarn check:github-page --out test/fixtures/github-page-examples.json`. Do not store the page text yourself. The 24 sections in `test/fixtures/gfm-sections.json` are self-written.
- **Yarn, not npm.**
- **MDX.** An `.mdx` file opens through "Open With" (view type `richMarkdown.mdxEditor`, priority `option`). It does not open by default, so `.md` files and the user's setup do not change. Every MDX box has the one label `MDX code`: the editor does not tell an import from a component from an expression. The editor does not draw components and does not check the code, because a component needs the project's own code and packages. The slash item **MDX code** adds an empty box that the user fills. The rule is the round trip: the file must come back as it was written.
