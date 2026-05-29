# SigmaVoice — Bounded Contexts (DDD map)

The app shell is small and tray-only. The heavy lifting (capture/transcription) is the **engine**,
which lives in the SigmaLink submodule and is shared — it is its own bounded context, owned upstream.

| Context | Responsibility | Source | Owner |
|---|---|---|---|
| **App lifecycle / tray** | Boot, dock-hidden tray, single-instance lock, settings window, teardown | `src/main.ts` | this repo |
| **Hotkey** | Push-to-talk key-UP edge (Electron globalShortcut = press-only); lazy-loaded global key listener; toggle vs PTT | `src/hotkey-manager.ts` | this repo |
| **Recording HUD** | Focus-preserving always-on-top overlay (`focusable:false` + `showInactive` + `type:'panel'`); recording/transcribing state; safety auto-hide | `src/hud-window.ts` + `renderer/hud.html` | this repo |
| **Settings & persistence** | `window.bridgeVoice` IPC, dictionary/macros editor, usage-stats panel, model-download UX; file-backed KV (survives restart) | `src/{preload,settings-data,kv-store}.ts` + `renderer/settings.html` | this repo |
| **Voice engine** (shared) | Capture state machine, output router (paste-anywhere), Whisper/CLI engines, model registry, dictionary normalize, stats | `sigmalink/app/packages/voice-core/src/*` | **SigmaLink** (submodule) |
| **Native bindings** (shared) | macOS Speech/AVAudioEngine (`voice-mac`), Windows SAPI5 (`voice-win`), whisper.cpp N-API (`voice-whisper`) | `sigmalink/app/native/voice-*` | **SigmaLink** (submodule) |
| **Build & release** | esbuild bundle (natives external), electron-builder (DMG/NSIS, npmRebuild:false), CI | `scripts/build.cjs`, `electron-builder.yml`, `.github/workflows/*` | this repo |

## Cross-cutting invariants
- **Engine = single source of truth via submodule.** Never vendor/copy `voice-core`; consume via
  `link:sigmalink/app/...`. Engine changes are authored in SigmaLink and pulled in by bumping the
  submodule pointer (the pin is the CI source of truth).
- **Natives stay external to the esbuild bundle** + their runtime deps (`node-gyp-build`, `sudo-prompt`)
  are direct app deps so electron-builder bundles them. Verify the PACKAGED native loads (not the stub).
- **App shell never fails-open into a crash.** Optional native libs (key listener) load lazily +
  degrade; the AVAudioEngine tap uses `format:nil` to avoid format-mismatch aborts.
- **IPC boundary:** every renderer-callable channel is a `bv:*` handler in `main.ts`; preloads are
  contextIsolated (`window.bridgeVoice` two-way for settings, `window.sigmaHud` one-way for the HUD).

See `docs/04-design/native-gotchas.md` and `docs/08-bugs/OPEN.md`.
