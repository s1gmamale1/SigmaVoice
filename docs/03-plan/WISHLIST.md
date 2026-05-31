# SigmaVoice — Wishlist (categorized capture)

> **Capture inbox.** Findings + ideas, triaged into categories with `impact/effort` and posture flags.
> - **Execution sequence** (priority-ordered, phased) → [`ROADMAP.md`](./ROADMAP.md)
> - **Full evidence** (file:line, recommendations) → [`_research/codebase-findings.md`](./_research/codebase-findings.md)
>   + [`_research/bridgevoice-video-analysis.md`](./_research/bridgevoice-video-analysis.md)
> - **Shipped record / archive** → GitHub Releases + `docs/10-memory/master_memory.md`
>
> Flow: capture here → sequence into `ROADMAP.md` for the phase → on ship, move to the archive.
>
> **Legend:** `impact/effort` (S/M/L) · ⭐ high impact-to-effort · 🔧 engine (SigmaLink submodule —
> author upstream, bump the pin) · 🔒 posture conflict → **ADR candidate, not a normal item**.
> **Baseline:** macOS arm64 **v0.3.2** (2026-05-29). **Sourced from** a 5-dimension adversarially-verified
> code audit (69 findings) + a BridgeVoice competitive video teardown, **2026-05-31**.

---

## 🔎 How SigmaVoice compares to BridgeVoice (the inspiration)

BridgeVoice = BridgeMind's **Tauri/Rust, account-gated ($40/mo), cloud-preferring** dictation app *for
vibe coding*. SigmaVoice is the **local-first, internal, unsigned, no-accounts** counterpart. We already
match the core (global hotkey → on-device whisper → paste-anywhere, PTT+toggle, dictionary, stats,
model-download UX, focus-preserving HUD). **Gaps worth closing** (posture-respecting): clipboard-only
toggle, a persistent floating pill, an Overview/WPM dashboard, searchable history, a local prompt-cleanup
pass, a mic picker, and an Apple-grade settings restyle. **We won't follow** BridgeVoice into accounts,
cloud-by-default, sync, telemetry, or signing (all 🔒). Full teardown + mapping table in the research file.

---

## ✅ Done — merged to `main` `9e74a81` (2026-05-31; pending release + on-device smoke)

Shipped via `feat/phase-0-quick-wins` (gate-green: `pnpm typecheck`+`pnpm test` 16/16+`pnpm build`; spec+quality reviewed). Marked ✅ inline below.
- **Phase 0 (all):** UX-1 · UX-5 · UX-9 · UX-10 · UX-11 · UX-12 · UX-15 · FE-9 · CA-3 · CA-4 · CA-5 · CA-6 · CA-8 · PF-1 · PF-4.
- **Phase 3 (partial):** CA-1 (test harness) · SEC-1 · SEC-2 · SEC-4 · SEC-5.
- **Descoped:** FE-4 → engine track (Phase 4) — `RouteOpts` has no output-mode hook (needs a `voice-core` change).
- Per the "when an item ships" convention these move to `master_memory.md` + leave this file only once **released**
  (tagged DMG after the on-device smoke). Kept here, marked ✅, until then.

## 🆕 New ideas (untriaged)

- _(empty — capture new ideas here)_

---

## 🅰 Tray & first-run
- ✅ **UX-1** Tray icon is invisible (`nativeImage.createEmpty()` despite `build/icon.*`). `high/S` ⭐ — the
  only persistent affordance for a tray-only app.
- **FE-1** First-run onboarding + permissions panel (Mic/Accessibility/Input-Monitoring deep links, live
  status, KV first-run flag). `medium/L`

## 🅱 Apple-grade UI/UX (renderer)
- **UX-2** Light mode / `prefers-color-scheme` (currently dark-only, ignores system appearance). `high/M`
- **UX-3** Window chrome: `hiddenInset` titlebar + `under-window` vibrancy + min-size (kills the double
  titlebar; makes the glass real). `medium/M`
- **UX-21** Settings restyle → selectable cards + capability chips (BridgeVoice-inspired Local/Cloud cards,
  model rows, iOS toggles). `medium/M`
- **UX-13** Status tab → dashboard (active model+ready, hotkey as keycaps, mode, live permission grants).
  `medium/M`
- ✅ **UX-5** Fix undefined `.status-badge` class → "✓ Active" renders unstyled. `medium/S`
- **UX-4** 44pt hit targets (toggle/tabs/×/chips). `medium/M`
- **UX-19** Render hotkey as ⌘⌥⇧⎵ keycaps, not the raw accelerator string. `low/S`
- **UX-7** Apple spring motion (CSS `linear()` spring on HUD entrance + toggle). `low/S`
- **UX-14** 8pt spacing/type normalization (11px text floor). `low/M`
- **UX-16** Accent consistency (systemGreen overloaded: switch-on **and** `routing` badge). `low/S`

## 🅲 Recording HUD & floating pill
- **FE-2** Floating always-visible dictation pill (idle/listening/processing, draggable, click-to-dictate,
  position persisted) — **BridgeVoice signature**; extends the existing focus-preserving HUD. `medium/L`
- **UX-6** Replace the FAKE equalizer with an honest "listening" animation (app-shell now; real audio level
  = 🔧 **ENG-5**). `medium/M`
- **UX-8** HUD states: idle/error/no-input/done (render now; richer triggers need 🔧 engine). `medium/M`
- ✅ **CA-6** Recording HUD hard time-ceiling (~10 min) + manual dismiss (currently unbounded → can pin over
  the screen until quit). `medium/S` · bug
- **UX-20** HUD ARIA live-text matches actual state (currently announces "recording" in idle fallback).
  `low/S`

## 🅳 Features (dictation product)
- ⛔→🅷 **FE-4 (moved to engine track, Phase 4)** Clipboard-only output toggle (skip AX-paste) — BridgeVoice just shipped this; wins the
  focus-loss case. `high(daily)/S` ⭐
- ✅ **FE-9** Model download: determinate progress bar + MB/MB + wire the **already-plumbed** Cancel
  (`abortDownload`). `medium/S` ⭐
- **FE-5** Usage: add **WPM + Sessions** + an "Overview" dashboard (hero cards + recent activity).
  BridgeVoice parity. `medium/S`
- **FE-6** Searchable transcription history + per-row "Add to Dictionary." `medium/M`
- ✅ **UX-15** Dictionary: real empty state (stop injecting fake example rows that get saved as real data).
  `medium/S`
- **FE-7** Dictionary "`@repo`/agent-reference" recipes (examples + docs) — BridgeVoice headline trick.
  `medium/S`
- **FE-8** Mic input-device picker (preferred + "active now" fallback). `medium/M`
- **FE-3** Local "Custom Instructions" / prompt-cleanup pass (camelCase/punctuation/strip-filler/verbal
  commands). Local CLI/model = posture-OK; **cloud LLM = 🔒 ADR-3**. `medium/M`
- **FE-11** Local what's-new / changelog modal (bundled JSON, no network). `low/S`
- **FE-14** Version-check nag (GitHub latest tag vs `app.getVersion()`, link to download — no self-update).
  `low/M`
- **FE-13** Widget appearance toggle (logo+text ↔ logo-only) + show/hide (after FE-2). `low/S`
- **FE-10** "Mute system audio while listening" toggle (CoreAudio ducking). `low/M`
- **FE-12** Multilingual local whisper model in the download UX — a **local-first edge over BridgeVoice**
  (🔧 model config). `low/S`

## 🅴 Performance & smoothness
- ✅ **PF-1** Whisper model prewarm after enable — kills first-dictation cold-start lag (app-shell-feasible).
  `medium/S` ⭐
- **PF-2** Whisper context idle-eviction (+ at-quit dispose) — reclaim 150 MB–2 GB mid-session. `low/M`
- **PF-3** HUD idle teardown (destroy the blurred transparent window after idle). `low/M`
- ✅ **PF-4** HUD clock: `setInterval` not 60fps `requestAnimationFrame` for a 1-second display. `low/S`
- **PF-5** KV: debounce/async persist (stop the synchronous full-store rewrite on the dictation path).
  `low/S`
- **PF-7** Document the KV "whole-map rewrite per set" assumption. `low/S`

## 🅵 Code, architecture & longevity
- ✅ **CA-1** App-shell test harness (`node:test`+`tsx`) for the 3 pure modules + a `pnpm test` CI step.
  `medium/M`
- ✅ **CA-3** `whenReady()` try/catch → degraded tray + notification (no silent inert boot). `medium/S` · bug
- ✅ **UX-10** Hotkey save: validate + honest success/fail toast (today it always toasts "updated"). `medium/S`
- **CA-2** Split `settings.html` (1390 lines → html + css + JS modules, <500 each). `medium/M`
- ✅ **CA-8** Fix `pnpm dev` (`electron src/main.ts` can't run raw ESM TS — add `tsx` or build-then-run).
  `low/S` · bug
- ✅ **CA-4** De-dupe the push-to-talk-degraded notification (two call sites). `low/S` · bug
- ✅ **UX-12** Dictionary save: report dropped over-long entries (use the sanitized return value). `low/S`
- ✅ **UX-9** Usage tab auto-refresh on activation (currently stale until manual Refresh). `low/S`
- ✅ **UX-11** `second-instance` should `.focus()` the created settings window (Dock-hidden surfacing). `low/S`
- ✅ **CA-5** Remove dead code (`void os`, `HudLike` dup, unused `refresh()`). `low/S`
- **CA-7** `build.cjs`: update stale comments; optional prune Drizzle externals; optional `--watch`. `low/S`

## 🅶 Security & privacy
- **SEC-6** Clipboard residue — last transcript (passwords/PII) left on the system clipboard; no
  clear/restore. `medium/M` (policy app-shell; durable fix 🔧 engine)
- **SEC-3** Commit `pnpm-lock.yaml` + CI `--frozen-lockfile` + non-blocking `pnpm audit`. `medium/S`
- **SEC-7** macOS installer: per-release SHA-256 verify + `vX.Y.Z` tag regex + explicit sudo. `medium/M`
- ✅ **SEC-1** Add a strict CSP to both renderers (defense-in-depth; no live XSS today). `low/S`
- ✅ **SEC-2** Navigation / `setWindowOpenHandler` hardening. `low/S`
- ✅ **SEC-4** `sandbox:true` on all windows (preloads are sandbox-safe). `low/S`
- ✅ **SEC-5** Cap dictionary `replacement` length + strip control chars. `low/S`
- 🟡 **SEC-9** (partial — `setHotkey` validation ✅ shipped via UX-10) IPC consistency: bound the `setHotkey` accelerator + coerce `setEnabled` to boolean. (Do **not**
  re-validate `setModelId` — the engine already does.) `low/S`
- **SEC-8** `adhoc-sign.cjs`: scope the `spawn-helper` chmod; move off `codesign --deep`. `low/M`

## 🅷 Engine / native (🔧 SigmaLink submodule — author upstream, bump the pin)
- **W-SV1** Windows `voice-whisper` MSVC link (`LNK1120`). `high/S–M` ⭐ — **unblocks Windows.** Four
  sub-causes in `binding.gyp` (fix together, iterate on a windows-latest runner): remove `GGML_USE_CUDA=0`
  define · add `GGML_USE_CPU` · add `ggml-cpu-hbm.cpp` · fix x64 arch (`-march`/aarch64 + add `cpu-feats-x86.cpp`).
  *Caveat:* nested `vendor/whisper.cpp/` unchecked-out → confirm guards on a Windows runner.
- **ENG-1** voice-win `sendPasteKeystroke` (SendInput Ctrl+V) + `typeUnicode` fallback — Windows real paste
  (today clipboard-only). `medium/M` (gated on W-SV1)
- **ENG-7** whisper `audio_ctx` trim for short clips — **biggest per-dictation latency win**. `medium/M`
- **ENG-5** Emit a 0–1 audio level from voice-core → enables the real HUD waveform (**UX-6**). `medium/M`
- **ENG-3** Gemini-CLI spawn timeout/kill/maxBuffer (a hung CLI never settles / never falls back) — prereq
  for any cloud ADR. `low/S` · bug
- **W-SV2** Quit-time TSFN `SIGABRT` — `napi_tsfn_abort`/env-cleanup-hook (mirror voice-win) in
  `tsfn_bridge`. Cosmetic, quit-only. `low/M`
- **ENG-2** SigmaLink focused-pane routing is dead weight in standalone → silent drop on a `/sigmalink/i`
  foreground app. `low/S`
- **ENG-4** Model-download: redirect host allowlist / drop `Range` cross-host (SHA-256 already mitigates).
  `low/S`
- **ENG-6** `-march=native` → `-mcpu=apple-m1` baseline (reproducible builds). `low/S`
- **ENG-8** whisper threads from `availableParallelism()` (validate vs Metal GPU-bound). `low/M`
- **ENG-9** AX-paste 50ms → ~10–20ms / next-tick (measure). `low/S`
- **ENG-10** Resample in the native worker / avoid the double main-thread copy at stop. `low/M`

---

## 🔒 ADR candidates (posture-breaking — need an ADR, NOT roadmap items)
- **ADR-1** Opt-in Local⇄Cloud transcription toggle (Gemini-CLI exists; default Local, no account;
  multilingual is the payoff). Prereq ENG-3.
- **ADR-2** Wake-word ("Hey Jorvis") enablement (engine code exists, locked OFF) + wake-model provisioning UX.
- **ADR-3** AI cleanup via a **cloud** LLM (the local variant is FE-3).
- **ADR-4** Auto-update + Developer-ID signing/notarization (mac) / Authenticode (win). Within-posture
  alternative = FE-14.
- **ADR-5** Linux support.
- **Non-goals (won't-do without an ADR):** accounts/subscription/trial, cloud-by-default, cross-device sync,
  telemetry. (BridgeVoice has these as a commercial product; SigmaVoice is the local-first counterpart.)

---

## 🟡 Operator-owned (needs hardware)
- **Live mic/permission smoke** — real-device pass: Mic + Accessibility + Input-Monitoring grants → hotkey
  → speak → paste; verify PTT hold-to-talk, HUD doesn't steal focus, dictionary/stats, model download.
  (BridgeVoice's own livestream showed the *same* Accessibility/key-listener-timing fragility class — a
  hardening cue: re-attach the listener after a post-launch grant.)

## 📌 Standing references
- **Distribution posture:** internal use, **unsigned** (mac ad-hoc / win no Authenticode). macOS arm64 +
  Windows x64 only. Reversal (signing, Linux) needs an ADR.
- **Engine boundary:** the voice engine + natives live in the SigmaLink submodule (`./sigmalink/`) and are
  shared — single source of truth. App-shell dev is in THIS repo; engine fixes flow through SigmaLink (bump
  the pin). See `docs/HANDOFF.md` + `docs/04-design/native-gotchas.md`.
