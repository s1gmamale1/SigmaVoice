// SigmaVoice — keycaps unit tests (node:test, native TS).
//
// Run: node --test src/keycaps.test.ts  (Node's built-in TS type-stripping).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatAccelerator } from './keycaps.ts';

test('macOS: maps modifier + special tokens to glyphs', () => {
  assert.equal(formatAccelerator('CommandOrControl+Alt+Space', 'darwin'), '⌘ ⌥ ␣');
});

test('Windows: CommandOrControl renders as Ctrl (NOT ⌘) + text labels', () => {
  assert.equal(formatAccelerator('CommandOrControl+Alt+Space', 'win32'), 'Ctrl Alt Space');
});

test('Windows: Super/Cmd/Meta render as Win', () => {
  assert.equal(formatAccelerator('Super+Shift+a', 'win32'), 'Win Shift A');
  assert.equal(formatAccelerator('Cmd+Shift+a', 'win32'), 'Win Shift A');
});

test('macOS: Cmd/Super render as ⌘', () => {
  assert.equal(formatAccelerator('Cmd+Shift+a', 'darwin'), '⌘ ⇧ A');
  assert.equal(formatAccelerator('Super+Shift+a', 'darwin'), '⌘ ⇧ A');
});

test('upper-cases single-char keys on both platforms', () => {
  assert.equal(formatAccelerator('Ctrl+a', 'darwin'), '⌃ A');
  assert.equal(formatAccelerator('Ctrl+a', 'win32'), 'Ctrl A');
});

test('passes through unknown single chars on both platforms', () => {
  assert.equal(formatAccelerator('Ctrl+/', 'darwin'), '⌃ /');
  assert.equal(formatAccelerator('Ctrl+/', 'win32'), 'Ctrl /');
});

test('returns empty string for empty input on both platforms', () => {
  assert.equal(formatAccelerator('', 'darwin'), '');
  assert.equal(formatAccelerator('', 'win32'), '');
});

// KEYCAP CONTRACT: the renderer mirror (renderer/js/keycaps.js) must produce
// identical output to src/keycaps.ts for every token, on every platform.
// The mirror is plain JS with no .d.ts; import it via a non-literal specifier so
// `tsc` treats it as `any` (no TS7016) while `node --test` resolves it at runtime.
test('renderer mirror matches src/keycaps.ts (parity contract)', async () => {
  const mirrorSpec = '../renderer/js/keycaps.js';
  const mirror = (await import(mirrorSpec)) as {
    formatAccelerator: (accel: string, platform?: string) => string;
  };
  const rendererFormat = mirror.formatAccelerator;
  const samples = [
    'CommandOrControl+Alt+Space',
    'Cmd+Shift+a',
    'Super+Ctrl+Backspace',
    'Control+Alt+Delete',
    'Ctrl+/',
    'Shift+Up',
    'Meta+Enter',
    '',
  ];
  for (const platform of ['darwin', 'win32', 'linux']) {
    for (const accel of samples) {
      assert.equal(
        rendererFormat(accel, platform),
        formatAccelerator(accel, platform),
        `mismatch for "${accel}" on ${platform}`,
      );
    }
  }
});
