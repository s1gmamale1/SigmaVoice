# SigmaVoice — Master Memory

Long-form record of the standalone SigmaVoice app. Pair with [`memory_index.md`](memory_index.md)
for the compact task table. The authoritative product history is **GitHub Releases**; this file
is the narrative + decisions that aren't obvious from git.

## Mission

A standalone, local-first, **system-wide voice→text dictation** app for macOS (Apple Silicon):
global hotkey → on-device Whisper → paste into any focused app. Tray-only, unsigned/internal-use,
free + private. Inspired by BridgeMind's BridgeVoice; the differentiator is local-by-default (no
cloud, no account, no paywall). Windows x64 is a target but currently blocked (W-SV1).

## Topology

```
SigmaVoice/                  ← this repo (the app shell + release home)
├── src/ renderer/ scripts/  app shell (main, hotkey, HUD, KV, preloads, settings/HUD HTML, build)
├── electron-builder.yml      DMG (mac arm64) / NSIS (win x64); unsigned; npmRebuild:false
├── .github/workflows/        ci.yml (typecheck+bundle gate) · release.yml (v* → installers)
├── docs/                     03-plan/{WISHLIST,ROADMAP} · 04-design/native-gotchas · 08-bugs/OPEN
│                             · 10-memory/{master_memory,memory_index} · ddd/DOMAINS · HANDOFF
└── sigmalink/                git submodule = the voice ENGINE (voice-core + native/voice-*)
```

## Engine boundary (the load-bearing decision)

The voice engine + native modules are **shared with SigmaLink** and consumed via the `./sigmalink/`
git submodule + pnpm `link:` deps — `voice-core` is the single source of truth, never vendored.
This repo owns the **app shell**; engine/native code is authored in SigmaLink and pulled in by
bumping the submodule pointer. **Both open bugs (W-SV1, W-SV2) are engine/native → fixed in SigmaLink.**
The submodule choice (over vendoring/copying) was deliberate: a prior voice-code duplication in
SigmaLink (the "voice-core dead tree") shipped inert features to prod — single-source avoids that.

## Decisions
- **2026-05-29 — Standalone app realized.** Relocated `SigmaLink/app/apps/sigma-voice` → top-level
  `SigmaLink/sigma-voice/`, then published to its own repo consuming the engine via submodule.
  Shipped macOS arm64 DMG + `curl|bash` installer.
- **2026-05-29 — Dev home moved to this repo.** App-shell development happens here now (was in
  `SigmaLink/sigma-voice/`, mirrored). Engine remains authored in SigmaLink. See `docs/HANDOFF.md`.
- **macOS target is arm64-only** (per the SigmaLink macOS-arm64 ADR) — also avoids an x64 whisper.cpp
  cross-compile in CI.
- **Unsigned posture** stands (mac ad-hoc + afterSign codesign; win no Authenticode). Signing needs an ADR.

## 2026-06-04 — Phase 1.5: hold-to-talk PTT + floating pill (merged to `main`, not yet released)
- **Trigger.** An operator on-device test reported 4 symptoms. Root-caused (4 parallel agents + device
  forensics): the installed app was **v0.3.1 — two releases behind `main`**. The record-start crash
  (voice-mac 44.1kHz tap) and the model-download were **already fixed on `main`** (ship-only); only two
  were genuine open gaps → built here. Lesson saved: verify the INSTALLED build before assuming a
  regression (installed ≠ HEAD). Findings: `docs/03-plan/WISHLIST.md` §Deep review (2026-06-04).
- **Shipped to `main`** (merge `d55fbcf`, gate-green **42 tests**): (b) **modifier hold-to-talk PTT** —
  hold a bare-modifier combo (⌘⇧) to talk; `node-global-key-listener` owns BOTH edges via a 250 ms
  hold-delay state machine (Electron `globalShortcut` can't bind a bare modifier — **ADR-006**); a
  **record-shortcut capture UI** replaced the raw accelerator text field. (d) An always-visible
  **floating pill** (FE-2) — the focus-preserving HUD made persistent with an idle state, single-click
  to dictate, drag-to-move + KV-persisted (clamped) position, + a **Logo&text ↔ Logo-only** appearance
  toggle (FE-13). Pill ON by default. New pure modules: `pill-geometry.ts`, `pill.ts` (helpers tested),
  `model-ipc.ts`.
- **Review.** Two sub-agent reviews (`/sigma-pr-review` + `/github-code-review`). Round 1: gh CHANGES
  REQUESTED — a [major] bug (the pill click started recording even when capture was *disabled* → now
  gated on `st.enabled`) + main.ts >500. Fixed (extract pill/model IPC → main.ts 498; clamp the live
  drag; +tests) → re-review: **both APPROVE** (sigma merge-gate **93/100**). App-shell only; no new deps.
- **State:** `main` ahead of `origin` (unpushed, operator-gated). Pending: **push** + **on-device smoke**
  (hold ⌘⇧ + Input-Monitoring grant; pill renders / click-dictates / drags / no focus-steal; paste) before release.

## 2026-06-01 — Phase 1: Apple-grade UI/UX (merged to `main`, not yet released)
- **Shipped to `main`** (merge `422c8d2`, gate-green 20 tests, spec+quality reviewed/no-regressions, Playwright
  light+dark + 5 HUD states): settings restyled to a **macOS sidebar** app that follows **system light/dark**
  with real `vibrancy:'sidebar'`+`hiddenInset`; selectable cards+capability chips (Local active / Cloud "soon");
  an **Overview** dashboard (Words/Sessions/WPM + hotkey as ⌘⌥⎵ keycaps); 44pt targets, `linear()` springs,
  single-meaning accent. HUD: the **fake equalizer is gone** → honest breathing "listening" wave + error/no-input/
  done states + ARIA. **CA-2** done: `settings.html` (1390) split → `settings.html`+`settings.css`+9 `js/*` ES
  modules (all <500); CSP tightened to `script-src 'self'`. New pure `src/keycaps.ts` (`formatAccelerator`, tested).
- **Process learning (recorded in Ruflo `patterns`):** the Workflow tool's `isolation:'worktree'` branches from a
  **stale base** (session-start commit), not current HEAD — its first Phase-1 pass edited pre-Phase-0 files and
  would have reverted Phase 0. Caught before integration; **redid on the correct base via a single main-tree agent**
  (full gate+Playwright), using the stale worktree outputs only as design reference. For work that builds on
  committed changes, prefer a single/sequential main-tree agent over parallel worktree slices, or verify the
  worktree base first.
- **State:** `main` is ahead of `origin` (unpushed, operator can't push yet). Still pending: **push** + an
  **on-device smoke** (vibrancy/tray/sandbox/paste — not headless-verifiable) before any release/tag.

## 2026-05-31 — Deep-dive analysis → Phase 0 + test harness + security (branch, not yet released)
- **Analysis.** A 5-dimension adversarially-verified code audit (**69 grounded findings**) + a frame-level
  **BridgeVoice competitive video teardown** rebuilt `WISHLIST.md` (categorized) + `ROADMAP.md` (canonical
  7-part phases + ADRs) with a durable evidence base in `docs/03-plan/_research/`. BridgeVoice = BridgeMind's
  Tauri/Rust, account-gated, cloud-preferring dictation app for vibe-coding; SigmaVoice is the local-first
  counterpart. Hard non-goals (ADR-gated): accounts, cloud-by-default, sync, telemetry, signing, Linux.
- **Ruflo wiring (ADR-004).** The ruflo MCP is registered **per machine at LOCAL scope** (`claude mcp add
  ruflo -s local -e CLAUDE_FLOW_DIR=/Users/aisigma/projects/SigmaLink/app/.claude-flow …`), NOT project
  `.mcp.json` (which needs a manual `/mcp` approval and silently fails to load). Verified with a `patterns`
  write→`memory_search_unified` round-trip. The worker daemon is **per-repo** (cwd-bound, ignores
  `CLAUDE_FLOW_DIR`). Shared store is **sequential-use** (SigmaVoice *or* SigmaLink, not both live).
- **Phase 0 shipped to branch `feat/phase-0-quick-wins`** (gate-green, spec+quality reviewed): visible tray
  icon (was `createEmpty`), whisper prewarm (kills first-dictation cold start), boot guard (no silent inert
  process), honest hotkey validation+toast, dictionary real empty-state, model-download progress+Cancel,
  HUD 10-min ceiling, and ~8 smaller fixes. Executed via parallel disjoint-file worktree slices → central
  integrate + gate + review.
- **CA-1 test harness** (`node --test`, native TS, **zero new deps**, 16 tests; extracted `src/accelerator.ts`;
  CI on Node 24.x) + **SEC-1/2/4/5** Electron hardening (CSP, nav lockdown, sandbox, dictionary cap).
- **Descoped:** FE-4 clipboard-only → engine (`RouteOpts` has no output-mode hook). **Pending operator:**
  merge `feat/phase-0-quick-wins` + real-device smoke (sandbox/CSP/tray/paste can't be verified headless);
  then Phase 1 UI restyle (design-review), Phase 2 features, Phase 4 engine (W-SV1 Windows CI).

## Release history
- **v0.3.2** (2026-05-29, Latest) — fixed the Test-Recording crash (AVAudioEngine tap `format:nil`,
  44.1kHz/2ch mics) + added the model-download UX (list/size/download%/activate). macOS arm64 DMG.
- **v0.3.1** (deleted) — fixed v0.3.0 launch crash (`sudo-prompt` not bundled) + distinct icon.
- **v0.3.0** (deleted) — first standalone DMG; crashed on launch (missing transitive dep).
- *(v0.2.0 was the in-SigmaLink scaffold, pre-standalone.)*

## Hard-won lessons → see `docs/04-design/native-gotchas.md`
link: not file: deps · npmRebuild:false / don't local-pack · externalize node-global-key-listener ·
node-gyp-build + sudo-prompt as direct deps · @electron/rebuild -w doesn't match @sigmalink/* ·
AVAudioEngine tap format:nil · the submodule pin is the CI source of truth.
