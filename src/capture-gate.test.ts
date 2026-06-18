import test from 'node:test';
import assert from 'node:assert/strict';
import { canStartManualCapture } from './capture-gate.ts';

test('canStartManualCapture rejects disabled capture', () => {
  assert.equal(canStartManualCapture({ enabled: false, state: 'idle' }), false);
});

test('canStartManualCapture allows enabled idle capture', () => {
  assert.equal(canStartManualCapture({ enabled: true, state: 'idle' }), true);
});

test('canStartManualCapture rejects active capture states', () => {
  assert.equal(canStartManualCapture({ enabled: true, state: 'recording' }), false);
  assert.equal(canStartManualCapture({ enabled: true, state: 'transcribing' }), false);
});
