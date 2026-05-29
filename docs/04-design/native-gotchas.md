# SigmaVoice — Native & Build Gotchas

Seven hard-won traps wiring this Electron app to SigmaLink's shared native voice engine
(`@sigmalink/voice-core` + `voice-{mac,win,whisper}`) across the git-submodule boundary.
Each one shipped a broken build at least once. Read before touching deps, the build script,
electron-builder, or the natives.

### 1. Use pnpm `link:` deps, NOT `file:`, for the engine + natives
`file:../sigmalink/app/native/voice-whisper` makes pnpm **copy** the package into its store
using npm-pack rules — which **drop the gitignored `build/` dir** → the `.node` binary vanishes
→ `voice-core` silently falls back to the **transcription STUB** (no error; `transcribe` still
exists but does nothing real). `link:` creates a pure symlink to the live dir → `build/Release/*.node`
stays reachable. `package.json` already uses `link:sigmalink/app/...` for all four `@sigmalink/*` deps.
**Verify natives load (not stub):** `ELECTRON_RUN_AS_NODE=1 <electron-bin> -e 'require("@sigmalink/voice-mac").isAvailable()'`.

### 2. `electron-builder` runs with `npmRebuild: false` — never local-pack against a dev tree
With `link:` native deps + `npmRebuild:true`, electron-builder recompiles the natives **through
the symlink into the shared SigmaLink tree** — a stale/partial `make` can **wipe the shared
`.node` the engine + SigmaLink's own voice both use**. We set `npmRebuild:false` (electron-builder
just *copies* the prebuilt `.node`). Packaging is **CI-only** (`release.yml`, clean checkout).
If you must pack locally, the natives must already be built for Electron's ABI.
Restore a clobbered native: `cd sigmalink/app/native/<pkg> && rm -rf build && npx node-gyp rebuild --target=<electronVer> --arch=arm64 --dist-url=https://electronjs.org/headers`.

### 3. esbuild-EXTERNALIZE `node-global-key-listener` (and any server-binary-spawning lib)
It spawns a prebuilt key-server binary (`MacKeyServer`) via paths relative to its **own** package
dir. If esbuild **bundles** it, those paths rewrite to `sigma-dist/` → the server can't spawn →
push-to-talk silently never fires. It's in `scripts/build.cjs`'s `external` list alongside the
`.node` natives. Tell-tale: `main.js` bundle size jumps (~38→137kb) if accidentally inlined.

### 4. Runtime deps of `link:`/external modules must be DIRECT app deps
pnpm does **not** hoist a `link:` dep's own dependencies into this app's `node_modules`, so
electron-builder can't bundle them → the packaged `.app` throws `Cannot find module …`. Two that
bit us, both shipping a crashing DMG:
- **`node-gyp-build`** — the natives' loaders `require('node-gyp-build')(__dirname)` at runtime to
  locate the `.node`. Absent → stub.
- **`sudo-prompt`** — `node-global-key-listener`'s sole dep. Absent → **launch crash** (`Cannot find
  module 'sudo-prompt'`).
Both are now in this `package.json` `dependencies`. **Release gate:** load the PACKAGED module via
electron-as-node against the built `.app`'s `node_modules` — "the DMG built" is not enough.

### 5. Release CI builds natives with explicit `node-gyp`, not `@electron/rebuild -w`
`@electron/rebuild -w sigmavoice_mac -w whisper_bridge` filters by **module name** but the packages
are `@sigmalink/voice-*` → "No native modules found" (silent no-op). `release.yml` builds each native
explicitly: `cd sigmalink/app/native/<pkg> && npx node-gyp rebuild --target=30.5.1 --arch=<arch> --dist-url=https://electronjs.org/headers`,
single-arch per platform (mac arm64 / win x64). electron-builder mac target is **arm64-only** (ADR)
to avoid an x64 whisper.cpp cross-compile.

### 6. macOS AVAudioEngine input tap: install with `format:nil`
voice-mac read `outputFormatForBus:0` **before** `[engine prepare]` and passed it to
`installTapOnBus`. On a non-48k device (2ch/44.1kHz mic) it mismatched the bus's real format →
AVFAudio threw an **uncatchable NSException** ("Failed to create tap due to format mismatch") that
`abort()`ed the whole process. Fix (in `sigmalink/app/native/voice-mac/src/recognizer.mm`): install
with `format:nil` (the engine uses the bus's actual format — can't mismatch) and read the true rate
per-buffer from `buffer.format.sampleRate`. **Lesson: native NSExceptions abort the process — test
capture on 44.1kHz devices, not just 48k.**

### 7. The submodule pin is the CI source of truth — bump it after any engine fix
`release.yml` builds the natives **from the `sigmalink/` submodule**. An engine/native fix must be
(a) committed to **SigmaLink** AND (b) the SigmaVoice `sigmalink` submodule pointer bumped to that
commit, or CI rebuilds the OLD native. Locally staging a fixed `.node` into `sigmalink/.../build/`
validates packaging but does NOT affect CI.
```bash
git -C sigmalink fetch origin && git -C sigmalink checkout <sigmalink-sha>
git add sigmalink && git commit -m "bump engine submodule → <sha>"
```
