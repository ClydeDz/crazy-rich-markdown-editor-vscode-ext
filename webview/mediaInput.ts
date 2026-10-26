import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, Selection } from '@tiptap/pm/state';

const MEDIA_TYPE = /^(?:image|video)\//i;
const MEDIA_EXTENSION = /\.(?:png|jpe?g|gif|svg|webp|avif|bmp|mp4|mov|webm|m4v|ogv)$/i;

export function isMediaFile(file: { name: string; type: string }): boolean {
  return MEDIA_TYPE.test(file.type) || MEDIA_EXTENSION.test(file.name);
}

export interface MediaInputOptions {
  /** Called with the image and video files that the user pasted or dropped. */
  onFiles: (files: File[]) => void;
}

/** Send pasted and dropped images and videos to the host. The host copies them next to the document. */
export function createMediaInput(options: MediaInputOptions): Extension {
  return Extension.create({
    name: 'rmeMediaInput',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('rmeMediaInput'),
          props: {
            handlePaste: (_view, event) => {
              const files = Array.from(event.clipboardData?.files ?? []).filter(isMediaFile);
              if (files.length === 0) {
                return false;
              }
              event.preventDefault();
              options.onFiles(files);
              return true;
            },
            handleDrop: (view, event) => {
              const files = Array.from(event.dataTransfer?.files ?? []).filter(isMediaFile);
              if (files.length === 0) {
                return false;
              }
              event.preventDefault();
              // Insert at the place where the user dropped the file.
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
              if (at) {
                view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(at.pos))));
              }
              options.onFiles(files);
              return true;
            },
          },
        }),
      ];
    },
  });
}
