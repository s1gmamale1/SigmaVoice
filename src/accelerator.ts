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

/** True if `key` is a registerable non-modifier key token (A–Z, 0–9, F1–F24,
 * a named key like Space/Enter, or a single punctuation char). */
function isKeyToken(key: string): boolean {
  return (
    /^[A-Za-z0-9]$/.test(key) ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(key) ||
    NAMED_KEYS.has(key) ||
    // single punctuation key — Electron accepts e.g. / = . ; , [ ] - ` ' \
    (key.length === 1 && /[^A-Za-z0-9\s]/.test(key))
  );
}

/** True if `s` is a registerable accelerator: >=1 modifier + a trailing key. */
export function isValidAccelerator(s: string): boolean {
  const tokens = s.split('+');
  if (tokens.length < 2) return false; // need >=1 modifier + a key
  if (!isKeyToken(tokens[tokens.length - 1])) return false;
  const mods = tokens.slice(0, -1);
  return mods.length >= 1 && mods.every((m) => MODIFIERS.has(m));
}

/**
 * True if `s` is a valid *push-to-talk* (hold-to-talk) binding. Unlike a
 * registerable accelerator the base key is OPTIONAL — a bare-modifier combo
 * (e.g. 'CommandOrControl+Shift') is the hold-to-talk trigger Electron's
 * globalShortcut can't bind, so the app-shell key listener owns it directly.
 *
 * Rules:
 *  • A binding ending in a base key follows the normal accelerator rule
 *    (>=1 modifier + key) — covers e.g. 'CommandOrControl+Alt+Space'.
 *  • A bare-modifier binding needs >=2 DISTINCT modifiers. A single held
 *    modifier (⌘ alone) is rejected: it fires on every shortcut and any pause,
 *    so it's far too misfire-prone for hold-to-talk.
 *  • Empty / unknown tokens / a bare key with no modifier are rejected.
 */
export function isValidPushToTalkBinding(s: string): boolean {
  if (!s) return false;
  const tokens = s.split('+');
  if (tokens.some((t) => t.length === 0)) return false; // e.g. a trailing '+'
  // Ends in a base key → identical to a normal accelerator.
  if (isKeyToken(tokens[tokens.length - 1])) return isValidAccelerator(s);
  // Otherwise it must be an all-modifier combo with >=2 DISTINCT modifiers.
  if (!tokens.every((t) => MODIFIERS.has(t))) return false;
  return new Set(tokens).size >= 2;
}
