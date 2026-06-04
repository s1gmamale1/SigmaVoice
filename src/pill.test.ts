// pill.ts is electron-free at module scope (ipcMain is injected), so the pure
// settings helpers import cleanly under `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPillEnabled, getPillAppearance, getSavedPillPosition } from './pill.ts';

/** Minimal KvStore stand-in over a plain map. */
function kvOf(map: Record<string, string>) {
  return { get: (k: string) => (k in map ? map[k] : null), set: () => {} };
}

test('isPillEnabled defaults ON; only an explicit "0" disables', () => {
  assert.equal(isPillEnabled(kvOf({})), true); // absent → on
  assert.equal(isPillEnabled(kvOf({ 'voice.pill.enabled': '1' })), true);
  assert.equal(isPillEnabled(kvOf({ 'voice.pill.enabled': '0' })), false);
  assert.equal(isPillEnabled(null), true);
});

test('getPillAppearance defaults full; compact only on explicit "compact"', () => {
  assert.equal(getPillAppearance(kvOf({})), 'full');
  assert.equal(getPillAppearance(kvOf({ 'voice.pill.appearance': 'compact' })), 'compact');
  assert.equal(getPillAppearance(kvOf({ 'voice.pill.appearance': 'weird' })), 'full');
});

test('getSavedPillPosition parses {x,y}; falls back on corrupt / wrong-shape / missing', () => {
  assert.deepEqual(
    getSavedPillPosition(kvOf({ 'voice.pill.pos': '{"x":10,"y":20}' })),
    { x: 10, y: 20 },
  );
  assert.equal(getSavedPillPosition(kvOf({ 'voice.pill.pos': 'not json' })), null);
  assert.equal(getSavedPillPosition(kvOf({ 'voice.pill.pos': '{"x":"a","y":2}' })), null);
  assert.equal(getSavedPillPosition(kvOf({})), null);
});
