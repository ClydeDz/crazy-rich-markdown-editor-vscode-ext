export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** How a key shows on a key cap. A key that is not here shows as it is, and a single letter shows in upper case. */
const KEY_NAMES: Record<string, { mac: string; other: string }> = {
  Mod: { mac: '⌘', other: 'Ctrl' },
  Shift: { mac: '⇧', other: 'Shift' },
  Alt: { mac: '⌥', other: 'Alt' },
  Enter: { mac: '↵', other: 'Enter' },
  Tab: { mac: '⇥', other: 'Tab' },
  Backspace: { mac: '⌫', other: 'Backspace' },
  Escape: { mac: 'Esc', other: 'Esc' },
  ArrowUp: { mac: '↑', other: '↑' },
  ArrowDown: { mac: '↓', other: '↓' },
};

/**
 * The key caps of a shortcut. The shortcut has the form of a Tiptap key name, for example `Mod-Shift-s`.
 * `Mod` is the Command key on macOS and the Ctrl key elsewhere.
 */
export function keyParts(shortcut: string, mac: boolean = isMac): string[] {
  return shortcut.split('-').map((key) => {
    const name = KEY_NAMES[key];
    if (name) {
      return mac ? name.mac : name.other;
    }
    return key.length === 1 ? key.toUpperCase() : key;
  });
}

/** A shortcut as one piece of text, for a tooltip. It is `⌘⇧S` on macOS and `Ctrl+Shift+S` elsewhere. */
export function formatShortcut(shortcut: string, mac: boolean = isMac): string {
  return keyParts(shortcut, mac).join(mac ? '' : '+');
}
