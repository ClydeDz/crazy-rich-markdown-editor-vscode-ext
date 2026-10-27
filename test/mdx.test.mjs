// Tests of MDX support: `import`, `export`, JSX and `{expressions}` stay exactly as they are, and show as colored code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadModule, makeEditor } from './helpers.mjs';

const { scanMdxBlock, scanMdxExpression, MDX_LABEL } = await loadModule('webview/mdx.ts', 'mdx');
const { createEditor, getMarkdown } = await loadModule('webview/editor.ts', 'editor');
const { splitFrontMatter, joinFrontMatter } = await loadModule('webview/frontMatter.ts', 'frontMatter');

const scan = (src) => scanMdxBlock(src);

// ---------- The scanner ----------

test('import and export lines make one block, up to an empty line', () => {
  assert.deepEqual(scan("import A from './a'\nimport { B } from './b'\n\n# Title\n"), {
    kind: 'esm',
    raw: "import A from './a'\nimport { B } from './b'\n",
  });
  assert.equal(scan("export const meta = { title: 'Hi' }\n\ntext").kind, 'esm');
  assert.equal(scan("import 'side-effect.css'\n").kind, 'esm');
  assert.equal(scan('import * as all from "x"').raw, 'import * as all from "x"');
});

test('an export that spans lines, also with empty lines inside its brackets, is one block', () => {
  const raw = "export const meta = {\n  title: 'Hi',\n\n  tags: ['a', 'b'],\n}\n";
  assert.equal(scan(`${raw}\nAfter`).raw, raw);
  const multi = "import {\n  A,\n  B,\n} from './x'\n";
  assert.equal(scan(multi).raw, multi);
});

test('strings, templates and comments in an export do not confuse the brackets', () => {
  const raw = "export const x = {\n  a: '}',\n  b: `}${'{'}`,\n  // }\n  c: /* } */ 1,\n}\n";
  assert.equal(scan(raw).raw, raw);
});

test('a heading under the imports is not part of them', () => {
  assert.equal(scan("import A from 'a'\n# Title\n").raw, "import A from 'a'\n");
  assert.equal(scan("import A from 'a'\nexport const b = 1\n# Title\n").raw, "import A from 'a'\nexport const b = 1\n");
});

test('an import with a bracket that never closes is not a block', () => {
  assert.equal(scan('import {\n  A,\n'), undefined);
});

test('a self-closing component is a block', () => {
  assert.deepEqual(scan('<Chart data={[1, 2, 3]} color="red" />\n\nText'), { kind: 'jsx', raw: '<Chart data={[1, 2, 3]} color="red" />\n' });
});

test('a component with children is one block, also with empty lines and markdown inside', () => {
  const raw = '<Tabs>\n\n<Tab label="One">\n\nSome **markdown** inside.\n\n</Tab>\n\n</Tabs>\n';
  assert.equal(scan(`${raw}\nafter`).raw, raw);
});

test('a greater-than sign in an attribute expression does not end the tag', () => {
  const raw = '<If test={a > b} label="x > y">\n  yes\n</If>\n';
  assert.equal(scan(raw).raw, raw);
});

test('tags of the same name nest', () => {
  const raw = '<Box>\n  <Box>inner</Box>\n  text\n</Box>\n';
  assert.equal(scan(`${raw}\nrest`).raw, raw);
});

test('a fragment is a block', () => {
  assert.deepEqual(scan('<>\n  <A />\n  <B />\n</>\n'), { kind: 'jsx', raw: '<>\n  <A />\n  <B />\n</>\n' });
});

test('code in the text of a component does not count as a tag', () => {
  const raw = '<Note>\n  Use `<div>` here.\n\n```jsx\n<Foo>\n```\n</Note>\n';
  assert.equal(scan(raw).raw, raw);
});

test('a void HTML tag inside a component needs no closing tag', () => {
  const raw = '<Card>\n  <img src="a.png">\n  <br>\n</Card>\n';
  assert.equal(scan(raw).raw, raw);
});

test('elements and expressions with no empty line between them are one block', () => {
  assert.equal(scan('<A />\n<B />\n{x}\n\nend').raw, '<A />\n<B />\n{x}\n');
});

test('an element that has text after it on its last line is a paragraph, not a block', () => {
  assert.equal(scan('<Badge>new</Badge> is shown here\n'), undefined);
  assert.equal(scan('{props.name} is the name\n'), undefined);
});

test('a component that never closes, a lower case tag and ordinary text are not blocks', () => {
  assert.equal(scan('<Foo>\n\ntext\n'), undefined);
  assert.equal(scan('<div>\n  x\n</div>\n'), undefined);
  assert.equal(scan('# Title\n'), undefined);
  assert.equal(scan('Just text\n'), undefined);
  assert.equal(scan('<Foo />x\n'), undefined);
});

test('an expression block, also with a comment or nested braces', () => {
  assert.deepEqual(scan('{/* a comment */}\n'), { kind: 'expression', raw: '{/* a comment */}\n' });
  const raw = '{items.map((i) => (\n  <li key={i}>{i}</li>\n))}\n';
  assert.equal(scan(raw).raw, raw);
  assert.equal(scan('{unclosed\n\ntext'), undefined);
});

test('an apostrophe in the text of a component is not a string', () => {
  const raw = "<Note>\n  Don't panic.\n</Note>\n";
  assert.equal(scan(raw).raw, raw);
  // Inside braces the scanner reads strings, so a lone apostrophe in JSX text must not hide the closing bracket.
  const inBraces = "{ok && <p>Don't panic</p>}\n\nAnd it's fine\n";
  assert.equal(scan(inBraces).raw, "{ok && <p>Don't panic</p>}\n");
});

test('a closing tag inside an HTML comment does not close the component', () => {
  const raw = '<Note>\n  <!-- a </Note> in a comment -->\n  text\n</Note>\n';
  assert.equal(scan(raw).raw, raw);
});

test('every MDX block has the same label, whatever it holds', () => {
  assert.equal(MDX_LABEL, 'MDX code');
});

test('an inline expression is found only when it is complete', () => {
  assert.equal(scanMdxExpression('{props.name} rest'), '{props.name}');
  assert.equal(scanMdxExpression('{a * {b: 1}.b} rest'), '{a * {b: 1}.b}');
  assert.equal(scanMdxExpression('{open'), undefined);
  assert.equal(scanMdxExpression('plain'), undefined);
});

// ---------- In the editor ----------

const blockTypes = (editor) => editor.getJSON().content.map((node) => node.type);
const SAMPLES = {
  imports: "import { Chart } from '../components/Chart'\nimport Foo from './foo.js'\nexport const meta = { title: 'Hi', tags: ['a_b', '*x*'] }\n\n# Title\n",
  callout: '# Title\n\n<Callout type="warning">\n  Be *careful* here.\n</Callout>\n\nAfter.\n',
  nested: '<Tabs>\n\n<Tab label="One">\n\nSome **markdown** inside.\n\n</Tab>\n\n</Tabs>\n',
  selfClosing: '<Chart data={[1, 2, 3]} color="red" />\n\nText.\n',
  expression: '{/* a comment */}\n\n{items.map((i) => <li key={i}>{i}</li>)}\n',
  fragment: '<>\n  <A />\n  <B />\n</>\n',
  inline: 'Hello {props.name}, {a * b * c} and {/* note */} and <Badge>new</Badge> and *italic* and $x^{2}$ end.\n',
  fenced: '```jsx\nimport a from "b"\n<Foo>\n```\n',
  list: '- import x from y\n- <Foo />\n\n> <Callout>hi</Callout>\n',
};

for (const [name, markdown] of Object.entries(SAMPLES)) {
  test(`MDX sample "${name}" comes back exactly as it was written`, () => {
    const editor = makeEditor(createEditor, markdown, { mdx: true });
    assert.equal(getMarkdown(editor).trim(), markdown.trim());
    editor.destroy();
  });
}

test('in an MDX file, imports, components and expressions become blocks that the editor keeps', () => {
  const editor = makeEditor(createEditor, SAMPLES.imports, { mdx: true });
  assert.deepEqual(blockTypes(editor).slice(0, 2), ['mdxBlock', 'heading']);
  editor.destroy();
  const component = makeEditor(createEditor, SAMPLES.callout, { mdx: true });
  assert.deepEqual(blockTypes(component).slice(0, 3), ['heading', 'mdxBlock', 'paragraph']);
  component.destroy();
  const expression = makeEditor(createEditor, SAMPLES.expression, { mdx: true });
  assert.deepEqual(blockTypes(expression).slice(0, 2), ['mdxBlock', 'mdxBlock']);
  expression.destroy();
});

test('a component with empty lines inside is one block, not many small ones', () => {
  const editor = makeEditor(createEditor, SAMPLES.nested, { mdx: true });
  assert.equal(blockTypes(editor).filter((type) => type === 'mdxBlock').length, 1);
  assert.equal(blockTypes(editor).filter((type) => type === 'htmlBlock').length, 0);
  editor.destroy();
});

test('an expression in a line of text is a small piece that the editor keeps, and the text around it keeps its format', () => {
  const editor = makeEditor(createEditor, SAMPLES.inline, { mdx: true });
  const raws = [];
  const marks = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mdxInline') raws.push(node.attrs.raw);
    if (node.isText && node.marks.some((mark) => mark.type.name === 'italic')) marks.push(node.text);
  });
  assert.deepEqual(raws, ['{props.name}', '{a * b * c}', '{/* note */}']);
  assert.deepEqual(marks, ['italic'], 'only the real *italic* is italic');
  editor.destroy();
});

test('front matter and the MDX under it both come back as they were written', () => {
  const file = "---\ntitle: Doc\ntags: [a, b]\n---\n\nimport Foo from './foo'\n\n# Title\n\n<Foo bar={1} />\n\nText with {props.x}.\n";
  const { yaml, body } = splitFrontMatter(file);
  assert.equal(yaml, 'title: Doc\ntags: [a, b]');
  const editor = makeEditor(createEditor, body, { mdx: true });
  assert.equal(joinFrontMatter(yaml, `\n${getMarkdown(editor).replace(/\s+$/, '')}`) + '\n', file);
  editor.destroy();
});

test('a file that is not MDX is read as before: no MDX blocks, and the file is not changed in a new way', () => {
  const editor = makeEditor(createEditor, SAMPLES.callout);
  assert.ok(!blockTypes(editor).includes('mdxBlock'));
  editor.destroy();
  const plain = makeEditor(createEditor, "import A from 'a'\n\ntext {x}\n");
  assert.ok(!JSON.stringify(plain.getJSON()).includes('mdx'));
  plain.destroy();
});

test('editing an MDX block changes the text of the file in that place only', () => {
  const editor = makeEditor(createEditor, SAMPLES.callout, { mdx: true });
  let place;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'mdxBlock') place = pos;
  });
  editor.view.dispatch(editor.state.tr.setNodeMarkup(place, undefined, { raw: '<Callout type="info">\n  New.\n</Callout>' }));
  assert.equal(getMarkdown(editor).trim(), '# Title\n\n<Callout type="info">\n  New.\n</Callout>\n\nAfter.');
  editor.destroy();
});

test('the block shows its label and its text with the colors of JSX', () => {
  const editor = makeEditor(createEditor, SAMPLES.callout, { mdx: true });
  const dom = editor.view.dom.querySelector('.rme-raw');
  assert.equal(dom.querySelector('.rme-raw-label').textContent, 'MDX code');
  const area = dom.querySelector('textarea');
  assert.equal(area.value, '<Callout type="warning">\n  Be *careful* here.\n</Callout>');
  const colors = dom.querySelector('.rme-raw-colors code');
  assert.ok(colors.querySelector('[class^="hljs-"]'), 'the text has colors');
  assert.equal(colors.textContent.trimEnd(), area.value, 'the colored copy has the same text');
  assert.equal(colors.parentElement.getAttribute('aria-hidden'), 'true');
  editor.destroy();
});

test('typing in the text box of the block changes the colors and the file, and the label stays', () => {
  const editor = makeEditor(createEditor, '<Foo />\n', { mdx: true });
  const dom = editor.view.dom.querySelector('.rme-raw');
  const area = dom.querySelector('textarea');
  area.value = '<Bar x="1" />';
  area.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(dom.querySelector('.rme-raw-label').textContent, 'MDX code', 'the label does not change with the text');
  assert.ok(dom.querySelector('.rme-raw-colors code').textContent.startsWith('<Bar x="1" />'));
  assert.equal(getMarkdown(editor).trim(), '<Bar x="1" />');
  editor.destroy();
});

test('HTML blocks keep their label and have no colors', () => {
  const editor = makeEditor(createEditor, '<details>\n<summary>x</summary>\n</details>\n');
  const dom = editor.view.dom.querySelector('.rme-raw');
  assert.equal(dom.querySelector('.rme-raw-label').textContent, 'HTML');
  assert.equal(dom.querySelector('.rme-raw-colors'), null);
  editor.destroy();
});

// ---------- The package ----------

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

test('MDX files open in the editor only through "Open With", and Markdown files keep the default', () => {
  const editors = manifest.contributes.customEditors;
  const markdown = editors.find((editor) => editor.viewType === 'richMarkdown.editor');
  const mdx = editors.find((editor) => editor.viewType === 'richMarkdown.mdxEditor');
  assert.equal(markdown.priority, 'default');
  assert.deepEqual(markdown.selector.map((entry) => entry.filenamePattern), ['*.md', '*.markdown']);
  assert.equal(mdx.priority, 'option');
  assert.deepEqual(mdx.selector.map((entry) => entry.filenamePattern), ['*.mdx']);
  assert.equal(markdown.displayName, 'Markdown Editor');
  assert.equal(mdx.displayName, 'MDX Editor');
});

test('the title buttons work for both editors and for MDX files', () => {
  const menus = manifest.contributes.menus;
  const source = menus['editor/title'].find((item) => item.command === 'richMarkdown.openSource');
  const rich = menus['editor/title'].find((item) => item.command === 'richMarkdown.openRich');
  assert.match(source.when, /richMarkdown/);
  assert.ok(!source.when.includes('== richMarkdown.editor'), 'not only the Markdown editor');
  assert.match(rich.when, /resourceExtname == \.mdx/);
  assert.match(menus['explorer/context'][0].when, /\.mdx/);
});
