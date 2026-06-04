# SigmaVoice — Developer Handoff

Read this first if you're taking over SigmaVoice development. It's the orientation a fresh
agent (no prior session memory) needs to be productive without re-learning the traps.

- **What it is:** a standalone, local-first, system-wide voice→text dictation app for macOS
  (Apple Silicon). Global hotkey → on-device Whisper → paste into whatever app is focused.
  Tray-only, unsigned/internal-use. Inspired by BridgeMind's BridgeVoice, but local + free.
- **Repos:** this is `s1gmamale1/SigmaVoice` (the app + release home). The voice **engine** is
  `s1gmamale1/SigmaLink`, embedded here as a git submodule at `./sigmalink/`.
- **Current release:** macOS arm64 **v0.4.0** (`releases/tag/v0.4.0`, GitHub **pre-release** — on-device smoke pending before promoting to stable; latest **stable** is v0.3.2). Windows blocked (W-SV1).

## Engine boundary — the single most important thing to understand

This repo owns the **app shell**. The **voice engine + native modules** live in the SigmaLink
submodule and are shared with SigmaLink's own in-app voice — `voice-core` is the single source
of truth, never fork/copy it.

| You own (edit here) | Engine (edit in `sigmalink/`, then bump the submodule) |
|---|---|
| `src/` (main, hotkey-manager, hud-window, kv-store, settings-data, preloads) | `sigmalink/app/packages/voice-core/` (capture state machine, output router, engines, model registry) |
| `renderer/` (settings.html, hud.html) | `sigmalink/app/native/voice-{mac,win,whisper}/` (N-API bindings, whisper.cpp) |
| `scripts/build.cjs`, `electron-builder.yml`, `.github/workflows/` | — |

**Both open bugs (W-SV1, W-SV2) are in the engine/natives → fixed in `sigmalink/`, not here.**
After an engine fix: commit to SigmaLink → `git -C sigmalink checkout <sha>` → `git add sigmalink`
→ commit the pointer bump here. CI builds natives from whatever the submodule points at (gotcha #7).

> **Convention change (2026-05-29):** SigmaVoice app development now happens **in this repo**
> (previously it was developed inside `SigmaLink/sigma-voice/` and mirrored here). `SigmaLink/sigma-voice/`
> still exists as the historical dev copy; treat **this repo as authoritative for the app shell**
> going forward. Engine code remains authored in SigmaLink.

## Architecture

```
SigmaVoice/                  ← this repo (the app)
├── src/
│   ├── main.ts              tray app: lifecycle, single-instance lock, IPC, wires the modules
│   ├── hotkey-manager.ts    push-to-talk key-UP via node-global-key-listener (lazy-loaded)
│   ├── hud-window.ts        focus-preserving recording overlay (focusable:false + showInactive)
│   ├── kv-store.ts          persistent JSON KV under <userData> (dictionary + stats survive restart)
│   ├── settings-data.ts     dictionary validation + stats aggregation (boundary input validation)
│   ├── preload.ts           window.bridgeVoice (settings) — contextIsolated
│   └── hud-preload.ts       window.sigmaHud.onState (HUD) — one-way
├── renderer/                settings.html + hud.html (no framework; inline HTML/CSS/JS)
├── scripts/build.cjs        esbuild → sigma-dist/{main.js, preload.cjs, hud-preload.cjs}
├── scripts/install-macos.sh curl|bash installer (quarantine-free)
├── electron-builder.yml     DMG (mac arm64) / NSIS (win x64); unsigned/ad-hoc; npmRebuild:false
└── sigmalink/               ← git submodule = the voice engine (consumed via link: deps)
```

Capture flow (the engine, in voice-core): hotkey → `buildGlobalCaptureController` → native mic
(`voice-mac` AVAudioEngine / `voice-win` SAPI5) → PCM → resample 16k → `whisper.cpp` (or Gemini-CLI)
→ `normalizeTranscript` (dictionary/macros) → `routeTranscript` → clipboard + AX-paste into the
focused app. The app shell injects deps (KV, clipboard, modelsDir, emit) and owns the tray/HUD/hotkey
+ the settings IPC (`bv:*` channels) and model-download UX (`bv:listModels/downloadModel/abortDownload`).

## Build / run / release

```bash
git clone --recurse-submodules https://github.com/s1gmamale1/SigmaVoice.git
cd SigmaVoice && pnpm install        # links the engine from ./sigmalink
pnpm typecheck                       # tsc --noEmit
pnpm build                           # esbuild bundle
pnpm dev                             # run from source (tray app)
```
First, the natives must be built for Electron's ABI (CI does this; locally, build them once in
`sigmalink/app/native/voice-*` via `node-gyp rebuild --target=<electronVer> --dist-url=…electron headers`).

**Release:** push a `v*` tag → `.github/workflows/release.yml` checks out the submodule recursively,
builds the natives for Electron's ABI (`node-gyp`, mac arm64 / win x64), bundles, packages the
unsigned DMG/NSIS, attaches to the GitHub Release. macOS path is validated; **Windows is blocked on
W-SV1**. `ci.yml` is the always-on typecheck+bundle gate.

## Where everything is documented
- **Open bugs + repro:** `docs/08-bugs/OPEN.md` (W-SV1, W-SV2).
- **Native/build gotchas (the 7):** `docs/04-design/native-gotchas.md` — read before touching deps/build.
- **Plan:** `docs/03-plan/WISHLIST.md` (capture inbox) + `docs/03-plan/ROADMAP.md` (next-phase sequence).
- **Bounded contexts:** `docs/ddd/DOMAINS.md`.
- **Long-form history + task index:** `docs/10-memory/{master_memory,memory_index}.md`.
- **Conventions for agents:** `CLAUDE.md` (+ `AGENTS.md` for Codex).

## Posture (don't relitigate without an ADR)
- macOS arm64 + Windows x64 only. **Unsigned** (mac ad-hoc; win no Authenticode) — internal use.
- Engine consumed via submodule (single source of truth) — do not vendor/copy `voice-core`.
- No new heavy deps; keep the app shell lean. Wake-word ("Hey Jorvis") code exists but stays OFF.
