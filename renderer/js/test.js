// SigmaVoice — Test pane (manual record/transcribe trigger).
//
// One big record button: when idle it starts recording; when recording it
// stops and transcribes. The button's appearance/label follow the live capture
// state (updateRecordBtn, driven by applyStatus → onStateChange).

import { safeCall } from './settings.js';

/** Reflect the capture state into the record button (label + idle/recording). */
export function updateRecordBtn(state) {
  const btn = document.getElementById('record-btn');
  const label = document.getElementById('record-btn-label');
  if (!btn || !label) return;
  const isRec = state === 'recording';
  btn.className = 'record-btn ' + (isRec ? 'recording' : 'idle');
  label.textContent = isRec ? 'Stop & transcribe' : 'Start recording';
  btn.setAttribute('aria-label', label.textContent);
  // Icon shape (circle vs square) toggles via CSS off the class.
}

/** Wire the record button. */
export function initTest() {
  document.getElementById('record-btn')?.addEventListener('click', async () => {
    const status = await safeCall('getStatus');
    if (status?.state === 'recording') {
      await safeCall('stopAndTranscribe');
    } else {
      await safeCall('startRecording');
    }
  });
}
