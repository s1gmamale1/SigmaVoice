import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecordButtonState } from '../renderer/js/test-state.js';

test('getRecordButtonState disables manual start when capture is disabled', () => {
  assert.deepEqual(getRecordButtonState({ enabled: false, state: 'idle' }), {
    className: 'record-btn idle',
    label: 'Global capture disabled',
    ariaLabel: 'Global capture disabled',
    disabled: true,
    action: 'none',
  });
});

test('getRecordButtonState allows stop while recording', () => {
  assert.deepEqual(getRecordButtonState({ enabled: true, state: 'recording' }), {
    className: 'record-btn recording',
    label: 'Stop & transcribe',
    ariaLabel: 'Stop & transcribe',
    disabled: false,
    action: 'stop',
  });
});

test('getRecordButtonState disables manual start while transcribing', () => {
  assert.deepEqual(getRecordButtonState({ enabled: true, state: 'transcribing' }), {
    className: 'record-btn busy',
    label: 'Transcribing...',
    ariaLabel: 'Transcribing...',
    disabled: true,
    action: 'none',
  });
});
