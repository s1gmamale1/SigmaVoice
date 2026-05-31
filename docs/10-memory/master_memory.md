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
