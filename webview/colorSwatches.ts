import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseNode } from '@tiptap/pm/model';

/** The color forms that GitHub shows with a swatch: `#RRGGBB`, `rgb(R,G,B)` and `hsl(H,S,L)`. */
const COLOR =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|hsl\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\))$/i;

export function isColor(text: string): boolean {
  return COLOR.test(text.trim());
}

function buildDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text && node.marks.some((mark) => mark.type.name === 'code') && isColor(node.text)) {
      const color = node.text.trim();
      decorations.push(
        Decoration.widget(
          pos,
          () => {
            const swatch = document.createElement('span');
            swatch.className = 'rme-swatch';
            swatch.style.backgroundColor = color;
            swatch.setAttribute('aria-hidden', 'true');
            return swatch;
          },
          { side: -1, key: `swatch-${pos}-${color}`, ignoreSelection: true },
        ),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

const key = new PluginKey<DecorationSet>('rmeColorSwatches');

/** Inline code that holds a color, for example `#0969DA`, shows a small swatch of that color. */
export const ColorSwatches = Extension.create({
  name: 'rmeColorSwatches',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});
