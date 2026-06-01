# Phase 1 — Apple-grade UI/UX · design spec

**Approved 2026-06-01.** Branch `feat/phase-1-ui` (off `main` @ `dcf4059`). Implements ROADMAP **Phase 1**
+ folds in **CA-2** (split `settings.html`). Evidence: [`_research/codebase-findings.md`](../_research/codebase-findings.md) §B.
Direction (operator-approved): **full Cupertino restyle · system light+dark · macOS sidebar nav · honest HUD listening animation.**

## Goal
The settings window and recording HUD look and behave Apple-grade — a macOS sidebar layout that adapts to
system light/dark with real window vibrancy, selectable cards + capability chips, an Overview dashboard,
44pt targets, keycap glyphs, spring motion, and a recording HUD that never lies about audio.

## Non-goals / deferred
- **Real audio-level HUD bars** → needs an engine signal (**ENG-5**, SigmaLink). Phase 1 ships an *honest
  indeterminate* "listening" animation only.
- **Live permission-grant status** in Overview → that's onboarding (**FE-1**, Phase 2). Overview uses only
  data already exposed by `bv:getStatus`/`bv:listModels`/`bv:getStats`.
- **"Speaking Time" stat** → `getStatsSummary` exposes `totalWords`/`recordings`/`avgWpm` only; Speaking-Time
  needs an engine stat → defer. Ship 3 hero cards (Words / Sessions / Avg WPM).
- Cloud/Local card is **visual only** (the Cloud option itself is ADR-1 / Phase 4). Show Local as active; Cloud
  as a disabled "coming soon" card so the card UI is built without enabling cloud.

## Architecture

### A. Window chrome (`src/main.ts`)
- `openSettingsWindow()` webPreferences/flags: `titleBarStyle:'hiddenInset'`, `vibrancy:'sidebar'`,
  `backgroundColor:'#00000000'`, `transparent` body via CSS, `minWidth:680`, `minHeight:520`, default `720×560`.
  Keep `sandbox:true` + nav handlers (Phase 0). Remove the renderer custom `.titlebar`; traffic lights overlay
  a slim draggable top strip (`-webkit-app-region: drag` on the sidebar header).

### B. Settings renderer — restyle + split (CA-2)
Split the monolith into (all under `renderer/`, shipped via `renderer/**/*`, loaded over `file://`):
- `settings.html` — markup only: sidebar rail + content panes.
- `settings.css` — all styles + design tokens + `@media (prefers-color-scheme: light)` + `prefers-reduced-motion/-transparency`.
- ES-module JS (`<script type="module" src="./js/settings.js">`): `js/settings.js` (bootstrap + bridge `safeCall`),
  `js/sidebar.js` (rail nav + pane switching), `js/overview.js`, `js/capture.js` (hotkey/mode/model cards),
  `js/dictionary.js`, `js/usage.js`, `js/test.js`, `js/toast.js`, `js/keycaps.js` (accelerator→glyphs).
- **CSP tightened** (SEC-1): external scripts let `script-src 'self'` replace `'unsafe-inline'` (keep
  `style-src 'unsafe-inline'` for inline-style attrs, or move them to classes). Verify via Playwright (no CSP errors).
- **Layout:** left sidebar ~170px (icon+label rows: Overview · Capture · Dictionary · Usage · Test; inline SVG
  glyphs), content pane right. **Overview** = hero stat cards (Words/Sessions/Avg-WPM) + state badge + Enable
  toggle + active model + **hotkey as ⌘⌥⎵ `<kbd>` keycaps** + recent-activity feed. **Capture** = Local(active)/
  Cloud(disabled "soon") selectable cards w/ capability chips, model rows w/ size + "Download required" pill +
  the (shipped) progress bar/Cancel. Preserve ALL existing IPC wiring + behavior (status sync, model dl,
  dictionary CRUD incl. the Phase-0 empty-state, stats, toasts).
- **Tokens/polish:** systemBlue accent; fix green-overload (UX-16); 44pt hit targets (UX-4); 8pt spacing (UX-14);
  CSS `linear()` spring on transitions + toggle (UX-7); keep dark + add light (UX-2).

### C. Recording HUD (`renderer/hud.html`, `src/hud-window.ts`)
- Replace the fake equalizer with an **honest indeterminate "listening" breathing pulse** (a single calm
  pulsing element — NOT bars impersonating levels). Add **error** (red ⚠ "Mic unavailable"), **no-input** (dim
  hint), **done** (brief check flash) states. Extend `HudState` accordingly; `syncHud` already centralizes the
  mapping. Visually-hidden **ARIA live-text** updated per state (UX-20). Spring entrance (UX-7).
- Renderer-only; richer triggers (real error/no-input/level) need engine signals → deferred (ENG-5).

### D. Shared pure module (`src/keycaps.ts` + test)
- `formatAccelerator(s): string` → maps `CommandOrControl/Cmd/Ctrl/Alt/Option/Shift/Super/Meta` + key → `⌘⌥⌃⇧⎵`
  glyphs. Used by `main.ts` (tray label) + mirrored in `renderer/js/keycaps.js` for the Overview (renderer can't
  import `src/*.ts`). Unit-tested (`src/keycaps.test.ts`).

## Data flow
Unchanged `bv:*` IPC. No new IPC this phase. The restyle is renderer + window flags + the keycap formatter.

## Testing / verification (no device)
- **Playwright** (the only visual check available): render `settings.html` + `hud.html` in **light AND dark**
  (`emulate`/`prefers-color-scheme`), confirm layout renders, sidebar nav switches panes, no console/CSP errors,
  inline scripts→external scripts load.
- **Gate:** `pnpm typecheck` + `pnpm test` + `pnpm build` = 0.
- **Unit:** `src/keycaps.test.ts` (formatter).

## Execution (subagent-driven, parallel worktree slices → central integrate)
- **Slice A** — `src/main.ts` window flags + tray-label keycaps (imports `src/keycaps.ts`).
- **Slice B** — the big one: `renderer/` settings restyle + split + `settings.css` + `js/*` modules + light/dark +
  cards/chips/sidebar/Overview + CSP tighten. Self-verify with Playwright (light+dark) in-worktree.
- **Slice C** — `renderer/hud.html` + `src/hud-window.ts` honest animation + states + ARIA.
- **Slice D** — `src/keycaps.ts` + `src/keycaps.test.ts` (pure; A & B depend on the contract `formatAccelerator`).
- Disjoint files; pin the keycap contract. Central: integrate → gate → Playwright (light+dark) → spec+quality
  review → fix → commit on `feat/phase-1-ui`.

## Definition of done
Settings renders as a macOS sidebar app that follows system light/dark with real vibrancy; all 5 panes work
with existing behavior intact; Overview shows Words/Sessions/WPM + keycap hotkey; Capture shows cards+chips;
targets ≥44pt; CSP is `script-src 'self'`; the HUD shows an honest (non-faked) listening animation + error/
no-input/done states with correct ARIA; Playwright confirms light+dark render clean; `pnpm typecheck`+`test`+
`build` green; `settings.html` is split (no file >500 lines). On-device smoke remains operator-owned.
