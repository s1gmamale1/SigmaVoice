import test from 'node:test';
import assert from 'node:assert/strict';
import { speechFallbackLabel } from '../renderer/js/overview.js';

test('speechFallbackLabel uses macOS Speech only on macOS', () => {
  assert.equal(speechFallbackLabel('darwin'), 'macOS Speech');
  assert.equal(speechFallbackLabel('win32'), 'System speech');
  assert.equal(speechFallbackLabel('linux'), 'System speech');
});
