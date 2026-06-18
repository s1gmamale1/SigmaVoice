// SigmaVoice — hotkey capture control.
//
// Replaces the raw "type an accelerator" text field with a record-shortcut
// button: click it, press the keys you want, and it builds a valid Electron
// accelerator. Mode-aware — push-to-talk accepts a bare-modifier combo (hold
// ⌘⇧ to talk); toggle requires a modifier + a base key. Esc cancels.

import { acceleratorTokens } from './keycaps.js';

/** Held modifiers as Electron tokens, in a stable canonical order. */
export function getRendererPlatform() {
  return globalThis.window?.bridgeVoice?.platform ?? 'darwin';
}

/** Held modifiers as Electron tokens, in a stable canonical order. */
export function modsFromEvent(e, platform = getRendererPlatform()) {
  const mods = [];
  if (platform === 'darwin') {
    if (e.metaKey) mods.push('CommandOrControl'); // Command on macOS
    if (e.ctrlKey) mods.push('Control');
  } else {
    if (e.ctrlKey) mods.push('CommandOrControl');
    if (e.metaKey) mods.push('Super');
  }
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  return mods;
}

export function captureHint(mode, platform = getRendererPlatform()) {
  const isWin = platform === 'win32';
  if (mode === 'push-to-talk') {
    return isWin
      ? 'Hold a modifier combo (Ctrl+Shift) or modifier+key, then release. Esc cancels.'
      : 'Hold a modifier combo (⌘⇧) or modifier+key, then release. Esc cancels.';
  }
  return isWin
    ? 'Press a modifier plus a key (e.g. Ctrl+Alt+Space). Esc cancels.'
    : 'Press a modifier plus a key (e.g. ⌘⌥Space). Esc cancels.';
}

function modeHint(mode = null) {
  const currentMode = mode ?? getModeSafe();
  const isWin = getRendererPlatform() === 'win32';
  if (currentMode === 'push-to-talk') {
    return isWin
      ? 'Hold the keys you want to push-to-talk with (e.g. Ctrl+Shift), then release.'
      : 'Hold the keys you want to push-to-talk with (e.g. ⌘⇧), then release.';
  }
  return isWin
    ? 'Press a shortcut — a modifier plus a key (e.g. Ctrl+Alt+Space).'
    : 'Press a shortcut — a modifier plus a key (e.g. ⌘⌥Space).';
}

function addModifierHint() {
  return getRendererPlatform() === 'win32'
    ? 'Add a modifier (Ctrl/Alt/Shift/Win) — a bare key would hijack it globally.'
    : 'Add a modifier (⌘/⌥/⌃/⇧) — a bare key would hijack it globally.';
}

function bareModifierHint(mode) {
  const isWin = getRendererPlatform() === 'win32';
  if (mode === 'push-to-talk') {
    return isWin
      ? 'Hold at least two modifiers (e.g. Ctrl+Shift), or add a key.'
      : 'Hold at least two modifiers (e.g. ⌘⇧), or add a key.';
  }
  return isWin
    ? 'Toggle needs a key — press a modifier plus a key (e.g. Ctrl+Alt+Space).'
    : 'Toggle needs a key — press a modifier plus a key (e.g. ⌘⌥Space).';
}

let getModeSafe = () => 'toggle';

const NAMED_CODE = {
  Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Tab: 'Tab',
  Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
};

/** Electron base-key token for a keydown, or null if it's a modifier/unmappable. */
function baseKeyFromEvent(e) {
  const c = e.code || '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3); // KeyA → A
  if (/^Digit[0-9]$/.test(c)) return c.slice(5); // Digit3 → 3
  if (/^Numpad[0-9]$/.test(c)) return c.slice(6); // Numpad3 → 3
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c; // F1–F24
  if (NAMED_CODE[c]) return NAMED_CODE[c];
  // single punctuation (/ = . ; , [ ] - ` ' \) via the produced character
  if (e.key && e.key.length === 1 && /[^A-Za-z0-9\s]/.test(e.key)) return e.key;
  return null;
}

/**
 * Wire the record-shortcut control.
 * @param {{ getMode: () => 'toggle'|'push-to-talk', onCommit: (accel: string) => void }} deps
 * @returns {{ setValue: (accel: string) => void }} setValue updates the displayed
 *   binding from live status (a no-op while the user is actively capturing).
 */
export function initHotkeyCapture({ getMode, onCommit }) {
  getModeSafe = getMode;
  const btn = document.getElementById('hotkey-capture-btn');
  const capsEl = document.getElementById('hotkey-keycaps');
  const hintEl = document.getElementById('hotkey-hint');
  if (!btn || !capsEl) return { setValue() {} };

  let capturing = false;
  let currentValue = '';
  let peakMods = []; // largest simultaneous modifier set seen this capture

  function renderCaps(accel, placeholder) {
    capsEl.replaceChildren();
    const tokens = acceleratorTokens(accel);
    if (!tokens.length) {
      const none = document.createElement('span');
      none.className = 'kbd-none';
      none.textContent = placeholder || 'Not set';
      capsEl.appendChild(none);
      return;
    }
    for (const t of tokens) {
      const kbd = document.createElement('kbd');
      kbd.className = 'kbd';
      kbd.textContent = t;
      capsEl.appendChild(kbd);
    }
  }

  function setHint(text) { if (hintEl) hintEl.textContent = text; }

  function setValue(accel) {
    currentValue = accel || '';
    if (!capturing) renderCaps(currentValue);
  }

  function endCapture(commitAccel) {
    if (!capturing) return;
    capturing = false;
    peakMods = [];
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    btn.classList.remove('capturing');
    btn.setAttribute('aria-pressed', 'false');
    if (commitAccel) { currentValue = commitAccel; onCommit(commitAccel); }
    renderCaps(currentValue);
    setHint(modeHint());
  }

  function onBlur() { endCapture(null); }

  function onKeyDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') { endCapture(null); return; }

    const mods = modsFromEvent(e);
    if (mods.length >= peakMods.length) peakMods = mods;
    const base = baseKeyFromEvent(e);

    if (base) {
      if (mods.length === 0) {
        setHint(addModifierHint());
        renderCaps(base, 'Press your keys…');
        return;
      }
      endCapture([...mods, base].join('+'));
      return;
    }
    // Modifier-only so far — live-preview; a bare-modifier combo commits on release.
    renderCaps(mods.join('+'), 'Press your keys…');
  }

  function onKeyUp(e) {
    if (!capturing) return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) {
      renderCaps(modsFromEvent(e).join('+'), 'Press your keys…');
      return;
    }
    // All keys released with no base key → evaluate the bare-modifier combo.
    const mods = peakMods;
    peakMods = [];
    if (getMode() === 'push-to-talk' && mods.length >= 2) {
      endCapture(mods.join('+'));
      return;
    }
    setHint(
      bareModifierHint(getMode()),
    );
    renderCaps(currentValue, 'Press your keys…');
  }

  function startCapture() {
    if (capturing) { endCapture(null); return; }
    capturing = true;
    peakMods = [];
    btn.classList.add('capturing');
    btn.setAttribute('aria-pressed', 'true');
    renderCaps('', 'Press your keys…');
    setHint(captureHint(getMode()));
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
  }

  btn.addEventListener('click', startCapture);
  renderCaps(currentValue);
  return { setValue };
}
