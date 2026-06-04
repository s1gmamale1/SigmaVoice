import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampToWorkArea } from './pill-geometry.ts';

const WA = { x: 0, y: 0, width: 1440, height: 900 };
const SIZE = { width: 220, height: 64 };

test('clampToWorkArea leaves an in-bounds position unchanged', () => {
  assert.deepEqual(clampToWorkArea({ x: 100, y: 200 }, SIZE, WA), { x: 100, y: 200 });
});

test('clampToWorkArea pulls a position off the right/bottom back into view', () => {
  assert.deepEqual(clampToWorkArea({ x: 5000, y: 5000 }, SIZE, WA), {
    x: WA.width - SIZE.width, // 1220
    y: WA.height - SIZE.height, // 836
  });
});

test('clampToWorkArea pulls a negative (off top-left) position back in', () => {
  assert.deepEqual(clampToWorkArea({ x: -300, y: -50 }, SIZE, WA), { x: 0, y: 0 });
});

test('clampToWorkArea respects a non-zero work-area origin (e.g. menu bar)', () => {
  const wa = { x: 0, y: 38, width: 1440, height: 862 };
  assert.deepEqual(clampToWorkArea({ x: 10, y: 0 }, SIZE, wa), { x: 10, y: 38 });
});

test('clampToWorkArea clamps to the origin when the size exceeds the work area', () => {
  const wa = { x: 0, y: 0, width: 100, height: 40 };
  assert.deepEqual(clampToWorkArea({ x: 50, y: 50 }, SIZE, wa), { x: 0, y: 0 });
});
