import { Extension } from '@tiptap/core';
import type { Node as ProseNode } from '@tiptap/pm/model';
import { NodeSelection, Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { icons } from './icons';

export interface BlockAt {
  /** Where the block starts in the document. */
  pos: number;
  node: ProseNode;
  dom: HTMLElement;
}

/**
 * The top level block at a height on the screen. A gap between two blocks belongs to the block above it.
 * It gives `undefined` above the first block and below the last one.
 */
export function blockAtHeight(view: EditorView, clientY: number): BlockAt | undefined {
  let found: BlockAt | undefined;
  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset);
    if (found || !(dom instanceof HTMLElement)) {
      return;
    }
    const rect = dom.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(dom).marginBottom) || 0;
    if (clientY >= rect.top && clientY < rect.bottom + margin) {
      found = { pos: offset, node, dom };
    }
  });
  return found;
}

/** Delete the top level block that starts at `pos`. An empty document keeps one empty paragraph. */
export function deleteBlock(view: EditorView, pos: number): void {
  const node = view.state.doc.nodeAt(pos);
  if (node) {
    view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
    view.focus();
  }
}

/**
 * Where a dragged block lands: between two top level blocks, above or below the block under the pointer
 * (the half of the block that the pointer is in). A drop never goes inside a list or a quote.
 */
export function dropPosition(view: EditorView, clientY: number): { pos: number; top: number } {
  const host = view.dom.parentElement ?? view.dom;
  const hostTop = host.getBoundingClientRect().top;
  const block = blockAtHeight(view, clientY);
  const { doc } = view.state;
  if (!block) {
    const first = doc.firstChild ? view.nodeDOM(0) : null;
    if (first instanceof HTMLElement && clientY < first.getBoundingClientRect().top) {
      return { pos: 0, top: first.getBoundingClientRect().top - hostTop };
    }
    const last = doc.lastChild ? view.nodeDOM(doc.content.size - doc.lastChild.nodeSize) : null;
    return { pos: doc.content.size, top: last instanceof HTMLElement ? last.getBoundingClientRect().bottom - hostTop : 0 };
  }
  const rect = block.dom.getBoundingClientRect();
  if (clientY < rect.top + rect.height / 2) {
    return { pos: block.pos, top: rect.top - hostTop };
  }
  return { pos: block.pos + block.node.nodeSize, top: rect.bottom - hostTop };
}

/** How long the handle stays after the pointer leaves the editor, so that the pointer can reach it. */
const LEAVE_DELAY_MS = 250;

/** The blocks that the grip drags. */
const dragged = new WeakSet<object>();

function button(className: string, label: string, icon: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `rme-block-handle-button ${className}`;
  element.title = label;
  element.setAttribute('aria-label', label);
  element.innerHTML = icon;
  // A click must not move the cursor out of the text.
  element.addEventListener('mousedown', (event) => {
    if (className !== 'rme-block-grip') {
      event.preventDefault();
    }
  });
  return element;
}

/**
 * A grip and a trash button to the left of the block under the pointer.
 * - Drag the grip to move the block. The cursor line of the editor shows the new place.
 * - Click the grip to select the block.
 * - Click the trash button to delete the block.
 * It works on blocks at the top level: a paragraph, a heading, a whole list, a quote, a code block, a table.
 */
export const BlockHandle = Extension.create({
  name: 'rmeBlockHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // A block that the grip drags lands between two top level blocks, where the drop line shows.
          handleDrop: (view, event) => {
            const slice = view.dragging?.slice;
            if (!slice || !dragged.has(slice) || !(view.state.selection instanceof NodeSelection)) {
              return false;
            }
            event.preventDefault();
            const { from, to, node } = view.state.selection;
            const target = dropPosition(view, event.clientY).pos;
            if (target !== from && target !== to) {
              const tr = view.state.tr.delete(from, to);
              const at = tr.mapping.map(target);
              tr.insert(at, node);
              view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView());
            }
            return true;
          },
        },
        view: (view) => {
          const host = view.dom.parentElement;
          if (!host) {
            return {};
          }
          const handle = document.createElement('div');
          handle.className = 'rme-block-handle';
          handle.contentEditable = 'false';
          handle.hidden = true;
          const grip = button('rme-block-grip', 'Drag to move the block', icons.grip);
          grip.draggable = true;
          const trash = button('rme-block-trash', 'Delete the block', icons.trash);
          handle.append(grip, trash);
          const dropLine = document.createElement('div');
          dropLine.className = 'rme-block-drop-line';
          dropLine.hidden = true;
          host.append(handle, dropLine);

          let current: BlockAt | undefined;
          let dragging = false;
          let frame = 0;

          const hide = (): void => {
            if (!dragging) {
              handle.hidden = true;
              current = undefined;
            }
          };
          const show = (block: BlockAt): void => {
            current = block;
            const hostRect = host.getBoundingClientRect();
            handle.style.top = `${block.dom.getBoundingClientRect().top - hostRect.top}px`;
            handle.hidden = false;
          };
          const onMove = (event: MouseEvent): void => {
            if (dragging || handle.contains(event.target as globalThis.Node)) {
              return;
            }
            const { clientY } = event;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              const block = blockAtHeight(view, clientY);
              if (!block) {
                hide();
              } else if (block.pos !== current?.pos || block.dom !== current.dom) {
                show(block);
              }
            });
          };

          const hideDropLine = (): void => {
            dropLine.hidden = true;
          };
          const onDragOver = (event: DragEvent): void => {
            if (dragging) {
              dropLine.style.top = `${dropPosition(view, event.clientY).top}px`;
              dropLine.hidden = false;
            }
          };
          host.addEventListener('dragover', onDragOver);
          host.addEventListener('dragleave', (event) => {
            if (!host.contains(event.relatedTarget as globalThis.Node | null)) {
              hideDropLine();
            }
          });
          host.addEventListener('drop', hideDropLine);

          host.addEventListener('mousemove', onMove);
          // The handle sits outside the text, so the pointer can leave the editor for a moment on its way to the handle.
          // A short wait lets it arrive. Entering the editor or the handle cancels the wait.
          let leaveTimer = 0;
          const cancelLeave = (): void => window.clearTimeout(leaveTimer);
          const onLeave = (): void => {
            cancelLeave();
            leaveTimer = window.setTimeout(hide, LEAVE_DELAY_MS);
          };
          host.addEventListener('mouseleave', onLeave);
          host.addEventListener('mouseenter', cancelLeave);
          handle.addEventListener('mouseenter', cancelLeave);
          handle.addEventListener('mouseleave', onLeave);
          // Typing hides the handle, so that it does not cover the text.
          view.dom.addEventListener('keydown', hide);

          grip.addEventListener('click', () => {
            if (current) {
              view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, current.pos)));
              view.focus();
            }
          });
          trash.addEventListener('click', () => {
            if (current) {
              const { pos } = current;
              hide();
              deleteBlock(view, pos);
            }
          });
          grip.addEventListener('dragstart', (event) => {
            if (!current || !event.dataTransfer) {
              event.preventDefault();
              return;
            }
            dragging = true;
            const selection = NodeSelection.create(view.state.doc, current.pos);
            view.dispatch(view.state.tr.setSelection(selection));
            // The editor moves a block that it finds in `view.dragging` when the user drops it.
            const slice = selection.content();
            dragged.add(slice);
            view.dragging = { slice, move: true };
            host.classList.add('rme-block-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', ' ');
            event.dataTransfer.setDragImage(current.dom, 0, 0);
          });
          grip.addEventListener('dragend', () => {
            dragging = false;
            view.dragging = null;
            host.classList.remove('rme-block-dragging');
            hideDropLine();
            hide();
          });

          return {
            // A change of the document moves the blocks, so the handle goes until the pointer moves again.
            update: (updated, previous) => {
              if (!updated.state.doc.eq(previous.doc)) {
                hide();
              }
            },
            destroy: () => {
              cancelAnimationFrame(frame);
              host.removeEventListener('mousemove', onMove);
              host.removeEventListener('dragover', onDragOver);
              host.removeEventListener('drop', hideDropLine);
              host.classList.remove('rme-block-dragging');
              dropLine.remove();
              host.removeEventListener('mouseleave', onLeave);
              host.removeEventListener('mouseenter', cancelLeave);
              cancelLeave();
              view.dom.removeEventListener('keydown', hide);
              handle.remove();
            },
          };
        },
      }),
    ];
  },
});
