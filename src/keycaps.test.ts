// SigmaVoice — keycaps unit tests (node:test, native TS).
//
// Run: node --test src/keycaps.test.ts  (Node's built-in TS type-stripping).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatAccelerator } from './keycaps.ts';

test('formatAccelerator maps modifier + special tokens to glyphs', () => {
  assert.equal(formatAccelerator('CommandOrControl+Alt+Space'), '⌘ ⌥ ␣');
});

test('formatAccelerator upper-cases single-char keys', () => {
  assert.equal(formatAccelerator('Cmd+Shift+a'), '⌘ ⇧ A');
});

test('formatAccelerator passes through unknown single chars', () => {
  assert.equal(formatAccelerator('Ctrl+/'), '⌃ /');
});

test('formatAccelerator returns empty string for empty input', () => {
  assert.equal(formatAccelerator(''), '');
});
