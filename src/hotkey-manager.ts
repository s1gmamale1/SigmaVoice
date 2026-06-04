// SigmaVoice — hotkey-manager
//
// Supplies the *missing* KEY-UP signal for true push-to-talk (hold-to-talk).
//
// Why this module exists
// ----------------------
// The GlobalCaptureController (from @sigmalink/voice-core) registers an Electron
// `globalShortcut` for the bound hotkey. Electron's globalShortcut only ever
// fires on key-DOWN — it never reports key-UP. So in 'push-to-talk' mode the
// controller's accelerator handler can only *toggle* (press = start, press
// again = stop). That is not real hold-to-talk.
//
// Design (avoids double-fire):
//   • Key-DOWN / start stays on the controller's Electron globalShortcut (we do
//     NOT touch it). On press it calls `startRecording()`.
//   • THIS module adds a global key-UP listener via `node-global-key-listener`
//     (MIT, ships prebuilt listen-only server binaries — no native compile).
//     When mode === 'push-to-talk' and the MAIN key of the bound hotkey is
//     released, we invoke `onPushToTalkRelease()` so the lead can call
//     `controller.stopAndTranscribe()`.
//   • `startRecording()` no-ops when `state !== 'idle'`, so the controller's
//     redundant key-DOWN is harmless — we only need the key-UP edge.
//
// macOS permission note
// ---------------------
// A global key listener requires the **Input Monitoring** permission
// (System Settings → Privacy & Security → Input Monitoring). Without it the
// underlying MacKeyServer cannot read events; `start()` degrades gracefully
// (logs a warning, no throw) so toggle mode keeps working via the controller's
// own globalShortcut.

// Type-only import — the VALUE (GlobalKeyboardListener) is loaded lazily inside
// start() via dynamic import, so a load failure (a missing transitive dep like
// sudo-prompt, or an unsupported platform) is CAUGHT and degrades to toggle mode
// instead of crashing the whole main process with an uncaught exception.
import type {
  GlobalKeyboardListener,
  IGlobalKey,
  IGlobalKeyEvent,
  IGlobalKeyDownMap,
} from 'node-global-key-listener';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HotkeyManagerDeps {
  /** Current capture mode — read live on every key-up. */
  getMode: () => 'toggle' | 'push-to-talk';
  /** Bound Electron accelerator, e.g. 'CommandOrControl+Alt+Space'. Read live. */
  getHotkey: () => string;
  /** Wired by the lead to `controller.stopAndTranscribe()`. */
  onPushToTalkRelease: () => void;
  /**
   * Wired by the lead to `controller.startRecording()`. Used for bare-modifier
   * hold-to-talk, where Electron's globalShortcut can't bind the trigger so this
   * module owns the press edge too (toggle + base-key PTT don't use it).
   */
  onPushToTalkPress: () => void;
  /**
   * Called once when the global key-UP listener cannot attach (e.g. macOS
   * Input Monitoring not granted, or unsupported platform). The lead uses this
   * to tell the user that hold-to-talk is unavailable and the hotkey has
   * degraded to tap-to-toggle (press to start, press again to stop). Optional.
   */
  onListenerUnavailable?: (reason: string) => void;
}

export interface HotkeyManager {
  /** Attach the global key-up listener (idempotent). */
  start(): void;
  /** Detach the listener and release the underlying key server. */
  stop(): void;
  /**
   * Re-validate state. The manager caches nothing — getMode/getHotkey are read
   * live on each event — so this is effectively a no-op kept for symmetry with
   * the controller's own `setHotkey`/`setMode` lifecycle.
   */
  refresh(): void;
}

// ---------------------------------------------------------------------------
// Electron-accelerator → node-global-key-listener key-name mapping
// ---------------------------------------------------------------------------
//
// We only need the MAIN key (the non-modifier token) of the accelerator, since
// the controller already owns press-to-start. The accelerator's last '+'-split
// token is the main key (Electron places the key last, modifiers first).
//
// Reference: Electron accelerators
//   https://www.electronjs.org/docs/latest/api/accelerator
// IGlobalKey names come from node-global-key-listener's IGlobalKey union.

/** Modifier tokens that are NOT the "main" key (used to skip if last). */
const MODIFIER_TOKENS = new Set([
  'command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl',
  'alt', 'option', 'altgr', 'shift', 'super', 'meta',
]);

/**
 * Map of Electron accelerator key tokens (lower-cased) → IGlobalKey name.
 * Only entries that DIFFER from a simple upper-case are listed; anything not
 * here falls through to `.toUpperCase()` (covers A–Z, 0–9, F1–F24).
 */
const KEY_NAME_MAP: Readonly<Record<string, IGlobalKey>> = {
  space: 'SPACE',
  spacebar: 'SPACE',
  tab: 'TAB',
  enter: 'RETURN',
  return: 'RETURN',
  esc: 'ESCAPE',
  escape: 'ESCAPE',
  backspace: 'BACKSPACE',
  delete: 'DELETE',
  del: 'DELETE',
  insert: 'INS',
  up: 'UP ARROW',
  down: 'DOWN ARROW',
  left: 'LEFT ARROW',
  right: 'RIGHT ARROW',
  pageup: 'PAGE UP',
  pagedown: 'PAGE DOWN',
  home: 'HOME',
  end: 'END',
  printscreen: 'PRINT SCREEN',
  // Punctuation
  '=': 'EQUALS',
  'plus': 'NUMPAD PLUS',
  '-': 'MINUS',
  '[': 'SQUARE BRACKET OPEN',
  ']': 'SQUARE BRACKET CLOSE',
  ';': 'SEMICOLON',
  "'": 'QUOTE',
  '\\': 'BACKSLASH',
  ',': 'COMMA',
  '.': 'DOT',
  '/': 'FORWARD SLASH',
  '`': 'BACKTICK',
};

/**
 * Resolve the IGlobalKey name for the MAIN key of an Electron accelerator.
 * Returns null when the accelerator is empty / only modifiers / unmappable.
 */
export function resolveMainKey(accelerator: string): IGlobalKey | null {
  if (!accelerator) return null;
  const tokens = accelerator
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;

  // The main key is the last token; if that is itself a modifier the
  // accelerator has no usable main key (push-to-talk on a bare modifier is not
  // supported here — the controller can't start-on-press for it either).
  const last = tokens[tokens.length - 1]!;
  const lower = last.toLowerCase();
  if (MODIFIER_TOKENS.has(lower)) return null;

  const mapped = KEY_NAME_MAP[lower];
  if (mapped) return mapped;

  // Fallback: A–Z, 0–9, F1–F24 are upper-cased identity matches.
  return last.toUpperCase() as IGlobalKey;
}

// ---------------------------------------------------------------------------
// Bare-modifier hold-to-talk (e.g. hold ⌘⇧ to talk)
// ---------------------------------------------------------------------------
//
// Electron's globalShortcut cannot bind a modifier-only accelerator, so for a
// bare-modifier push-to-talk binding THIS module owns BOTH edges: it watches the
// global key stream, and when every required modifier is held — and no other key
// joins, so ⌘⇧3 doesn't count — for a short hold delay it starts recording;
// releasing any required modifier stops + transcribes.

/** node-global-key-listener key names that satisfy each Electron modifier. */
function modifierGroup(token: string, platform: NodeJS.Platform): IGlobalKey[] | null {
  switch (token) {
    case 'command': case 'cmd': case 'super': case 'meta':
      return ['LEFT META', 'RIGHT META'];
    case 'commandorcontrol': case 'cmdorctrl':
      return platform === 'darwin'
        ? ['LEFT META', 'RIGHT META']
        : ['LEFT CTRL', 'RIGHT CTRL'];
    case 'control': case 'ctrl':
      return ['LEFT CTRL', 'RIGHT CTRL'];
    case 'alt': case 'option': case 'altgr':
      return ['LEFT ALT', 'RIGHT ALT'];
    case 'shift':
      return ['LEFT SHIFT', 'RIGHT SHIFT'];
    default:
      return null;
  }
}

/**
 * For a bare-modifier accelerator (>=2 modifiers, NO base key) return the list
 * of required modifier groups — each group is the set of IGlobalKey names that
 * satisfy that modifier (left/right variants). Returns null if the accelerator
 * has a base key, fewer than 2 modifiers, or an unknown token (those go through
 * the base-key `resolveMainKey` path instead).
 */
export function resolveModifierKeys(
  accelerator: string,
  platform: NodeJS.Platform = process.platform,
): IGlobalKey[][] | null {
  if (!accelerator) return null;
  const tokens = accelerator
    .split('+')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length < 2) return null;
  const groups: IGlobalKey[][] = [];
  for (const token of tokens) {
    const group = modifierGroup(token.toLowerCase(), platform);
    if (!group) return null; // a non-modifier token → not a bare-modifier binding
    groups.push(group);
  }
  return groups;
}

/** IGlobalKey names that count as modifiers (so we can tell when a *non*-modifier
 *  key joins the held combo and turns it into a real shortcut). */
const MODIFIER_KEY_NAMES: ReadonlySet<string> = new Set<IGlobalKey>([
  'LEFT META', 'RIGHT META', 'LEFT CTRL', 'RIGHT CTRL',
  'LEFT ALT', 'RIGHT ALT', 'LEFT SHIFT', 'RIGHT SHIFT', 'FN',
]);

/** True if `name` is a modifier key (not a "real" key like a letter/number). */
export function isModifierKeyName(name: string): boolean {
  return MODIFIER_KEY_NAMES.has(name);
}

export interface PttHoldMachine {
  /** Feed a snapshot computed from a key event + the live key-down map. */
  update(snapshot: { allModsHeld: boolean; otherKeyDown: boolean }): void;
  /** Force back to idle, stopping an in-progress recording. */
  reset(): void;
}

/**
 * Pure hold-delay state machine for bare-modifier push-to-talk. Timer + start/
 * stop are injected so it is fully testable without real timers or the listener.
 *
 *   idle --(all mods held, no other key)--> armed --(delay elapsed)--> recording
 *   armed --(other key joins | a mod released)--> idle  (cancel; never started)
 *   recording --(a mod released)--> idle  (stop + transcribe)
 */
export function createPttHoldMachine(opts: {
  holdDelayMs: number;
  onStart: () => void;
  onStop: () => void;
  schedule: (cb: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
}): PttHoldMachine {
  let state: 'idle' | 'armed' | 'recording' = 'idle';
  let handle: unknown = null;

  function clearTimer(): void {
    if (handle != null) {
      opts.cancel(handle);
      handle = null;
    }
  }

  function update(s: { allModsHeld: boolean; otherKeyDown: boolean }): void {
    if (!s.allModsHeld) {
      if (state === 'armed') { clearTimer(); state = 'idle'; }
      else if (state === 'recording') { state = 'idle'; opts.onStop(); }
      return;
    }
    // Every required modifier is held.
    if (s.otherKeyDown) {
      // A non-modifier key joined the combo → it's a real shortcut, never PTT.
      if (state === 'armed') { clearTimer(); state = 'idle'; }
      return;
    }
    if (state === 'idle') {
      state = 'armed';
      handle = opts.schedule(() => {
        handle = null;
        if (state === 'armed') { state = 'recording'; opts.onStart(); }
      }, opts.holdDelayMs);
    }
  }

  function reset(): void {
    clearTimer();
    if (state === 'recording') opts.onStop();
    state = 'idle';
  }

  return { update, reset };
}

/** Hold a bare-modifier combo this long (ms) before it counts as hold-to-talk —
 *  long enough that a quick combo shortcut (⌘⇧3) doesn't trigger dictation. */
const HOLD_DELAY_MS = 250;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createHotkeyManager(deps: HotkeyManagerDeps): HotkeyManager {
  let listener: GlobalKeyboardListener | null = null;
  // The bound listener callback — kept so we can removeListener on stop().
  let onKey: ((e: IGlobalKeyEvent, down: IGlobalKeyDownMap) => void) | null = null;
  // Guards against re-entrant start() while the async load is in flight.
  let starting = false;

  // Hold-delay state machine for bare-modifier hold-to-talk (e.g. hold ⌘⇧ to
  // talk). Electron's globalShortcut can't bind a bare-modifier trigger, so for
  // that binding this module owns BOTH the press and release edges.
  const holdMachine = createPttHoldMachine({
    holdDelayMs: HOLD_DELAY_MS,
    onStart: () => {
      try { deps.onPushToTalkPress(); }
      catch (err) { console.warn('[hotkey-manager] onPushToTalkPress threw:', err); }
    },
    onStop: () => {
      try { deps.onPushToTalkRelease(); }
      catch (err) { console.warn('[hotkey-manager] onPushToTalkRelease threw:', err); }
    },
    schedule: (cb, delayMs) => setTimeout(cb, delayMs),
    cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  });

  function handleKey(event: IGlobalKeyEvent, down: IGlobalKeyDownMap): void {
    // Toggle mode is fully owned by the controller's globalShortcut.
    if (deps.getMode() !== 'push-to-talk') { holdMachine.reset(); return; }

    const hotkey = deps.getHotkey();
    const modGroups = resolveModifierKeys(hotkey);

    // Bare-modifier hold-to-talk: own both edges via the hold machine. A required
    // modifier is satisfied if EITHER its left/right variant is currently down.
    if (modGroups) {
      // The current event is authoritative for its OWN key (the listener's
      // down-map may or may not reflect this event yet); trust the map for every
      // other key. This makes both the completing DOWN and the breaking UP
      // detect correctly regardless of the library's update ordering.
      const isHeld = (k: IGlobalKey): boolean =>
        event.name === k ? event.state === 'DOWN' : down[k] === true;
      const allModsHeld = modGroups.every((group) => group.some(isHeld));
      // A DOWN for anything that is NOT a known modifier (incl. an unrecognized
      // key with no name) means a real shortcut is forming — not hold-to-talk.
      const otherKeyDown =
        event.state === 'DOWN' && !(event.name != null && isModifierKeyName(event.name));
      holdMachine.update({ allModsHeld, otherKeyDown });
      return;
    }

    // Base-key binding: the controller owns key-DOWN/start; we only supply the
    // missing key-UP/stop edge. Clear any state left from a prior bare-modifier
    // binding first (mode/hotkey are read live, so the binding can change).
    holdMachine.reset();
    if (event.state !== 'UP') return;
    const mainKey = resolveMainKey(hotkey);
    if (mainKey === null) return;
    if (event.name !== mainKey) return;
    try {
      deps.onPushToTalkRelease();
    } catch (err) {
      console.warn('[hotkey-manager] onPushToTalkRelease threw:', err);
    }
  }

  function start(): void {
    if (listener || starting) return; // idempotent (incl. mid-async-load)
    starting = true;
    // Load the lib LAZILY via dynamic import so a load failure — a missing
    // transitive dep (e.g. sudo-prompt), an unsupported platform, or the key
    // server failing to spawn (Input Monitoring denied on macOS) — is caught
    // HERE and degrades to toggle mode, rather than throwing at module-eval and
    // crashing the whole main process with an uncaught exception.
    void (async () => {
      let gkl: GlobalKeyboardListener | null = null;
      try {
        const mod = await import('node-global-key-listener');
        gkl = new mod.GlobalKeyboardListener();
        onKey = handleKey;
        // Resolves once the key server has spawned. listen-only (returns void).
        // The second arg is the live key-down map — needed to tell whether ALL
        // required modifiers are held for bare-modifier hold-to-talk.
        await gkl.addListener((event, down) => {
          onKey?.(event, down);
        });
        listener = gkl;
      } catch (err) {
        console.warn(
          '[hotkey-manager] global key listener unavailable — push-to-talk ' +
            'release detection disabled (toggle mode still works). On macOS grant ' +
            'Input Monitoring in System Settings → Privacy & Security. Error:',
          err,
        );
        if (gkl) { try { gkl.kill(); } catch { /* ignore */ } }
        listener = null;
        onKey = null;
        notifyUnavailable(err);
      } finally {
        starting = false;
      }
    })();
  }

  // Fire onListenerUnavailable at most once, defensively.
  let notifiedUnavailable = false;
  function notifyUnavailable(err: unknown): void {
    if (notifiedUnavailable) return;
    notifiedUnavailable = true;
    try {
      deps.onListenerUnavailable?.(
        err instanceof Error ? err.message : String(err),
      );
    } catch {
      /* never let a notifier throw break start() */
    }
  }

  function stop(): void {
    if (!listener) return;
    try {
      listener.kill(); // removes all listeners + destroys the key server
    } catch (err) {
      console.warn('[hotkey-manager] error stopping global key listener:', err);
    }
    listener = null;
    onKey = null;
  }

  function refresh(): void {
    // No cached state to refresh — getMode()/getHotkey() are read live on each
    // event. Kept for lifecycle symmetry with the controller.
  }

  return { start, stop, refresh };
}
