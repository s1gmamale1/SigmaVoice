# SigmaVoice — Open Bugs

> **Boundary note (read first):** both open bugs live in the **voice engine / native
> modules**, which are inside the **SigmaLink git submodule** at `./sigmalink/app/native/…`,
> **not** in this repo's app shell. Fixing them means editing under `sigmalink/`, committing
> to SigmaLink, and bumping this repo's submodule pointer (see `docs/HANDOFF.md` §"Engine
> boundary"). The app shell (`src/`, `renderer/`) is unaffected.

---

## W-SV1 — Windows NSIS build blocked (voice-whisper MSVC link failure)

- **Status:** 🔴 OPEN — blocks the Windows installer. macOS arm64 DMG ships fine.
- **Where:** `sigmalink/app/native/voice-whisper/binding.gyp` (the `OS=="win"` branch).
- **Symptom:** the `release.yml` **build-windows** job fails. `voice-win` compiles OK;
  **`voice-whisper` x64 fails to LINK** with `LNK1120: 40 unresolved externals`.

**Exact unresolved symbols (representative):**
```
whisper.obj            : error LNK2001: unresolved external symbol ggml_set_f32
whisper.obj            : error LNK2001: unresolved external symbol ggml_graph_plan
ggml-cpu.obj           : error LNK2001: unresolved external symbol ggml_cpu_init
ggml-cpu.obj           : error LNK2001: unresolved external symbol ggml_threadpool_new
ggml-cpu.obj           : error LNK2001: unresolved external symbol ggml_threadpool_free
ggml-cpu.obj           : error LNK2001: unresolved external symbol ggml_get_type_traits_cpu
ggml-cpu-aarch64.obj   : error LNK2001: unresolved external symbol ggml_barrier
ggml-backend-reg.obj   : error LNK2001: unresolved external symbol ggml_backend_cuda_reg
…(40 total: ggml_cpu_has_*, ggml_numa_*, ggml_threadpool_*, ggml_set_f32*, ggml_get_i32_nd)
```

**Root cause (hypothesis, needs Windows-runner iteration to confirm):** the binding.gyp
source/define set links on macOS/clang but is incomplete for MSVC. whisper.cpp officially
builds on Windows via **CMake**, not gyp; the hand-maintained gyp Windows branch is missing
or mis-conditionalizing ggml CPU/threadpool source files. Two concrete smells in the symbol list:
- `ggml_backend_cuda_reg` referenced with **no CUDA** in the build → a CUDA-guarded source is
  being compiled-in (or a header decl isn't `#if`-guarded) without the matching .cu/registration.
- `ggml-cpu-aarch64.obj` present in an **x64** link → arch-conditional CPU source selection is
  wrong (aarch64 file compiled for x64).

**Where to start:** compare the gyp `sources`/`defines` for `OS=="win"` vs `OS=="mac"`; diff
against upstream whisper.cpp's CMake `GGML_*` source globs for the pinned tag (`v1.7.4`); ensure
the ggml-cpu + threadpool + backend-reg translation units are all compiled for win/x64 and that
no CUDA path is referenced. **No local Windows here → iterate via the `release.yml` build-windows
job on a GitHub `windows-latest` runner** (push a branch, read the LNK log, repeat).

---

## W-SV2 — Quit-time SIGABRT in the native ThreadSafeFunction teardown

- **Status:** 🟠 OPEN — low priority (quit-only; app already exiting; no data loss).
- **Where:** `sigmalink/app/native/voice-mac/src/tsfn_bridge.*` (and the win twin).
- **Symptom:** quitting SigmaVoice **after a recording session** can emit a macOS crash report:
```
EXC_CRASH (SIGABRT) — abort() called
CrBrowserMain  napi_release_threadsafe_function → uv_mutex_lock → abort
```
- **Repro:** start a capture, stop+transcribe, then Quit. (No record session → no abort.)
- **Why the obvious fix doesn't work:** the abort fires *inside* the native TSFN release during
  `captureCtrl.dispose()`. `app.exit(0)` and `process.exit(0)` in `before-quit` do **not** dodge
  it — the release runs before the exit takes effect. Verified locally (both still EXIT 134).
- **Real fix:** TSFN release semantics in `tsfn_bridge` — release/abort the ThreadSafeFunction
  (`napi_release_threadsafe_function` with `napi_tsfn_abort`, or finalize on the JS thread) BEFORE
  the libuv loop tears down, so the mutex it locks still exists. Affects SigmaLink in-app voice too.
- **Interim:** `src/main.ts before-quit` does a guarded, idempotent teardown; the crash is
  cosmetic (post-quit). Lower priority than W-SV1.

---

## Fixed (history)
- **v0.3.1** — launch crash `Cannot find module 'sudo-prompt'`: transitive dep of
  `node-global-key-listener` not bundled → added `sudo-prompt` + `node-gyp-build` as **direct**
  deps; made the key-listener lazy-load so a load failure degrades instead of crashing.
- **v0.3.2** — Test-Recording crash on 44.1kHz/2ch mics (`Failed to create tap due to format
  mismatch`): `voice-mac` AVAudioEngine tap installed with `format:nil` instead of
  `outputFormatForBus:0`; rate read per-buffer from `buffer.format`. (Engine fix → SigmaLink.)
