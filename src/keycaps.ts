// SigmaVoice — accelerator → keycap glyph formatting (pure).
//
// Turns an Electron-style accelerator string (e.g. 'CommandOrControl+Alt+Space')
// into a human-readable keycap label using macOS glyphs (e.g. '⌘ ⌥ ␣'), for
// display in the settings UI / HUD. No Electron or DOM deps — kept pure so it's
// unit-able and reusable across the main/renderer boundary.

const GLYPHS: Record<string, string> = {
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Command: '⌘',
  Cmd: '⌘',
  Super: '⌘',
  Meta: '⌘',
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  AltGr: '⌥',
  Shift: '⇧',
  Space: '␣',
  Tab: '⇥',
  Backspace: '⌫',
  Delete: '⌦',
  Return: '↩',
  Enter: '↩',
  Escape: '⎋',
  Esc: '⎋',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Plus: '+',
};

/**
 * Format an accelerator string into a glyph-joined keycap label.
 * Known tokens map to glyphs; single chars are upper-cased; everything else
 * passes through unchanged. Empty input yields an empty string.
 */
export function formatAccelerator(accel: string): string {
  if (!accel) return '';
  return accel
    .split('+')
    .map((t) => GLYPHS[t] ?? (t.length === 1 ? t.toUpperCase() : t))
    .join(' ');
}
