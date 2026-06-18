// SigmaVoice — Test pane (manual record/transcribe trigger).
//
// One big record button: when idle it starts recording; when recording it
// stops and transcribes. The button's appearance/label follow the live capture
// state (updateRecordBtn, driven by applyStatus → onStateChange).

import { safeCall } from './settings.js';
import { getRecordButtonState } from './test-state.js';

/** Reflect the capture status into the record button (label + enabled state). */
export function updateRecordBtn(status) {
  const btn = document.getElementById('record-btn');
  const label = document.getElementById('record-btn-label');
  if (!btn || !label) return;
  const view = getRecordButtonState(status);
  btn.className = view.className;
  label.textContent = view.label;
  btn.disabled = view.disabled;
  btn.setAttribute('aria-disabled', String(view.disabled));
  btn.setAttribute('aria-label', view.ariaLabel);
  // Icon shape (circle vs square) toggles via CSS off the class.
}

/** Wire the record button. */
export function initTest() {
  document.getElementById('record-btn')?.addEventListener('click', async () => {
    const status = await safeCall('getStatus');
    const view = getRecordButtonState(status);
    if (view.action === 'stop') {
      await safeCall('stopAndTranscribe');
    } else if (view.action === 'start') {
      await safeCall('startRecording');
    }
  });
}
