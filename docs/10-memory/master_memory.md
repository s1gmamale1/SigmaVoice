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
