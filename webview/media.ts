import { Node } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { icons } from './icons';

export interface MediaItem {
  kind: 'image' | 'video';
  /** The path to write in the Markdown. It is relative to the Markdown file and has URL escapes. */
  src: string;
  alt: string;
}

const VIDEO_TAG = /^<video\b([^>]*)>\s*(?:<\/video>)?$/i;

/** Read the `src` attribute from the text of a `<video>` tag. */
export function videoSource(raw: string): string | undefined {
  const tag = VIDEO_TAG.exec(raw.trim());
  if (!tag) {
    return undefined;
  }
  const attribute = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag[1]);
  return attribute ? (attribute[1] ?? attribute[2]) : undefined;
}

/** The HTML that GitHub shows as a video player. */
export function videoHtml(src: string): string {
  return `<video src="${src.replace(/"/g, '%22')}" controls></video>`;
}

export function createVideo(resolve: (src: string) => string) {
  return Node.create({
    name: 'video',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,
    // Run before the HTML block, which reads the same Markdown token.
    priority: 1000,

    addAttributes() {
      return { raw: { default: '' } };
    },

    parseHTML() {
      return [
        {
          tag: 'video',
          getAttrs: (element) => ({ raw: videoHtml((element as HTMLElement).getAttribute('src') ?? '') }),
        },
      ];
    },

    renderHTML({ node }) {
      return ['video', { src: videoSource(node.attrs.raw) ?? '', controls: '' }];
    },

    markdownTokenName: 'html',

    parseMarkdown(token, helpers) {
      if (token.block === false) {
        return [];
      }
      const raw = String(token.raw ?? token.text ?? '').trim();
      return videoSource(raw) === undefined ? [] : helpers.createNode('video', { raw });
    },

    renderMarkdown(node) {
      return String(node.attrs?.raw ?? '');
    },

    addNodeView() {
      return ({ node }) => {
        let current = node;

        const dom = document.createElement('div');
        dom.className = 'rme-video';
        dom.contentEditable = 'false';

        const player = document.createElement('video');
        player.controls = true;
        player.preload = 'metadata';

        const caption = document.createElement('div');
        caption.className = 'rme-video-caption';

        dom.append(player, caption);

        const show = (raw: string): void => {
          const src = videoSource(raw) ?? '';
          const target = resolve(src);
          if (player.getAttribute('src') !== target) {
            player.src = target;
          }
          caption.innerHTML = icons.video;
          const name = document.createElement('span');
          name.textContent = decodeName(src);
          caption.append(name);
        };
        show(String(node.attrs.raw ?? ''));

        return {
          dom,
          // The player needs its own mouse and key events.
          stopEvent: (event) => event.target === player,
          ignoreMutation: () => true,
          update(updated) {
            if (updated.type !== current.type) {
              return false;
            }
            current = updated;
            show(String(updated.attrs.raw ?? ''));
            return true;
          },
          selectNode() {
            dom.classList.add('is-selected');
          },
          deselectNode() {
            dom.classList.remove('is-selected');
          },
        };
      };
    },
  });
}

function decodeName(src: string): string {
  const name = src.split(/[?#]/)[0].split('/').pop() ?? src;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * Markdown reads `<video src="a.mp4" controls></video>` on one line as a paragraph with two HTML tags.
 * This change turns such a paragraph into a video node.
 * Call this before the editor reads Markdown.
 */
export function patchVideoParagraphs(editor: Editor): void {
  const manager = editor.markdown as any;
  if (!manager || typeof manager.parseToken !== 'function') {
    return;
  }
  const original = manager.parseToken.bind(manager);
  manager.parseToken = (token: any, ...rest: unknown[]) => {
    if (token?.type === 'paragraph' && Array.isArray(token.tokens) && token.tokens.length > 0) {
      const onlyHtml = token.tokens.every(
        (child: any) => child.type === 'html' || (child.type === 'text' && String(child.text).trim() === ''),
      );
      const raw = String(token.raw ?? token.text ?? '').trim();
      if (onlyHtml && videoSource(raw) !== undefined) {
        return { type: 'video', attrs: { raw } };
      }
    }
    return original(token, ...rest);
  };
}
