// SigmaVoice — Dictionary pane (phrases & macros CRUD).
//
// Loads entries from bv.getDictionary(); shows a REAL empty-state (UX-12 — no
// fake placeholder rows) when there are none. Rows are editable; the type chip
// toggles phrase↔macro. On Save, every row is collected, written via
// bv.setDictionary(entries) — which sanitizes + returns the persisted list —
// and any DROPPED rows (submitted minus persisted) are reported in the toast
// (UX-15). Lazy-loaded once so unsaved edits aren't discarded on re-activation.

import { safeCall } from './settings.js';
import { showToast } from './toast.js';

let dictLoaded = false;

/** Load dictionary entries once (first activation). */
export async function loadDictionary() {
  if (dictLoaded) return;
  dictLoaded = true;
  const entries = await safeCall('getDictionary');
  renderDictionary(Array.isArray(entries) ? entries : []);
}

function updateEmptyState() {
  const body = document.getElementById('dict-body');
  const empty = document.getElementById('dict-empty');
  if (!body || !empty) return;
  const hasRows = body.querySelector('tr') !== null;
  empty.style.display = hasRows ? 'none' : 'flex';
}

function renderDictionary(entries) {
  const body = document.getElementById('dict-body');
  if (!body) return;
  body.replaceChildren();
  entries.forEach((entry) => appendDictRow(entry));
  updateEmptyState();
}

function appendDictRow(entry = { pattern: '', replacement: '', type: 'phrase' }) {
  const body = document.getElementById('dict-body');
  if (!body) return;
  const safeType = entry.type === 'macro' ? 'macro' : 'phrase';

  const patternInput = document.createElement('input');
  patternInput.className = 'dict-input';
  patternInput.type = 'text';
  patternInput.value = String(entry.pattern ?? '');
  patternInput.placeholder = 'spoken phrase';
  patternInput.setAttribute('aria-label', 'Spoken phrase');

  const replacementInput = document.createElement('input');
  replacementInput.className = 'dict-input dict-input-replacement';
  replacementInput.type = 'text';
  replacementInput.value = String(entry.replacement ?? '');
  replacementInput.placeholder = 'replacement text';
  replacementInput.setAttribute('aria-label', 'Replacement text');

  const chip = document.createElement('button');
  chip.className = 'type-chip ' + safeType;
  chip.dataset.type = safeType;
  chip.textContent = safeType;
  chip.setAttribute('aria-label', 'Toggle type between phrase and macro');
  chip.title = 'Click to toggle type';
  chip.addEventListener('click', () => {
    const next = chip.dataset.type === 'phrase' ? 'macro' : 'phrase';
    chip.dataset.type = next;
    chip.className = 'type-chip ' + next;
    chip.textContent = next;
  });

  const removeBtn = document.createElement('button');
  removeBtn.className = 'dict-remove-btn';
  removeBtn.textContent = '×';
  removeBtn.setAttribute('aria-label', 'Remove entry');

  const tdPattern = document.createElement('td');
  const tdReplacement = document.createElement('td');
  const tdType = document.createElement('td');
  const tdRemove = document.createElement('td');
  tdPattern.appendChild(patternInput);
  tdReplacement.appendChild(replacementInput);
  tdType.appendChild(chip);
  tdRemove.appendChild(removeBtn);

  const tr = document.createElement('tr');
  tr.appendChild(tdPattern);
  tr.appendChild(tdReplacement);
  tr.appendChild(tdType);
  tr.appendChild(tdRemove);

  removeBtn.addEventListener('click', () => {
    tr.remove();
    updateEmptyState();
  });

  body.appendChild(tr);
}

/** Wire add + save buttons. */
export function initDictionary() {
  document.getElementById('dict-add-btn')?.addEventListener('click', () => {
    appendDictRow({ pattern: '', replacement: '', type: 'phrase' });
    updateEmptyState();
    const rows = document.querySelectorAll('#dict-body tr');
    rows[rows.length - 1]?.querySelector('input')?.focus();
  });

  document.getElementById('dict-save-btn')?.addEventListener('click', async () => {
    const rows = document.querySelectorAll('#dict-body tr');
    const entries = [];
    rows.forEach((row) => {
      const inputs = row.querySelectorAll('input');
      const chip = row.querySelector('.type-chip');
      const pattern = inputs[0]?.value?.trim() ?? '';
      const replacement = inputs[1]?.value ?? '';
      const type = chip?.dataset.type ?? 'phrase';
      if (pattern) entries.push({ pattern, replacement, type });
    });

    // setDictionary returns the sanitized list actually persisted; if the main
    // process dropped any malformed/over-long rows, surface that to the user.
    const persisted = await safeCall('setDictionary', entries);
    if (persisted === undefined) {
      showToast('SigmaVoice bridge unavailable', 'warn');
      return;
    }
    const saved = Array.isArray(persisted) ? persisted.length : entries.length;
    const dropped = Array.isArray(persisted)
      ? Math.max(0, entries.length - persisted.length)
      : 0;

    if (dropped > 0) {
      showToast(
        `Saved ${saved} ${saved === 1 ? 'entry' : 'entries'} — ` +
          `${dropped} ${dropped === 1 ? 'row was' : 'rows were'} dropped (empty or too long)`,
        'warn',
      );
    } else {
      showToast(`Saved ${saved} ${saved === 1 ? 'entry' : 'entries'}`);
    }
  });
}
