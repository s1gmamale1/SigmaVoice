// SigmaVoice — accelerator validation.
//
// Pure predicate over an Electron accelerator string, extracted from main.ts so
// it can be unit-tested without booting Electron. Rejects accelerators Electron
// can't register so the UI can report failure instead of silently dropping the
// shortcut.
//
// Reference: https://www.electronjs.org/docs/latest/api/accelerator

const MODIFIERS = new Set([
  'CommandOrControl', 'CmdOrCtrl', 'Command', 'Cmd', 'Control', 'Ctrl',
  'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta',
]);

const NAMED_KEYS = new Set([
  'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter',
  'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown',
  'Escape', 'Esc', 'Plus',
]);

/** True if `s` is a registerable accelerator: >=1 modifier + a trailing key. */
export function isValidAccelerator(s: string): boolean {
  const tokens = s.split('+');
  if (tokens.length < 2) return false; // need >=1 modifier + a key
  const key = tokens[tokens.length - 1];
  const isKey =
    /^[A-Za-z0-9]$/.test(key) ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(key) ||
    NAMED_KEYS.has(key) ||
    // single punctuation key — Electron accepts e.g. / = . ; , [ ] - ` ' \
    (key.length === 1 && /[^A-Za-z0-9\s]/.test(key));
  if (!isKey) return false;
  const mods = tokens.slice(0, -1);
  return mods.length >= 1 && mods.every((m) => MODIFIERS.has(m));
}
