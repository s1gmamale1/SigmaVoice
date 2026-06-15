// SigmaVoice — accelerator → keycap label formatting (pure, platform-aware).
//
// Turns an Electron-style accelerator string (e.g. 'CommandOrControl+Alt+Space')
// into a human-readable keycap label. On macOS this uses the familiar glyphs
// (⌘ ⌥ ⌃ ⇧ ␣); on Windows it uses text labels (Ctrl Alt Win Shift Space) —
// crucially, `CommandOrControl` resolves to Ctrl on Windows, so it must NOT
// render as ⌘ there. No Electron or DOM deps — kept pure so it's unit-able and
// reusable across the main/renderer boundary. The renderer mirrors this in
// renderer/js/keycaps.js (KEYCAP CONTRACT — keep the two tables in sync).

// macOS keycap glyphs.
const MAC_GLYPHS: Record<string, string> = {
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

// Windows keycap labels. `CommandOrControl`/`Control` → Ctrl (what the OS binds);
// `Command`/`Super`/`Meta` → Win (the ⊞ key). Arrows stay as universal glyphs.
const WIN_LABELS: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Control: 'Ctrl',
  Ctrl: 'Ctrl',
  Command: 'Win',
  Cmd: 'Win',
  Super: 'Win',
  Meta: 'Win',
  Alt: 'Alt',
  Option: 'Alt',
  AltGr: 'AltGr',
  Shift: 'Shift',
  Space: 'Space',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Return: 'Enter',
  Enter: 'Enter',
  Escape: 'Esc',
  Esc: 'Esc',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Plus: '+',
};

/** Pick the keycap table for a platform (`process.platform` values). */
function tableFor(platform: string): Record<string, string> {
  return platform === 'win32' ? WIN_LABELS : MAC_GLYPHS;
}

/**
 * Format an accelerator string into a space-joined keycap label for the given
 * platform (defaults to the host `process.platform`). Known tokens map to the
 * platform's glyph/label; single chars are upper-cased; everything else passes
 * through unchanged. Empty input yields an empty string.
 */
export function formatAccelerator(accel: string, platform: string = process.platform): string {
  if (!accel) return '';
  const table = tableFor(platform);
  return accel
    .split('+')
    .map((t) => table[t] ?? (t.length === 1 ? t.toUpperCase() : t))
    .join(' ');
}
