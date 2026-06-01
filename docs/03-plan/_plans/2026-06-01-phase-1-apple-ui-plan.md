# Phase 1 — Apple-grade UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Executed as
> parallel worktree slices → central integrate + gate + Playwright + review. Steps use `- [ ]` tracking.
> Spec: [`2026-06-01-phase-1-apple-ui-design.md`](./2026-06-01-phase-1-apple-ui-design.md). Branch `feat/phase-1-ui`.

**Goal:** Restyle the SigmaVoice settings window into a macOS-sidebar app that adapts to system light/dark
with real vibrancy + cards/Overview, and make the recording HUD's animation honest — all app-shell.

**Architecture:** Split the monolithic `renderer/settings.html` into `settings.html`+`settings.css`+ES-module
`js/*` (CA-2); add a left sidebar nav + light/dark token set + window vibrancy; restyle panes; tighten CSP to
`script-src 'self'`. HUD: replace the fake EQ with an honest "listening" pulse + states. New pure `src/keycaps.ts`.

**Tech Stack:** Electron 30, vanilla HTML/CSS/ES-modules (no framework), `node --test` (native TS), Playwright MCP (visual verify).

**Verification reality:** the gate is `pnpm typecheck`+`pnpm test`+`pnpm build`; **visual** correctness is
checked with the Playwright MCP (serve `renderer/` over `http://127.0.0.1:<port>`, load each page, `emulate`
`prefers-color-scheme: light` AND `dark`, screenshot + read console for CSP/JS errors). `file://` is blocked by
the Playwright MCP — serve over a local http server (transport-independent for CSP `<meta>`/layout).

---

## File structure (decomposition)
- `src/keycaps.ts` (new, pure) — `formatAccelerator(accel) → glyphs`. `src/keycaps.test.ts` (new).
- `src/main.ts` (mod) — window flags (hiddenInset/vibrancy/min/size); tray label via `formatAccelerator`.
- `renderer/settings.html` (rewrite) — markup only (sidebar + panes).
- `renderer/settings.css` (new) — tokens + light/dark + all styles.
- `renderer/js/{settings,sidebar,overview,capture,dictionary,usage,test,toast,keycaps}.js` (new) — split logic.
- `renderer/hud.html` (mod) + `src/hud-window.ts` (mod) — honest animation + states + ARIA.

---

## Task 1 — `src/keycaps.ts` (pure, full TDD) · Slice D
**Files:** Create `src/keycaps.ts`, `src/keycaps.test.ts`. Contract used by Task 2 (tray) + Task 4 (renderer mirror).

- [ ] **Step 1 — failing test** `src/keycaps.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAccelerator } from './keycaps.ts';

test('maps the default accelerator to glyphs', () => {
  assert.equal(formatAccelerator('CommandOrControl+Alt+Space'), '⌘ ⌥ ␣');
});
test('uppercases letter keys + maps modifiers', () => {
  assert.equal(formatAccelerator('Cmd+Shift+a'), '⌘ ⇧ A');
});
test('passes punctuation keys through', () => {
  assert.equal(formatAccelerator('Ctrl+/'), '⌃ /');
});
test('empty string → empty', () => { assert.equal(formatAccelerator(''), ''); });
```
- [ ] **Step 2 — run, expect FAIL** `pnpm test` → fails (no module).
- [ ] **Step 3 — implement** `src/keycaps.ts`:
```ts
const GLYPHS: Record<string, string> = {
  CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Super: '⌘', Meta: '⌘',
  Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', AltGr: '⌥', Shift: '⇧',
  Space: '␣', Tab: '⇥', Backspace: '⌫', Delete: '⌦', Return: '↩', Enter: '↩',
  Escape: '⎋', Esc: '⎋', Up: '↑', Down: '↓', Left: '←', Right: '→', Plus: '+',
};
/** Render an Electron accelerator string as macOS keycap glyphs (e.g. "⌘ ⌥ ␣"). */
export function formatAccelerator(accel: string): string {
  if (!accel) return '';
  return accel.split('+').map((t) => GLYPHS[t] ?? (t.length === 1 ? t.toUpperCase() : t)).join(' ');
}
```
- [ ] **Step 4 — run, expect PASS** `pnpm test`.
- [ ] **Step 5 — commit** `git add src/keycaps.ts src/keycaps.test.ts && git commit -m "feat(keycaps): accelerator→glyph formatter (+tests)"`

## Task 2 — Window chrome + tray keycaps (`src/main.ts`) · Slice A
**Files:** Modify `src/main.ts` (openSettingsWindow webPreferences/flags; tray label).
- [ ] Add to `openSettingsWindow()` BrowserWindow opts: `titleBarStyle: 'hiddenInset'`, `vibrancy: 'sidebar'`, `transparent: true`, `backgroundColor: '#00000000'`, `width: 720, height: 560, minWidth: 680, minHeight: 520`. Keep `sandbox:true` + nav handlers + the ready-to-show focus.
- [ ] Import `formatAccelerator` from `./keycaps`; in `buildTrayMenu()` render the hotkey in the "Start recording (…)" label via `formatAccelerator(status.hotkey)`.
- [ ] **Verify:** `pnpm typecheck` + `pnpm build` = 0. (Window vibrancy itself needs on-device; that's operator smoke.)
- [ ] **Commit** `feat(phase-1): settings window hiddenInset + sidebar vibrancy + tray keycaps`.

## Task 3 — HUD honest animation + states (`renderer/hud.html`, `src/hud-window.ts`) · Slice C
**Files:** Modify `renderer/hud.html` (remove fake EQ; add honest pulse + states + ARIA live-text + spring), `src/hud-window.ts` (extend `HudState`).
- [ ] In `src/hud-window.ts`: extend `export type HudState = 'recording' | 'transcribing' | 'error' | 'no-input' | 'done';` (renderer renders all; `syncHud` keeps driving recording/transcribing — the new states are render-ready for future engine signals).
- [ ] In `renderer/hud.html`: delete the `.eq`/`eq-bounce` fake equalizer; replace with an **honest indeterminate "listening" element** — a single calm breathing/pulsing waveform-glyph that does NOT vary with (absent) audio. Add CSS for `[data-state="error"]` (red ⚠ + "Mic unavailable"), `[data-state="no-input"]` (dim hint), `[data-state="done"]` (brief check flash). Keep `prefers-reduced-motion`. Add a visually-hidden `<span>` updated in `applyState()` to announce the state (`Recording` / `Transcribing…` / `Mic unavailable` / `Done`).
- [ ] Spring entrance: replace the `hud-in` cubic-bezier with a CSS `linear()` spring approximation.
- [ ] **Verify (Playwright):** serve `renderer/`, load `hud.html`, screenshot; toggle `data-state` via `evaluate` to confirm each state renders + the live-text updates; console clean.
- [ ] **Verify gate** + **Commit** `feat(phase-1): honest HUD listening animation + error/no-input/done states + ARIA`.

## Task 4 — Settings restyle + split + light/dark + sidebar (`renderer/*`) · Slice B  ← the big one
**Files:** Rewrite `renderer/settings.html`; create `renderer/settings.css` + `renderer/js/{settings,sidebar,overview,capture,dictionary,usage,test,toast,keycaps}.js`. Modify the CSP meta.
This is a craft+verify loop, not line-by-line dictation. Required outcomes (each is acceptance-checked via Playwright):
- [ ] **Split:** move ALL CSS → `settings.css`; ALL the inline `<script type=module>` logic → ES modules under `js/` (one responsibility each); `settings.html` is markup + `<link rel="stylesheet" href="./settings.css">` + `<script type="module" src="./js/settings.js">`. **Preserve every existing behavior + every `bv:*` call** (status sync, hotkey/mode/model incl. the shipped download progress+Cancel, dictionary CRUD incl. the Phase-0 real empty-state + dropped-row report, stats, toasts, the bridge-absent `safeCall` degrade). No file >500 lines.
- [ ] **CSP:** update both `renderer/*.html` CSP meta to `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'` (external scripts now allow `'self'`; keep `'unsafe-inline'` for any inline style attributes, or move them to classes).
- [ ] **Sidebar layout:** left rail ~170px with icon(inline SVG)+label rows (Overview · Capture · Dictionary · Usage · Test); content pane right; rail header is the drag region (`-webkit-app-region: drag`) so traffic lights sit cleanly. `sidebar.js` handles selection + pane show/hide + ARIA `role=tab`/`aria-selected` (or `aria-current`).
- [ ] **Light/dark:** keep the dark `:root`; add `@media (prefers-color-scheme: light)` overriding tokens to a light palette (bg ~#f2f2f7, surfaces near-white, `--accent` #007aff). Body transparent so vibrancy shows. Keep reduced-transparency/motion media queries.
- [ ] **Overview pane** (`overview.js`): hero stat cards Words / Sessions / Avg WPM (from `bv.getStats()` → `{totalWords,recordings,avgWpm,recent}`), state badge + Enable toggle, active model name, hotkey as `<kbd>` keycaps (via `js/keycaps.js`, a plain-JS mirror of `src/keycaps.ts`), and a recent-activity list from `recent`.
- [ ] **Capture pane** (`capture.js`): Local (active) + Cloud (disabled, "Coming soon") selectable cards w/ capability chips; model rows w/ size + "Download required" pill + the existing progress bar + Cancel; hotkey input + mode segmented control.
- [ ] **Tokens/polish:** 44pt min hit targets; 8pt spacing scale; `linear()` spring on transitions + the toggle thumb; single-meaning accent (green only for the macOS switch, blue elsewhere — fix UX-16); `:focus-visible` rings preserved.
- [ ] **Verify (Playwright, REQUIRED):** serve `renderer/`; load `settings.html`; `emulate` `prefers-color-scheme:light` then `dark`; screenshot each; click each sidebar item and confirm the pane switches; read console — **zero CSP violations / JS errors** (bridge-absent degrade is expected, not an error). Iterate CSS until both modes look clean + balanced.
- [ ] **Verify gate** (`typecheck`/`test`/`build` = 0) + **Commit** `feat(phase-1): macOS sidebar settings, light+dark, cards/Overview, split + CSP self (CA-2)`.

---

## Self-review (plan vs spec)
- Spec §A window → Task 2 ✓ · §B restyle+split+CSP+light/dark+sidebar+Overview+Capture+polish → Task 4 ✓ ·
  §C HUD → Task 3 ✓ · §D keycaps → Task 1 (+ renderer mirror in Task 4) ✓. Verification (Playwright light+dark,
  gate, keycap test) present in each task ✓.
- Deferred per spec (ENG-5 real levels, FE-1 permission status, Speaking-Time, real Cloud) — correctly NOT in any task.
- Contract consistency: `formatAccelerator` (Task 1) used by Task 2 (TS import) + Task 4 (JS mirror) ✓.
- No code placeholders in the pure-logic task (Task 1 fully coded); UI tasks are acceptance+verify-driven by design (visual craft + Playwright), which is the correct granularity for a restyle.
