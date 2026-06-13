// SigmaVoice — settings window entry point.
//
// Owns the safe bridge wrapper (window.bridgeVoice) re-exported to every pane
// module, wires the sidebar + lazy pane loading, and fans the live capture
// status out to the panes (Overview badge/toggle/model/hotkey, Capture
// hotkey/mode, Test record button). Degrades gracefully when the bridge is
// absent (e.g. opened outside Electron) — every call becomes a no-op.

// --- Safe API wrapper ------------------------------------------------------
// Every call is guarded: a missing window.bridgeVoice or missing method
// degrades to a no-op / placeholder value rather than throwing.

export const bv = window.bridgeVoice ?? null;

export function hasMethod(name) {
  return bv !== null && typeof bv[name] === 'function';
}

export async function safeCall(name, ...args) {
  if (!hasMethod(name)) return undefined;
  try {
    return await bv[name](...args);
  } catch {
    return undefined;
  }
}

import { showToast } from './toast.js';
import { initSidebar } from './sidebar.js';
import { initOverview, applyOverviewStatus, renderOverviewStats } from './overview.js';
import { initCapture, applyCaptureStatus } from './capture.js';
import { initDictionary, loadDictionary } from './dictionary.js';
import { initUsage, loadStats } from './usage.js';
import { initTest, updateRecordBtn } from './test.js';
import { initCloud, loadCloud } from './cloud.js';

// --- Status fan-out --------------------------------------------------------

function applyStatus(status) {
  if (!status) return;
  applyOverviewStatus(status);
  applyCaptureStatus(status);
  updateRecordBtn(status.state ?? 'idle');
}

// --- Pane activation (lazy data load) --------------------------------------

function onPaneActivate(panel) {
  // Overview + Usage re-fetch on each activation (UX-9); Dictionary loads once
  // (lazy) so unsaved edits aren't discarded when re-selecting the pane.
  if (panel === 'overview') renderOverviewStats();
  if (panel === 'dictionary') loadDictionary();
  if (panel === 'usage') loadStats();
  if (panel === 'cloud') loadCloud();
}

// --- Bootstrap -------------------------------------------------------------

function boot() {
  // Wire pane behaviors first so DOM listeners exist before any activation.
  initOverview();
  initCapture();
  initDictionary();
  initUsage();
  initTest();
  initCloud();

  // Sidebar selection + pane show/hide; fires onPaneActivate for the initial pane.
  initSidebar(onPaneActivate);

  // Toast bridge.
  if (hasMethod('onToast')) {
    bv.onToast(({ message, level }) => showToast(message, level));
  }

  // Initial status + live updates.
  void (async () => {
    const status = await safeCall('getStatus');
    applyStatus(status);
  })();
  if (hasMethod('onStateChange')) {
    bv.onStateChange((status) => applyStatus(status));
  }

  // Bridge-absent degrade notice.
  if (!bv) {
    showToast('SigmaVoice bridge unavailable — some features disabled', 'warn');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
