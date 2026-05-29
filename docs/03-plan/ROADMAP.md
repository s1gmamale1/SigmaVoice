# SigmaVoice — Execution Roadmap (next-phase whiteboard)

> **Ephemeral working doc.** The priority-ordered execution sequence for the CURRENT phase,
> derived from findings in `WISHLIST.md`. A whiteboard — refreshed each phase, **not permanent
> documentation**. The permanent record is GitHub Releases + `docs/10-memory/master_memory.md`.
>
> **Shipped baseline: macOS arm64 v0.3.2 (2026-05-29).** Engine = SigmaLink submodule.

---

## 🎯 Sequence (priority order — refreshed 2026-05-29 post-v0.3.2)

| # | Item | Type | Status |
|---|------|------|--------|
| **SV1** | Windows NSIS build — `voice-whisper` MSVC link (`LNK1120`) | native build | 🚧 fix in `sigmalink/` binding.gyp + Windows-runner CI iteration |
| **SV2** | Quit-time TSFN SIGABRT (`napi_release_threadsafe_function`) | native bug | low; `tsfn_bridge` release-semantics fix in `sigmalink/` |
| **op** | Live mic/permission smoke (Mic+Accessibility+Input-Monitoring) | operator-owned | needs a device |
| **opt** | Deferred features (win keystroke-inject, AI-cleanup/cloud, floating pill, wake-word) | polish | unscoped |

---

### ▶ SV1 — Windows NSIS build · BLOCKED (highest priority)

`release.yml` build-windows fails: `voice-whisper` x64 won't link (40 unresolved `ggml_*` externals).
The shared `sigmalink/app/native/voice-whisper/binding.gyp` `OS=="win"` source/define set is
incomplete for MSVC. **Start:** diff the win vs mac gyp sources against upstream whisper.cpp's CMake
`GGML_*` globs for tag `v1.7.4`; fix the CUDA-with-no-CUDA + aarch64-in-x64 smells; iterate on a
`windows-latest` runner (no local Windows). Full detail: `docs/08-bugs/OPEN.md` §W-SV1. Engine fix →
commit to SigmaLink → bump the submodule pointer (gotcha #7).

### ▶ SV2 — Quit-time TSFN SIGABRT · LOW

Quit-after-recording emits a cosmetic crash report; app already exiting, no data loss. `app.exit`/
`process.exit` don't dodge it (abort is inside the native release). Fix TSFN release ordering in
`sigmalink/app/native/voice-mac/src/tsfn_bridge.*`. Detail: `docs/08-bugs/OPEN.md` §W-SV2.

---

## When an item ships
→ move its one-line note to the GitHub Release notes + `docs/10-memory/master_memory.md`; delete it
from this whiteboard. Keep `WISHLIST.md` for new raw findings/ideas.
