import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidAccelerator } from './accelerator.ts';

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
