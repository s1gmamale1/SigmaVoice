// SigmaVoice — Usage pane (all-time stats + recent activity).
//
// Re-fetches on every activation (UX-9: the pane controller calls loadStats()
// each time the Usage rail item is selected — getStats is a cheap sync KV read).
// Also exports fmtNum/fmtTime, the shared number/time formatters used here and
// by the Overview pane.

import { safeCall } from './settings.js';
import { showToast } from './toast.js';

/** Locale-grouped integer (e.g. 1,234). */
export function fmtNum(n) {
  return Number(n).toLocaleString();
}

/** Relative-then-absolute timestamp formatting for the recent list. */
export function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + 'm ago';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + 'h ago';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderStats(stats) {
  const words = stats?.totalWords ?? null;
  const recordings = stats?.recordings ?? null;
  const avgWpm = stats?.avgWpm ?? null;
  const recent = stats?.recent ?? [];

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('stat-words', words != null ? fmtNum(words) : '—');
  set('stat-recordings', recordings != null ? fmtNum(recordings) : '—');
  set('stat-wpm', avgWpm != null ? Math.round(avgWpm) : '—');

  const card = document.getElementById('recent-card');
  const empty = document.getElementById('recent-empty');
  if (!card || !empty) return;

  card.querySelectorAll('.recent-row').forEach((r) => r.remove());

  if (!recent.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  recent.slice(0, 8).forEach((rec) => {
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
    card.appendChild(row);
  });
}

async function fetchAndRenderStats() {
  const stats = await safeCall('getStats');
  renderStats(stats);
}

/** Re-fetch + render the stats (called on each Usage activation — UX-9). */
export async function loadStats() {
  await fetchAndRenderStats();
}

/** Wire the manual Refresh button. */
export function initUsage() {
  document.getElementById('stats-refresh-btn')?.addEventListener('click', async () => {
    await fetchAndRenderStats();
    showToast('Stats refreshed');
  });
}
