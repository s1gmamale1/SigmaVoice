// SigmaVoice — Capture pane.
//
// Transcription mode (Local active / Cloud disabled — Cloud is decorative,
// NEVER wired), the model list with size + 'Download required' pill +
// determinate progress bar + Cancel (FE-9, bv.abortDownload), the hotkey input
// + Apply (UX-10 success/fail toast), and the mode segmented control. setHotkey
// returns {ok,error}; undefined (bridge absent / no-op) is treated as success.

import { bv, hasMethod, safeCall } from './settings.js';
import { showToast } from './toast.js';

// --- Mode segmented control ------------------------------------------------

/** Reflect a capture mode into the segmented control + sublabel. */
export function applyMode(mode) {
  const toggleBtn = document.getElementById('mode-toggle-btn');
  const pttBtn = document.getElementById('mode-ptt-btn');
  const sublabel = document.getElementById('mode-sublabel');
  const isToggle = mode === 'toggle';
  toggleBtn?.setAttribute('aria-pressed', String(isToggle));
  pttBtn?.setAttribute('aria-pressed', String(!isToggle));
  if (sublabel) {
    sublabel.textContent = isToggle
      ? 'Tap hotkey to start/stop'
      : 'Hold hotkey while speaking';
  }
}

/** Reflect the latest status onto the Capture surfaces (hotkey + mode). */
export function applyCaptureStatus(status) {
  if (!status) return;
  if (status.hotkey !== undefined) {
    const input = document.getElementById('hotkey-input');
    // Don't clobber the field while the user is mid-edit (a live state event
    // must not wipe an unsaved shortcut they're typing).
    if (input && document.activeElement !== input) input.value = status.hotkey;
  }
  applyMode(status.mode ?? 'toggle');
}

// --- Whisper models: list + download + cancel + set-active -----------------

function fmtSize(m) {
  return (m.sizeMb != null ? m.sizeMb + ' MB' : '') + (m.isDefault ? ' · recommended' : '');
}

function makeBtn(label, cls) {
  const b = document.createElement('button');
  b.className = 'btn ' + (cls || 'btn-ghost');
  b.textContent = label;
  return b;
}

/** Build a determinate progress bar element (0–1 fraction) with ARIA. */
function makeProgress(fraction) {
  const pct = Math.round((fraction || 0) * 100);
  const bar = document.createElement('div');
  bar.className = 'progress';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-valuenow', String(pct));
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  return bar;
}

async function renderModels() {
  const modelListEl = document.getElementById('model-list');
  if (!modelListEl) return;
  if (!hasMethod('listModels')) {
    modelListEl.replaceChildren();
    return;
  }
  let models;
  try {
    models = await bv.listModels();
  } catch {
    models = null;
  }
  modelListEl.replaceChildren();

  if (!Array.isArray(models) || models.length === 0) {
    const p = document.createElement('div');
    p.className = 'row-sublabel model-empty';
    p.textContent = 'No models available.';
    modelListEl.appendChild(p);
    return;
  }

  for (const m of models) {
    const row = document.createElement('div');
    row.className = 'row model-row';

    const left = document.createElement('div');
    left.className = 'model-left';

    const nameRow = document.createElement('div');
    nameRow.className = 'model-name-row';
    const name = document.createElement('span');
    name.className = 'row-label';
    name.textContent = m.name;
    nameRow.appendChild(name);
    const size = document.createElement('span');
    size.className = 'model-size';
    size.textContent = fmtSize(m);
    nameRow.appendChild(size);
    // 'Download required' pill for not-yet-downloaded, not-active models.
    if (!m.downloaded && !m.active) {
      const pill = document.createElement('span');
      pill.className = 'pill pill-required';
      pill.textContent = 'Download required';
      nameRow.appendChild(pill);
    }
    left.appendChild(nameRow);

    const sub = document.createElement('div');
    sub.className = 'row-sublabel';
    sub.id = 'model-sub-' + m.id;
    sub.textContent = m.active ? 'Active' : m.downloaded ? 'Downloaded' : 'Not downloaded';
    left.appendChild(sub);

    // Per-model progress container (populated during a download).
    const prog = document.createElement('div');
    prog.id = 'model-prog-' + m.id;
    prog.className = 'model-prog';
    left.appendChild(prog);

    const right = document.createElement('div');
    right.className = 'model-action';
    right.id = 'model-action-' + m.id;

    if (m.active) {
      const tag = document.createElement('span');
      tag.className = 'pill pill-active';
      tag.textContent = '✓ Active';
      right.appendChild(tag);
    } else if (m.downloaded) {
      const use = makeBtn('Use', 'btn-primary');
      use.addEventListener('click', async () => {
        await safeCall('setModelId', m.id);
        showToast('Active model: ' + m.name);
        renderModels();
      });
      right.appendChild(use);
    } else if (m.downloading) {
      sub.textContent = 'Downloading…';
      prog.replaceChildren(makeProgress(0));
      right.appendChild(makeCancelBtn(m));
    } else {
      const dl = makeBtn('Download', 'btn-primary');
      dl.addEventListener('click', () => startDownload(m));
      right.appendChild(dl);
    }

    row.appendChild(left);
    row.appendChild(right);
    modelListEl.appendChild(row);
  }
}

function makeCancelBtn(m) {
  const cancel = makeBtn('Cancel', 'btn-danger');
  cancel.addEventListener('click', async () => {
    await safeCall('abortDownload', m.id);
    // The aborted state arrives via onModelDownload; this is the user-facing stop.
  });
  return cancel;
}

async function startDownload(m) {
  if (!hasMethod('downloadModel')) return;
  const sub = document.getElementById('model-sub-' + m.id);
  const action = document.getElementById('model-action-' + m.id);
  const prog = document.getElementById('model-prog-' + m.id);
  if (sub) sub.textContent = 'Starting…';
  if (prog) prog.replaceChildren(makeProgress(0));
  if (action) action.replaceChildren(makeCancelBtn(m));
  try {
    const res = await bv.downloadModel(m.id);
    // A user cancel resolves {ok:true, aborted:true} — a clean stop, not an error.
    if (res?.aborted) showToast('Download cancelled');
    else if (res && res.ok === false) {
      showToast('Download failed: ' + (res.error || 'unknown'), 'error');
    }
  } catch {
    showToast('Download failed', 'error');
  }
  renderModels();
}

/** Handle a streamed download-progress event. */
function onDownloadProgress(p) {
  if (!p || !p.modelId) return;
  const sub = document.getElementById('model-sub-' + p.modelId);
  const prog = document.getElementById('model-prog-' + p.modelId);
  if (!sub) return;

  // Terminal states reset the row to its idle layout.
  if (p.aborted) {
    sub.textContent = 'Cancelled';
    if (prog) prog.replaceChildren();
    renderModels();
    return;
  }
  if (p.error) {
    sub.textContent = 'Failed: ' + p.error;
    if (prog) prog.replaceChildren();
    showToast('Download failed: ' + p.error, 'error');
    return;
  }
  if (p.done) {
    sub.textContent = 'Downloaded';
    if (prog) prog.replaceChildren();
    renderModels();
    return;
  }

  // In-flight: prefer the byte counter when totals are known, else the percent.
  const pct = Math.round((p.fraction || 0) * 100);
  if (p.bytesTotal) {
    sub.textContent =
      (p.bytesDone / 1e6).toFixed(0) + ' of ' + (p.bytesTotal / 1e6).toFixed(0) + ' MB';
  } else {
    sub.textContent = 'Downloading… ' + pct + '%';
  }
  if (prog) {
    const existing = prog.querySelector('.progress-fill');
    if (existing) {
      existing.style.width = pct + '%';
      prog.querySelector('.progress')?.setAttribute('aria-valuenow', String(pct));
    } else {
      prog.replaceChildren(makeProgress(p.fraction || 0));
    }
  }
}

/** Wire the Capture pane: hotkey, mode control, model list + download events. */
export function initCapture() {
  // Hotkey Apply — setHotkey returns {ok,error}; undefined → treat as success.
  document.getElementById('hotkey-save-btn')?.addEventListener('click', async () => {
    const input = document.getElementById('hotkey-input');
    const hotkey = (input?.value ?? '').trim();
    if (!hotkey) return;
    if (!hasMethod('setHotkey')) {
      showToast('SigmaVoice bridge unavailable', 'warn');
      return;
    }
    const res = await safeCall('setHotkey', hotkey);
    if (res && res.ok === false) {
      showToast(res.error || 'Could not set shortcut', 'error');
    } else {
      showToast('Hotkey updated');
    }
  });

  // Mode segmented control.
  document.getElementById('mode-toggle-btn')?.addEventListener('click', async () => {
    applyMode('toggle');
    await safeCall('setMode', 'toggle');
  });
  document.getElementById('mode-ptt-btn')?.addEventListener('click', async () => {
    applyMode('push-to-talk');
    await safeCall('setMode', 'push-to-talk');
  });

  // Model list.
  document.getElementById('model-refresh-btn')?.addEventListener('click', renderModels);
  if (hasMethod('onModelDownload')) {
    bv.onModelDownload(onDownloadProgress);
  }
  renderModels();
}
