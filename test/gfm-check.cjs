// The rules that read an editor and count what is in it.
// The Node test and the test in the real VS Code webview use these same rules.
// The two sources are plain function text, so the VS Code test can put them in the page of the webview.

const COUNT_SOURCE = `(json) => {
  const nodes = {};
  const marks = {};
  const walk = (node) => {
    if (node.type && node.type !== 'doc' && node.type !== 'text' && node.type !== 'paragraph') {
      nodes[node.type] = (nodes[node.type] ?? 0) + 1;
    }
    for (const mark of node.marks ?? []) {
      marks[mark.type] = (marks[mark.type] ?? 0) + 1;
    }
    (node.content ?? []).forEach(walk);
  };
  walk(json);
  return { nodes, marks };
}`;

const READ_DOM_SOURCE = `(root, expect) => {
  const read = (selector, of) =>
    [...root.querySelectorAll(selector)].map((el) => (of === 'text' ? el.textContent : el.getAttribute(of)));
  const dom = {};
  for (const selector of Object.keys(expect.dom ?? {})) {
    dom[selector] = root.querySelectorAll(selector).length;
  }
  const values = (expect.values ?? []).map((spec) => read(spec.selector, spec.of));
  return { dom, values };
}`;

module.exports = {
  COUNT_SOURCE,
  READ_DOM_SOURCE,
  countDocument: new Function(`return ${COUNT_SOURCE}`)(),
  readDom: new Function(`return ${READ_DOM_SOURCE}`)(),
};
