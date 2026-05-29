# SigmaVoice — Wishlist (quick capture)

> **Capture inbox.** Jot findings + new ideas here as they land — low ceremony.
> - **Execution sequence** (what we do next, priority-ordered) → `ROADMAP.md`
> - **Shipped record / archive** → GitHub Releases + `docs/10-memory/master_memory.md`
>
> Flow: capture here → triage into `ROADMAP.md` for the next phase → on ship, it moves to the
> archive (release notes + master memory) and leaves both working docs.

---

## 🆕 New ideas (untriaged)

- _(empty — capture new ideas here)_

---

## 🔎 Open findings (sequenced in ROADMAP.md)

- **W-SV1 — Windows NSIS build BLOCKED** (engine/native). `voice-whisper` x64 fails to LINK on MSVC
  (`LNK1120: 40 unresolved ggml_* externals`). The shared `binding.gyp` Windows branch is incomplete
  (whisper.cpp is CMake-on-Windows). Full repro + exact symbols + where-to-start in
  `docs/08-bugs/OPEN.md`. **Fix lives in the SigmaLink submodule** + needs Windows-runner CI iteration.
- **W-SV2 — quit-time TSFN SIGABRT** (engine/native, low priority). Quitting after a recording session
  can emit a crash report (`napi_release_threadsafe_function` → `uv_mutex_lock` abort). App already
  exiting; no data loss. Needs a `tsfn_bridge` release-semantics fix in SigmaLink. See `docs/08-bugs/OPEN.md`.
- **Live mic/permission smoke (operator-owned)** — real-device pass: Mic + Accessibility + Input-Monitoring
  grants → hotkey → speak → paste; verify PTT hold-to-talk, HUD doesn't steal focus, dictionary/stats,
  model download. Needs hardware.

## 💡 Deferred features (not yet scoped)
- Windows keystroke-inject (`sendPasteKeystroke` equivalent) + Tier-3 char-typing fallback.
- AI cleanup / custom-instructions reformatting; optional cloud transcription (Groq/Gemini).
- Floating-pill always-visible widget; wake-word ("Hey Jorvis") listening mode (engine code exists, OFF).
- Electron auto-updater; Developer-ID signing + notarization (mac) / Authenticode (win); DMG background art.

---

## 📌 Standing references
- **Distribution posture:** internal use, **unsigned** (mac ad-hoc / win no Authenticode). macOS arm64 +
  Windows x64 only. Reversal (signing, Linux) needs an ADR.
- **Engine boundary:** the voice engine + natives live in the SigmaLink submodule (`./sigmalink/`) and
  are shared — single source of truth. App-shell dev is in THIS repo; engine fixes flow through SigmaLink.
  See `docs/HANDOFF.md` + `docs/04-design/native-gotchas.md`.
