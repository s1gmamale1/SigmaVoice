import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidAccelerator, isValidPushToTalkBinding } from './accelerator.ts';

test('isValidAccelerator accepts registerable accelerators', () => {
  for (const accel of [
    'CommandOrControl+Alt+Space', // the engine default
    'Cmd+Shift+A',
    'Ctrl+F5',
    'CommandOrControl+/',
    'Alt+=',
    'Super+Space',
  ]) {
    assert.equal(isValidAccelerator(accel), true, `expected accept: ${accel}`);
  }
});

test('isValidAccelerator rejects unregisterable accelerators', () => {
  for (const accel of [
    '', // empty
    'A', // no modifier
    'Space', // no modifier
    'Ctrl', // no key
    'Ctrl+Shift', // no key (two modifiers, no trailing key)
    'Foo+A', // unknown modifier
  ]) {
    assert.equal(isValidAccelerator(accel), false, `expected reject: ${accel}`);
  }
});

// --- Push-to-talk bindings: base key OPTIONAL (a bare-modifier combo is a valid
// hold-to-talk trigger), but a single bare modifier is rejected as too
// misfire-prone, and a bare key with no modifier is rejected as a global hijack.

test('isValidPushToTalkBinding accepts modifier-combo and base-key bindings', () => {
  for (const accel of [
    'CommandOrControl+Shift', // bare modifier combo — the ⌘⇧ the user tried
    'Cmd+Alt',
    'Alt+Shift',
    'Control+Shift',
    'CommandOrControl+Alt+Space', // a base-key accelerator is valid for PTT too
    'Cmd+Shift+A',
  ]) {
    assert.equal(isValidPushToTalkBinding(accel), true, `expected accept: ${accel}`);
  }
});

test('isValidPushToTalkBinding rejects single modifiers, bare keys, and junk', () => {
  for (const accel of [
    '', // empty
    'Cmd', // single bare modifier — too misfire-prone for hold-to-talk
    'Shift', // single bare modifier
    'Cmd+Cmd', // only ONE distinct modifier
    'Space', // base key, no modifier
    'A', // base key, no modifier
    'Foo+Bar', // unknown tokens
  ]) {
    assert.equal(isValidPushToTalkBinding(accel), false, `expected reject: ${accel}`);
  }
});
