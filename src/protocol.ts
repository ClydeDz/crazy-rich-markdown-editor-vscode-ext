import type { FileAuthor } from './fileInfo';

/** An image or video that was saved next to the document. */
export interface MediaItem {
  kind: 'image' | 'video';
  /** The path to write in the Markdown. It is relative to the document and has URL escapes. */
  src: string;
  alt: string;
}

/** Messages sent from the extension host to the webview. */
export type HostMessage =
  | {
      type: 'init';
      text: string;
      /** Webview URI of the folder that holds the document. Used to resolve relative images. */
      baseUri: string;
      maxContentWidth: number;
      /** False when the user turned off the bar at the top. */
      showInfoBar: boolean;
      /** True for an `.mdx` file. The editor then keeps `import`, `export`, JSX and `{expressions}` as they are. */
      mdx: boolean;
    }
  | { type: 'update'; text: string }
  | { type: 'config'; maxContentWidth: number; showInfoBar: boolean }
  | { type: 'insertMedia'; items: MediaItem[] }
  /** The facts about the file for the bar at the top. `authors` is empty when Git has none. */
  | {
      type: 'fileInfo';
      /** When the file was last saved to disk, in milliseconds since 1970. Missing when the file has no time. */
      modified?: number;
      /** The people who changed the file in the last commits, newest first. */
      authors: FileAuthor[];
    };

/** Messages sent from the webview to the extension host. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'edit'; text: string }
  | { type: 'openLink'; href: string }
  /** Ask the host to open the settings of this extension, from the button in the bar at the top. */
  | { type: 'openSettings' }
  /** Ask the host to show a file picker for images and videos. */
  | { type: 'pickMedia' }
  /** Send the bytes of a pasted or dropped file. The host saves it in the asset folder. */
  | { type: 'saveAsset'; name: string; mime: string; data: ArrayBuffer | Uint8Array }
  /** A pasted or dropped file is too large to send. */
  | { type: 'assetTooLarge'; name: string };
