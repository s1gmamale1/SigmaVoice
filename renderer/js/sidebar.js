// SigmaVoice — sidebar rail navigation.
//
// macOS-style left rail: clicking an item selects it, shows the matching pane,
// and updates ARIA (role=tab / aria-selected + aria-current). Arrow keys move
// between items. A per-pane activation callback lets panes lazily (re-)load
// their data when first shown / re-shown.

/**
 * Wire up the sidebar.
 * @param {(panel: string) => void} onActivate  Called with the panel id each
 *        time a pane becomes active (including programmatic activation).
 */
export function initSidebar(onActivate) {
  const items = Array.from(document.querySelectorAll('.rail-item'));
  const panes = Array.from(document.querySelectorAll('.pane'));

  function activate(itemEl, { focus = false } = {}) {
    if (!itemEl) return;
    items.forEach((it) => {
      const isTarget = it === itemEl;
      it.setAttribute('aria-selected', isTarget ? 'true' : 'false');
      if (isTarget) it.setAttribute('aria-current', 'page');
      else it.removeAttribute('aria-current');
      it.tabIndex = isTarget ? 0 : -1;
    });
    const targetPaneId = itemEl.getAttribute('aria-controls');
    panes.forEach((p) => p.classList.toggle('active', p.id === targetPaneId));
    if (focus) itemEl.focus();
    onActivate?.(itemEl.dataset.panel);
  }

  items.forEach((item) => {
    item.addEventListener('click', () => activate(item));
    item.addEventListener('keydown', (e) => {
      const idx = items.indexOf(e.currentTarget);
      let next = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (idx + 1) % items.length;
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = items.length - 1;
      if (next !== -1) {
        e.preventDefault();
        activate(items[next], { focus: true });
      }
    });
  });

  // Activate the initially-selected item (or the first) without focusing.
  const initial = items.find((it) => it.getAttribute('aria-selected') === 'true') ?? items[0];
  activate(initial);
}
