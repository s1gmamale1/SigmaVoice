// SigmaVoice — toast notifications.
//
// A single fixed toast element shows transient info/warn/error messages.
// Auto-dismisses after 4s; rapid successive calls reset the timer + re-trigger
// the transition via a forced reflow.

let toastTimer = null;

/**
 * Show a toast.
 * @param {string} message  Text to display.
 * @param {'info'|'warn'|'error'} [level]  Severity (defaults to 'info').
 */
export function showToast(message, level = 'info') {
  const el = document.getElementById('toast');
  const txt = document.getElementById('toast-text');
  if (!el || !txt) return;
  clearTimeout(toastTimer);
  txt.textContent = message;
  el.className = 'toast ' + level;
  // Force reflow so the transition fires even on rapid successive calls.
  void el.offsetWidth;
  el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), 4000);
}
