import test from 'node:test';
import assert from 'node:assert/strict';
import { captureHint, modsFromEvent } from '../renderer/js/hotkey-capture.js';

function eventOf(flags: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean }) {
  return {
    metaKey: !!flags.metaKey,
    ctrlKey: !!flags.ctrlKey,
    altKey: !!flags.altKey,
    shiftKey: !!flags.shiftKey,
  };
}

test('modsFromEvent maps Windows key as Super on Windows', () => {
  assert.deepEqual(modsFromEvent(eventOf({ metaKey: true }), 'win32'), ['Super']);
});

test('modsFromEvent maps Control as CommandOrControl on Windows', () => {
  assert.deepEqual(modsFromEvent(eventOf({ ctrlKey: true }), 'win32'), ['CommandOrControl']);
});

test('modsFromEvent keeps CommandOrControl for Command on macOS', () => {
  assert.deepEqual(modsFromEvent(eventOf({ metaKey: true }), 'darwin'), ['CommandOrControl']);
});

test('captureHint uses Windows examples on Windows', () => {
  assert.equal(
    captureHint('push-to-talk', 'win32'),
    'Hold a modifier combo (Ctrl+Shift) or modifier+key, then release. Esc cancels.',
  );
  assert.equal(
    captureHint('toggle', 'win32'),
    'Press a modifier plus a key (e.g. Ctrl+Alt+Space). Esc cancels.',
  );
});
