// SigmaVoice — keycap label formatting (renderer mirror of src/keycaps.ts).
//
// KEYCAP CONTRACT (must match src/keycaps.ts — the renderer cannot import the
// .ts source over file://, so the tables are mirrored here; src/keycaps.test.ts
// asserts parity). Maps Electron accelerator tokens → platform keycap labels:
// macOS glyphs (⌘ ⌥ ⌃ ⇧ ␣) or Windows text (Ctrl Alt Win Shift Space). On
// Windows `CommandOrControl` resolves to Ctrl, so it must NOT render as ⌘.

// macOS keycap glyphs.
const MAC_GLYPHS = {
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

// Windows keycap labels.
const WIN_LABELS = {
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

function tableFor(platform) {
  return platform === 'win32' ? WIN_LABELS : MAC_GLYPHS;
}

/**
 * Detect the host platform: prefer the value the preload exposes
 * (`window.bridgeVoice.platform` = `process.platform`), then a User-Agent hint,
 * then Node's `process` (so this module is importable under `node --test` for
 * the parity check), defaulting to macOS.
 */
function defaultPlatform() {
  try {
    if (typeof window !== 'undefined' && window.bridgeVoice && window.bridgeVoice.platform) {
      return window.bridgeVoice.platform;
    }
    if (typeof navigator !== 'undefined') {
      const ua = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
      if (/win/i.test(ua)) return 'win32';
      if (/mac/i.test(ua)) return 'darwin';
      if (/linux/i.test(ua)) return 'linux';
    }
  } catch { /* non-fatal — fall through to the defaults below */ }
  if (typeof process !== 'undefined' && process.platform) return process.platform;
  return 'darwin';
}

/**
 * Format an Electron accelerator string into individual keycap tokens for the
 * given platform (defaults to the detected host). Returns an array so callers
 * can render each as a <kbd>.
 */
export function acceleratorTokens(accel, platform = defaultPlatform()) {
  if (!accel) return [];
  const table = tableFor(platform);
  return accel
    .split('+')
    .map((t) => table[t] ?? (t.length === 1 ? t.toUpperCase() : t));
}

/** Format an accelerator into a single space-joined keycap string (contract). */
export function formatAccelerator(accel, platform = defaultPlatform()) {
  if (!accel) return '';
  return acceleratorTokens(accel, platform).join(' ');
}
