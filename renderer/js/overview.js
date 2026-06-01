// SigmaVoice — Overview pane.
//
// Hero stat cards (Words / Sessions / Avg WPM), the state badge + Enable
// toggle, the active model name, the hotkey rendered as <kbd> keycap glyphs,
// and a 'Recent activity' list. Stats come from bv.getStats(); status comes
// from applyStatus() (driven by getStatus + live onStateChange). getStatus only
// exposes modelId — we resolve a friendly name from bv.listModels() (cached),
// falling back to the id, then to 'macOS Speech'.

import { hasMethod, safeCall } from './settings.js';
import { acceleratorTokens } from './keycaps.js';
import { fmtNum, fmtTime } from './usage.js';

// modelId → display name, lazily populated from listModels().
let modelNames = null;
let lastModelId = null;

async function ensureModelNames() {
  if (modelNames || !hasMethod('listModels')) return;
  const models = await safeCall('listModels');
  if (Array.isArray(models)) {
    modelNames = new Map(models.map((m) => [m.id, m.name]));
    // Re-resolve the label now that names are known.
    if (lastModelId !== null) setModelLabel(lastModelId);
  }
}

function setModelLabel(modelId) {
  const el = document.getElementById('overview-model');
  if (!el) return;
  const name = modelId && modelNames ? modelNames.get(modelId) : null;
  el.textContent = name || modelId || 'macOS Speech';
}

/** Render the hotkey as keycap <kbd> glyphs into the given container. */
function renderHotkeyCaps(accel) {
  const wrap = document.getElementById('overview-hotkey');
  if (!wrap) return;
  wrap.replaceChildren();
  const tokens = acceleratorTokens(accel);
  if (!tokens.length) {
    const none = document.createElement('span');
    none.className = 'kbd-none';
    none.textContent = 'Not set';
    wrap.appendChild(none);
    return;
  }
  tokens.forEach((t) => {
    const kbd = document.createElement('kbd');
    kbd.className = 'kbd';
    kbd.textContent = t;
    wrap.appendChild(kbd);
  });
}

/** Apply the latest status to the Overview surfaces (badge, toggle, model, hotkey). */
export function applyOverviewStatus(status) {
  if (!status) return;

  const state = status.state ?? 'idle';
  const badge = document.getElementById('state-badge');
  const text = document.getElementById('state-text');
  if (badge && text) {
    badge.className = 'state-badge ' + state;
    text.textContent = state;
  }

  const toggle = document.getElementById('enabled-toggle');
  if (toggle) {
    toggle.checked = !!status.enabled;
    toggle.setAttribute('aria-checked', String(!!status.enabled));
  }

  lastModelId = status.modelId ?? null;
  setModelLabel(lastModelId);
  void ensureModelNames();

  if (status.hotkey !== undefined) renderHotkeyCaps(status.hotkey);
}

/** Fetch + render the hero stats and recent-activity list. */
export async function renderOverviewStats() {
  const stats = await safeCall('getStats');
  const words = stats?.totalWords ?? null;
  const recordings = stats?.recordings ?? null;
  const avgWpm = stats?.avgWpm ?? null;
  const recent = stats?.recent ?? [];

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('hero-words', words != null ? fmtNum(words) : '—');
  set('hero-sessions', recordings != null ? fmtNum(recordings) : '—');
  set('hero-wpm', avgWpm != null ? Math.round(avgWpm) : '—');

  const list = document.getElementById('overview-recent');
  const empty = document.getElementById('overview-recent-empty');
  if (!list || !empty) return;

  list.querySelectorAll('.recent-row').forEach((r) => r.remove());

  if (!recent.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  recent.slice(0, 5).forEach((rec) => {
    const row = document.createElement('div');
    row.className = 'recent-row';

    const timeEl = document.createElement('span');
    timeEl.className = 'recent-time';
    timeEl.textContent = fmtTime(rec.timestamp);

    const wordsEl = document.createElement('span');
    wordsEl.className = 'recent-words';
    wordsEl.textContent = fmtNum(rec.words ?? 0) + ' words';

    const wpmEl = document.createElement('span');
    wpmEl.className = 'recent-wpm';
    wpmEl.textContent = Math.round(rec.wpm ?? 0) + ' wpm';

    row.appendChild(timeEl);
    row.appendChild(wordsEl);
    row.appendChild(wpmEl);
    list.appendChild(row);
  });
}

/** Wire the Enable toggle. */
export function initOverview() {
  const toggle = document.getElementById('enabled-toggle');
  toggle?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    e.target.setAttribute('aria-checked', String(enabled));
    await safeCall('setEnabled', enabled);
  });
}
