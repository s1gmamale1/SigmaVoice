// SigmaVoice — Cloud pane (ADR-007): remote STT + OpenRouter cleanup config.
import { bv, safeCall } from './settings.js';
import { showToast } from './toast.js';

function $(id) { return document.getElementById(id); }
function show(el, on) { if (el) el.hidden = !on; }

async function loadRemoteStt() {
  const cfg = await safeCall('getRemoteSttConfig');
  const toggle = $('stt-remote-toggle');
  if (cfg && toggle) {
    toggle.checked = !!cfg.enabled;
    toggle.setAttribute('aria-checked', String(!!cfg.enabled));
    $('stt-url').value = cfg.baseUrl ?? '';
    $('stt-model').value = cfg.model ?? '';
    show($('stt-remote-fields'), !!cfg.enabled);
  }
}

async function saveRemoteStt() {
  const res = await safeCall('setRemoteSttConfig', {
    enabled: $('stt-remote-toggle').checked,
    baseUrl: $('stt-url').value,
    model: $('stt-model').value,
    apiKey: $('stt-key').value,
  });
  if (res && res.ok === false) showToast(res.error || 'Could not save', 'error');
  else { showToast('Remote transcription saved'); $('stt-key').value = ''; }
}

async function loadTransform() {
  const cfg = await safeCall('getTransformConfig');
  if (cfg) {
    const on = cfg.mode === 'openrouter';
    const toggle = $('tf-toggle');
    if (toggle) { toggle.checked = on; toggle.setAttribute('aria-checked', String(on)); }
    show($('tf-fields'), on);
    $('tf-model').value = cfg.model;
    $('tf-preset').value = cfg.preset;
    $('tf-prompt').value = cfg.prompt ?? '';
    show($('tf-prompt-row'), cfg.preset === 'custom');
  }
  const keyState = await safeCall('hasOpenRouterKey');
  const status = $('tf-key-status');
  if (status && keyState) {
    status.textContent = keyState.hasKey
      ? (keyState.encrypted ? 'Key set ✓ (encrypted)' : 'Key set ✓ (stored unencrypted — no OS keyring)')
      : 'No key set.';
  }
}

async function saveTransform() {
  const newKey = $('tf-key').value.trim();
  if (newKey) {
    const kr = await safeCall('setOpenRouterKey', newKey);
    if (kr && kr.ok === false) { showToast(kr.error || 'Could not store key', 'error'); return; }
    $('tf-key').value = '';
  }
  const res = await safeCall('setTransformConfig', {
    mode: $('tf-toggle').checked ? 'openrouter' : 'off',
    model: $('tf-model').value,
    preset: $('tf-preset').value,
    prompt: $('tf-prompt').value,
  });
  if (res && res.ok === false) showToast(res.error || 'Could not save', 'error');
  else showToast('AI cleanup saved');
  loadTransform();
}

export function initCloud() {
  $('stt-remote-toggle')?.addEventListener('change', (e) => show($('stt-remote-fields'), e.target.checked));
  $('stt-save-btn')?.addEventListener('click', saveRemoteStt);
  $('tf-toggle')?.addEventListener('change', (e) => show($('tf-fields'), e.target.checked));
  $('tf-preset')?.addEventListener('change', (e) => show($('tf-prompt-row'), e.target.value === 'custom'));
  $('tf-save-btn')?.addEventListener('click', saveTransform);
}

/** Lazy-load on pane activation (re-reads persisted config). */
export function loadCloud() { void loadRemoteStt(); void loadTransform(); }
