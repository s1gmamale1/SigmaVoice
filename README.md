# SigmaVoice

**Standalone, system-wide, local-first voice→text dictation.**
Global hotkey → capture → on-device Whisper → paste into **any** focused app
(editor, terminal, Slack, browser, anywhere). Runs in the system tray. Free,
local, private — no cloud, no account.

> Inspired by BridgeMind's BridgeVoice — but on-device by default and not paywalled.

## Features (v0.4)

- **Global hotkey** dictation — **push-to-talk** (hold a modifier combo like ⌘⇧ *or* a
  base-key shortcut) *and* toggle modes, set with a "press your keys" shortcut recorder.
- **On-device Whisper** transcription (tiny/base/small/medium) via `whisper.cpp` — fully
  offline; in-app model download (progress + Cancel); macOS Speech.framework fallback.
- **Paste into anything** — clipboard + macOS Accessibility keystroke (CGEvent).
- **Focus-preserving recording HUD** overlay (never steals focus from your target app).
- **Always-visible floating pill** — click-to-dictate, drag-to-move (position remembered),
  idle/listening/processing states; switchable **Logo & text ↔ Logo only**.
- **Apple-grade settings** — macOS sidebar, system **light/dark** + vibrancy, an **Overview**
  dashboard (Words / Sessions / WPM), hotkey shown as ⌘⌥⎵ keycaps.
- **Dictionary & verbal macros** — literal substitutions (e.g. "new line" → ⏎,
  "bridge mind" → "BridgeMind") applied to every transcript.
- **Usage stats** — words, sessions, average WPM, recent activity.
- Single-instance, tray-only, persistent settings.

## Install (macOS · Apple Silicon)

One-line install — `curl` doesn't set the Gatekeeper quarantine flag, so it just works (no "unidentified developer" dialog):

```bash
curl -fsSL https://raw.githubusercontent.com/s1gmamale1/SigmaVoice/main/scripts/install-macos.sh | bash
```

Pin a version: append `-s v0.4.0`. Prefer to inspect first:

```bash
curl -fsSL https://raw.githubusercontent.com/s1gmamale1/SigmaVoice/main/scripts/install-macos.sh -o install-sigmavoice.sh
less install-sigmavoice.sh && bash install-sigmavoice.sh
```

Or grab the DMG manually from [Releases](https://github.com/s1gmamale1/SigmaVoice/releases/latest) and, after dragging to Applications, run `xattr -cr /Applications/SigmaVoice.app` (or System Settings → Privacy & Security → **Open Anyway**).

SigmaVoice runs in the menu bar. First use prompts for **Microphone** + **Accessibility** (paste), and **Input Monitoring** for push-to-talk — System Settings → Privacy & Security. *(Windows installer coming in a follow-up.)*

## Architecture — the voice engine lives in a submodule

SigmaVoice is the **app shell**. The voice engine (capture state machine,
output router, Whisper/CLI engines, model registry) and the native bindings are
**shared with [SigmaLink](https://github.com/s1gmamale1/SigmaLink)** and consumed
here via a **git submodule** at [`sigmalink/`](./sigmalink) — single source of
truth, no duplicated voice code.

```
SigmaVoice/                         (this repo — the standalone app)
├── src/                            main process: main.ts, hotkey-manager.ts,
│                                   hud-window.ts, text/kv/settings helpers, preloads
├── renderer/                       settings.html + hud.html (no framework)
├── scripts/build.cjs               esbuild bundler (natives kept external)
├── electron-builder.yml            DMG (mac arm64+x64) / NSIS (win x64), unsigned
├── package.json                    link: deps → sigmalink/app/{packages,native}/*
└── sigmalink/                      git submodule → SigmaLink (the voice engine)
    └── app/
        ├── packages/voice-core/    @sigmalink/voice-core  (engine, TS)
        └── native/voice-{mac,win,whisper}/   N-API bindings (+ whisper.cpp)
```

The four `@sigmalink/*` dependencies use pnpm `link:` (not `file:`) so the
natives' built `build/Release/*.node` stay resolvable through the submodule.

### Where development happens

**App-shell development happens in THIS repo** (`src/`, `renderer/`, `scripts/`, configs). The
voice **engine + native modules** are authored in SigmaLink and consumed here via the `./sigmalink/`
submodule — fix engine/native code in SigmaLink, then bump the submodule pointer:

```bash
git -C sigmalink fetch origin && git -C sigmalink checkout <sigmalink-sha>
git add sigmalink && git commit -m "bump engine submodule → <sha>"
```

> The two open bugs (Windows build, quit-time abort) are in the engine/natives → fixed in SigmaLink.
> Full orientation for maintainers: **[`docs/HANDOFF.md`](docs/HANDOFF.md)**. Conventions:
> **[`CLAUDE.md`](CLAUDE.md)**. (`SigmaLink/sigma-voice/` is the historical dev copy, pre-2026-05-29;
> this repo is authoritative for the app shell now.)

## Develop / build

```bash
git clone --recurse-submodules https://github.com/s1gmamale1/SigmaVoice.git
cd SigmaVoice
pnpm install                 # links the engine from ./sigmalink
pnpm typecheck               # tsc --noEmit
pnpm build                   # esbuild → sigma-dist/{main.js,preload.cjs,hud-preload.cjs}
pnpm dev                     # run from source (tray app)
```

First the natives must be built for Electron's ABI (CI does this; locally, build
them once in the submodule, e.g. `cd sigmalink/app && pnpm install` then
`node-gyp rebuild --target=<electron-version> --dist-url=https://electronjs.org/headers`
in each `native/voice-*`).

### Installers

```bash
pnpm run pack:mac    # macOS DMG (arm64 + x64), ad-hoc signed
pnpm run pack:win    # Windows NSIS (x64), unsigned
```

> **Do not run `pack:*` against a SigmaLink checkout you develop in.** With
> `link:` deps + `npmRebuild`, electron-builder can recompile the natives over
> the symlink into the shared engine tree. This repo ships `npmRebuild: false`
> (the natives are built once, then copied) to avoid that; packaging is meant for
> CI / a clean checkout.

## macOS permissions

System-wide dictation needs, on first use (granted in System Settings → Privacy & Security):
- **Microphone** — capture.
- **Accessibility** — paste the transcript into the focused app (CGEvent Cmd+V).
- **Input Monitoring** — *only for push-to-talk* (the global key-UP that ends
  hold-to-talk). If denied, SigmaVoice degrades to tap-to-toggle and tells you.

Unsigned/ad-hoc build → Gatekeeper shows "unidentified developer" (recoverable):
`xattr -cr /Applications/SigmaVoice.app` or System Settings → Open Anyway.

## Distribution posture

Internal-use, **unsigned** (macOS ad-hoc / Windows no Authenticode). macOS arm64 +
Windows x64 only. When a Developer ID / Authenticode cert is acquired: drop the
`afterSign` ad-hoc hook, set `mac.identity`, `hardenedRuntime: true`, `notarize: true`.

## Release CI

`.github/workflows/release.yml` triggers on `v*` tags: checks out the submodule
recursively, builds the natives for Electron's ABI in `sigmalink/app`, bundles,
and produces the unsigned DMG / NSIS installer. **First-run validation pending**
on real GitHub runners (multi-arch native build) — until then, SigmaLink's
`release-sigma-voice.yml` remains the proven release path.

## Deferred

- Windows keystroke-inject (`sendPasteKeystroke` equivalent) + Tier-3 typing fallback.
- AI cleanup / custom-instructions reformatting; optional cloud transcription.
- Wake-word ("Hey Jorvis") listening mode (engine code exists, off by default).
- Electron auto-updater; Developer-ID signing + notarization; DMG background art.
