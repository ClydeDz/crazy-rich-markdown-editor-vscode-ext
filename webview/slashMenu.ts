import { Editor, Extension, Range } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { ALERT_TITLES, ALERT_TYPES } from './alert';
import { icons } from './icons';
import { focusEmptyMdxBlock } from './mdx';
import { createSuggestionRenderer } from './suggestionMenu';

interface SlashItem {
  title: string;
  description: string;
  keywords: string;
  icon: string;
  run: (editor: Editor, range: Range) => void;
  /** The menu shows the item only while this gives true. An item without it always shows. */
  available?: () => boolean;
}

export interface SlashMenuOptions {
  /** Ask the extension host to pick image and video files. */
  onPickMedia: () => void;
  /**
   * The front matter item. A file has at most one front matter block, and it is always at the top of the file.
   * The item shows only while `hasFrontMatter` gives false, and `onAddFrontMatter` adds the block.
   * Without both, the menu has no front matter item.
   */
  /** True for an `.mdx` file. The menu then has the item **MDX code**. */
  mdx?: boolean;
  hasFrontMatter?: () => boolean;
  onAddFrontMatter?: () => void;
}

function createItems(options: SlashMenuOptions): SlashItem[] {
  const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);
  return [
    {
      title: 'Heading 1',
      description: 'Large section heading',
      keywords: 'h1 title',
      icon: 'H1',
      run: (e, r) => chain(e, r).setNode('heading', { level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      keywords: 'h2 subtitle',
      icon: 'H2',
      run: (e, r) => chain(e, r).setNode('heading', { level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      keywords: 'h3',
      icon: 'H3',
      run: (e, r) => chain(e, r).setNode('heading', { level: 3 }).run(),
    },
    {
      title: 'Bulleted list',
      description: 'Simple list of points',
      keywords: 'ul unordered bullet',
      icon: icons.bulletList,
      run: (e, r) => chain(e, r).toggleBulletList().run(),
    },
    {
      title: 'Numbered list',
      description: 'List with numbers',
      keywords: 'ol ordered number',
      icon: icons.orderedList,
      run: (e, r) => chain(e, r).toggleOrderedList().run(),
    },
    {
      title: 'Task list',
      description: 'List with check boxes',
      keywords: 'todo checkbox checklist',
      icon: icons.taskList,
      run: (e, r) => chain(e, r).toggleTaskList().run(),
    },
    {
      title: 'Quote',
      description: 'Highlight a quotation',
      keywords: 'blockquote cite',
      icon: icons.quote,
      run: (e, r) => chain(e, r).toggleBlockquote().run(),
    },
    ...ALERT_TYPES.map((type): SlashItem => ({
      title: `${ALERT_TITLES[type]} alert`,
      description: 'Colored box that stands out from the text',
      keywords: `callout admonition ${type}`,
      icon: {
        note: icons.alertNote,
        tip: icons.alertTip,
        important: icons.alertImportant,
        warning: icons.alertWarning,
        caution: icons.alertCaution,
      }[type],
      run: (e, r) => chain(e, r).setAlert(type).run(),
    })),
    {
      title: 'Code block',
      description: 'Block of code',
      keywords: 'pre snippet fence',
      icon: icons.codeBlock,
      run: (e, r) => chain(e, r).toggleCodeBlock().run(),
    },
    {
      title: 'Table',
      description: 'Grid with rows and columns',
      keywords: 'grid rows columns',
      icon: icons.table,
      run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: 'Math block',
      description: 'A formula in TeX, drawn with KaTeX',
      keywords: 'latex tex formula equation katex',
      icon: icons.math,
      run: (e, r) => chain(e, r).insertMathBlock().run(),
    },
    {
      title: 'Diagram',
      description: 'A mermaid diagram that is drawn from text',
      keywords: 'mermaid flowchart sequence chart graph',
      icon: icons.diagram,
      run: (e, r) =>
        chain(e, r)
          .insertContent({
            type: 'codeBlock',
            attrs: { language: 'mermaid' },
            content: [{ type: 'text', text: 'graph TD\n  A[Start] --> B[Done]' }],
          })
          .run(),
    },
    {
      title: 'Footnote',
      description: 'A numbered note at the end of the document',
      keywords: 'note reference citation',
      icon: icons.footnote,
      run: (e, r) => chain(e, r).insertFootnote().run(),
    },
    {
      title: 'Divider',
      description: 'Horizontal rule',
      keywords: 'hr line rule separator',
      icon: icons.divider,
      run: (e, r) => chain(e, r).setHorizontalRule().run(),
    },
    {
      title: 'Image or video',
      description: 'Copy a file next to the document',
      keywords: 'picture photo file movie media asset upload',
      icon: icons.image,
      run: (e, r) => {
        chain(e, r).run();
        options.onPickMedia();
      },
    },
    ...(options.mdx
      ? [
          {
            title: 'MDX code',
            description: 'A component, import or expression that you write',
            keywords: 'mdx jsx component react import export expression',
            icon: icons.codeBlock,
            run: (e: Editor, r: Range) => {
              chain(e, r)
                .insertContent({ type: 'mdxBlock', attrs: { raw: '' } })
                .run();
              focusEmptyMdxBlock(e);
            },
          },
        ]
      : []),
    ...(options.onAddFrontMatter
      ? [
          {
            title: 'Front matter',
            description: 'YAML block at the top of the file',
            keywords: 'yaml metadata header frontmatter',
            icon: icons.frontMatter,
            available: () => !options.hasFrontMatter?.(),
            run: (e: Editor, r: Range) => {
              chain(e, r).run();
              options.onAddFrontMatter?.();
            },
          },
        ]
      : []),
  ];
}

/** A menu that opens when the user types `/` at the start of a line. */
export function createSlashMenu(options: SlashMenuOptions): Extension {
  const allItems = createItems(options);

  return Extension.create({
    name: 'rmeSlashMenu',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          editor: this.editor,
          pluginKey: new PluginKey('rmeSlashMenu'),
          char: '/',
          startOfLine: true,
          allowSpaces: false,
          items: ({ query }) => {
            const q = query.trim().toLowerCase();
            const items = allItems.filter((item) => item.available?.() ?? true);
            if (!q) {
              return items;
            }
            return items.filter((item) => `${item.title} ${item.keywords}`.toLowerCase().includes(q));
          },
          command: ({ editor, range, props }) => props.run(editor, range),
          render: createSuggestionRenderer<SlashItem>({
            describe: (item) => ({ icon: item.icon, title: item.title, description: item.description }),
          }),
        }),
      ];
    },
  });
}
