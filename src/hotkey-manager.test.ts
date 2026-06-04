// Safe to import under plain node: the only top-level import of
// node-global-key-listener is `import type` (erased), and the value is loaded
// lazily via dynamic import inside start(). resolveMainKey is pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMainKey,
  resolveModifierKeys,
  createPttHoldMachine,
} from './hotkey-manager.ts';

test('resolveMainKey maps the trailing letter of an accelerator', () => {
  assert.equal(resolveMainKey('CommandOrControl+Alt+A'), 'A');
  assert.equal(resolveMainKey('Cmd+Shift+z'), 'Z'); // upper-cased identity
  assert.equal(resolveMainKey('Ctrl+F5'), 'F5');
});

test('resolveMainKey maps Space to the SPACE key name', () => {
  assert.equal(resolveMainKey('CommandOrControl+Alt+Space'), 'SPACE');
});

test('resolveMainKey returns null for modifier-only or empty input', () => {
  assert.equal(resolveMainKey(''), null);
  assert.equal(resolveMainKey('Ctrl+Shift'), null); // last token is a modifier
  assert.equal(resolveMainKey('Cmd'), null); // bare modifier
});

// --- resolveModifierKeys: bare-modifier combo → required IGlobalKey groups ----

test('resolveModifierKeys maps a bare-modifier combo to required key groups (darwin)', () => {
  assert.deepEqual(resolveModifierKeys('CommandOrControl+Shift', 'darwin'), [
    ['LEFT META', 'RIGHT META'],
    ['LEFT SHIFT', 'RIGHT SHIFT'],
  ]);
});

test('resolveModifierKeys maps CommandOrControl to CTRL off darwin', () => {
  assert.deepEqual(resolveModifierKeys('CommandOrControl+Shift', 'win32'), [
    ['LEFT CTRL', 'RIGHT CTRL'],
    ['LEFT SHIFT', 'RIGHT SHIFT'],
  ]);
});

test('resolveModifierKeys maps Alt and Control combos', () => {
  assert.deepEqual(resolveModifierKeys('Alt+Shift', 'darwin'), [
    ['LEFT ALT', 'RIGHT ALT'],
    ['LEFT SHIFT', 'RIGHT SHIFT'],
  ]);
  assert.deepEqual(resolveModifierKeys('Control+Alt', 'darwin'), [
    ['LEFT CTRL', 'RIGHT CTRL'],
    ['LEFT ALT', 'RIGHT ALT'],
  ]);
});

test('resolveModifierKeys returns null for base-key bindings or <2 modifiers', () => {
  assert.equal(resolveModifierKeys('CommandOrControl+Alt+Space', 'darwin'), null); // base key
  assert.equal(resolveModifierKeys('Cmd', 'darwin'), null); // single modifier
  assert.equal(resolveModifierKeys('', 'darwin'), null);
});

// --- createPttHoldMachine: hold-delay press/release state machine -------------

/** A machine wired to spies + a controllable fake timer. */
function makeMachine() {
  const calls: string[] = [];
  let pending: (() => void) | null = null;
  const machine = createPttHoldMachine({
    holdDelayMs: 250,
    onStart: () => calls.push('start'),
    onStop: () => calls.push('stop'),
    schedule: (cb: () => void) => {
      pending = cb;
      return { id: 1 };
    },
    cancel: () => {
      pending = null;
    },
  });
  return {
    machine,
    calls,
    fireTimer: () => {
      const cb = pending;
      pending = null;
      cb?.();
    },
  };
}

test('hold machine starts after the delay when the combo stays held', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false }); // arm
  assert.deepEqual(calls, []); // not yet — waiting out the hold delay
  fireTimer(); // delay elapses, still held
  assert.deepEqual(calls, ['start']);
});

test('hold machine stops when a modifier is released after recording', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false });
  fireTimer();
  machine.update({ allModsHeld: false, otherKeyDown: false }); // release
  assert.deepEqual(calls, ['start', 'stop']);
});

test('hold machine does NOT start if a non-modifier key joins the combo (real shortcut)', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false }); // ⌘⇧ held → arm
  machine.update({ allModsHeld: true, otherKeyDown: true }); // ⌘⇧3 → real shortcut
  fireTimer(); // a stale timer must not start
  assert.deepEqual(calls, []);
});

test('hold machine does NOT start if released before the delay elapses', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false }); // arm
  machine.update({ allModsHeld: false, otherKeyDown: false }); // released early
  fireTimer();
  assert.deepEqual(calls, []);
});

test('hold machine reset() stops an in-progress recording', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false });
  fireTimer();
  machine.reset();
  assert.deepEqual(calls, ['start', 'stop']);
});

test('hold machine supports a second press/release cycle', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false });
  fireTimer();
  machine.update({ allModsHeld: false, otherKeyDown: false });
  machine.update({ allModsHeld: true, otherKeyDown: false }); // second hold
  fireTimer();
  machine.update({ allModsHeld: false, otherKeyDown: false });
  assert.deepEqual(calls, ['start', 'stop', 'start', 'stop']);
});

test('hold machine ignores a non-modifier key WHILE recording (type while dictating)', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false }); // arm
  fireTimer(); // start
  machine.update({ allModsHeld: true, otherKeyDown: true }); // a key pressed mid-dictation
  assert.deepEqual(calls, ['start']); // must NOT stop — only releasing a modifier stops
});

test('hold machine re-arms after a non-modifier cancel and can then start', () => {
  const { machine, calls, fireTimer } = makeMachine();
  machine.update({ allModsHeld: true, otherKeyDown: false }); // arm
  machine.update({ allModsHeld: true, otherKeyDown: true }); // ⌘⇧3 → cancel (still armed→idle)
  machine.update({ allModsHeld: true, otherKeyDown: false }); // re-arm
  fireTimer();
  assert.deepEqual(calls, ['start']);
});
