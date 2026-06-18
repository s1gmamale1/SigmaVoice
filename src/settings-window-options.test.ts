import test from 'node:test';
import assert from 'node:assert/strict';
import { platformWindowChrome } from './settings-window-options.ts';

test('platformWindowChrome enables macOS glass chrome only on darwin', () => {
  assert.deepEqual(platformWindowChrome('darwin'), {
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar',
    transparent: true,
    backgroundColor: '#00000000',
  });
});

test('platformWindowChrome uses opaque default chrome on Windows', () => {
  assert.deepEqual(platformWindowChrome('win32'), {
    backgroundColor: '#101014',
  });
});
