// SigmaVoice — keycap glyph formatting (renderer mirror of src/keycaps.ts).
//
// KEYCAP CONTRACT (must match src/keycaps.ts — the renderer cannot import the
// .ts source over file://, so the table is mirrored here). Maps Electron
// accelerator tokens → macOS keycap glyphs so a hotkey like
// "CommandOrControl+Alt+Space" renders as "⌘ ⌥ ␣".

const GLYPHS = {
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
 * Format an Electron accelerator string into individual keycap tokens.
 * Returns an array so callers can render each as a <kbd>.
 */
export function acceleratorTokens(accel) {
  if (!accel) return [];
  return accel
    .split('+')
    .map((t) => GLYPHS[t] ?? (t.length === 1 ? t.toUpperCase() : t));
}

/** Format an accelerator into a single space-joined glyph string (contract). */
export function formatAccelerator(accel) {
  if (!accel) return '';
  return acceleratorTokens(accel).join(' ');
}
