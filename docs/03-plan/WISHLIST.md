# SigmaVoice — Wishlist (categorized capture)

> **Capture inbox.** Findings + ideas, triaged into categories with `impact/effort` and posture flags.
> - **Execution sequence** (priority-ordered, phased) → [`ROADMAP.md`](./ROADMAP.md)
> - **Full evidence** (file:line, recommendations) → [`_research/codebase-findings.md`](./_research/codebase-findings.md)
>   + [`_research/bridgevoice-video-analysis.md`](./_research/bridgevoice-video-analysis.md)
>   + [`_research/2026-06-16-windows-parity-audit.md`](./_research/2026-06-16-windows-parity-audit.md) (🪟 `WIN-*`)
> - **Shipped record / archive** → GitHub Releases + `docs/10-memory/master_memory.md`
>
> Flow: capture here → sequence into `ROADMAP.md` for the phase → on ship, move to the archive.
>
> **Legend:** `impact/effort` (S/M/L) · ⭐ high impact-to-effort · 🔧 engine (SigmaLink submodule —
> author upstream, bump the pin) · 🔒 posture conflict → **ADR candidate, not a normal item**.
> **Baseline:** macOS arm64 **v0.4.0** (2026-06-04, GitHub pre-release; latest stable v0.3.2). **Audit sourced from** a 5-dimension adversarially-verified
> code audit (69 findings) + a BridgeVoice competitive video teardown, **2026-05-31**.

---

## Release-readiness audit + app-shell fix pass (2026-06-18)

**Scope.** Audited current release readiness after PRs #1-#4 merged through `v0.5.2`; app-shell fixes are prepared for `v0.5.3`, with emphasis on macOS arm64, Windows x64, IPC edge cases, persisted data hygiene, and release gating. Engine/native issues remain tracked against the SigmaLink submodule; this repo owns only app-shell fixes.

### Fixed in `fix/release-readiness-app-shell`
- ✅ **CA-9** Duplicate model downloads now reject while the same model is already in flight (`src/model-ipc.ts`, `src/model-download-gate.ts`). `impact M / effort S`
- ✅ **CA-10** Manual settings-window recording start now respects capture enabled + idle state (`src/main.ts`, `src/capture-gate.ts`). `impact M / effort S`
- ✅ **CA-11** Floating-pill HUD move IPC now rejects `NaN`/infinite coordinates before calling `moveTo` (`src/pill.ts`). `impact S / effort S`
- ✅ **CA-12** Persisted dictionary/stat reads now re-apply write-side caps and finite non-negative numeric validation (`src/settings-data.ts`). `impact M / effort S`
- ✅ **CA-13 / WIN-10** Model list and Overview no longer claim a selected-but-undownloaded Whisper model is active; Windows shows a generic system-speech fallback (`src/model-list-status.ts`, `renderer/js/overview.js`). `impact M / effort S`
- ✅ **WIN-5** Hotkey capture now maps Windows Ctrl to `CommandOrControl` and Win to `Super`, with Windows-specific hints (`renderer/js/hotkey-capture.js`). `impact M / effort S`
- ✅ **WIN-9** Remote-STT API keys now go through `SecretStore` rather than plaintext KV, including the capture-runtime KV adapter (`src/secret-backed-kv.ts`, `src/llm-ipc.ts`, `src/main.ts`). `impact M / effort S`
- ✅ **WIN-13a** Settings-window macOS vibrancy/transparent chrome is now gated to darwin; Windows uses opaque default chrome (`src/settings-window-options.ts`). `impact S / effort S`
- ✅ **SEC-3 / SEC-7 / WIN-15** Root lockfile is tracked, root CI/release installs use `--frozen-lockfile`, release gates run `typecheck` + `test`, local `pack:*` is CI-only, release tags must match `package.json`, macOS installer verifies SHA-256, and Windows release setup pins MSBuild/Python (`.github/workflows/*`, `scripts/install-macos.sh`, `scripts/ci-only-pack.cjs`). `impact M / effort M`

### Still blocks or constrains release readiness
- 🔧 **Windows native parity is not release-ready yet.** Existing W-SV1 plus the Windows loader/native packaging issue need SigmaLink fixes and a Windows x64 packaged smoke before advertising parity.
- 🔧 **macOS quit-time native crash risk remains engine-owned.** W-SV2 is still in SigmaLink; app-shell teardown remains guarded but cannot fix the ThreadSafeFunction release race.
- **Installed-build hardware smoke is still required.** macOS Apple Silicon and Windows x64 need installed-build smoke on real mic, hotkey, model download/cancel, tray, HUD/pill drag, quit/relaunch, remote-STT secret, and OpenRouter-secret paths. Packaging itself remains CI-only.

---

## 🔬 Deep review findings (2026-06-04) — on-device test of the INSTALLED build

**Context.** Operator installed `/Applications/SigmaVoice.app` and reported 4 symptoms (model unsure-downloaded · Cmd+Shift PTT does nothing · recording "animation is fake / nothing happens" · no floating pill). Root-caused by 4 parallel read-only agents + device-state forensics. **Headline: the installed app is `v0.3.1`** (`CFBundleShortVersionString 0.3.1`, binary built 2026-05-29 16:42, *before* the v0.3.2 tag) — **two releases behind `main`**. `main` is **16 commits ahead of v0.3.2** and **14 ahead of `origin/main` (never pushed)**, **never released**. So ~half the symptoms are *already fixed on `main`* (just unshipped); the rest are genuine open gaps.

### ✅ Already fixed on `main` → real action is **push + cut a release + re-smoke**
- **[crash] Record-start SIGABRT on non-48 kHz mics** — `Recognizer::Start` → `installTapOnBus:format:fmt` (stale pre-`prepare` format read) raises an uncatchable NSException on the operator's 44.1 kHz/2-ch mic → process aborts the instant recording starts. **This IS symptom (c)** ("animation then nothing": the HUD started, the native engine died). The v0.3.2 fix the operator lacks. `sigmalink/app/native/voice-mac/src/recognizer.mm` (v0.3.1 pin `a7ba0fc` buggy → v0.3.2 **and main** pin `35a290e`, `format:nil`). Evidence: `~/Library/Logs/DiagnosticReports/SigmaVoice-2026-05-29-1644*.ips`. sev critical / **ship-only**.
- **[hud] Fake decorative equalizer** — v0.3.1 `renderer/hud.html:99-130` literally `/* decorative animated equalizer (NOT real audio) */`, bounced even in silence. Fixed by UX-6 on main (honest "breathing" indicator). Operator's read ("just decoration") was correct **for v0.3.1**. sev med / **ship-only**.
- **[model] No download mechanism exists in v0.3.1** — model UI is a bare `<select>` (`v0.3.1:renderer/settings.html:824-828`) whose only action is `setModelId`→KV; **no `downloadModel`/`abortDownload`/progress IPC in the bundle**. Selecting "Small (182 MB)" persisted `modelId=small.en-q5_1` but fetched **zero bytes** (confirmed: no model file/partial/`voice-models` dir under `~/Library/Application Support/@sigmalink/sigma-voice/`). At transcribe time → silent fallback to macOS Speech. **This IS symptom (a).** Fixed on main: full download IPC + determinate progress + Cancel + honest Overview label (`462ca7c`; `renderer/js/capture.js:110-156`, `renderer/js/overview.js:31-35`). sev high / **ship-only**.

### 🐞 Still open even on `main` — genuine new work
- ✅ **[built → ROADMAP Phase 1.5, 2026-06-04] Modifier-only / hold-to-talk hotkey** — operator's saved hotkey `CommandOrControl+Alt` is **modifier-only (no base key)**; Electron `globalShortcut.register` can't bind it (`sigmalink/app/packages/voice-core/src/global-capture.ts:372`) and `resolveMainKey` returns null for bare modifiers (`src/hotkey-manager.ts:151,177`). main's UX-10 only *reports* the failure honestly — it does **not** make "hold ⌘/⌥ to talk" (the BridgeVoice pattern) work. **This IS symptom (b).** Fix (app-shell): let `node-global-key-listener` own BOTH down+up edges for a modifier-only PTT binding — `src/hotkey-manager.ts` (DOWN-edge + `resolveModifierKey`), `src/accelerator.ts` (accept 1 modifier when mode=PTT), `src/main.ts:254-262,430-438` (wire `onPushToTalkPress`). Needs Input-Monitoring permission. sev high / effort **M**.
- ✅ **[built → ROADMAP Phase 1.5, 2026-06-04] Hotkey "press keys to record shortcut" capture UX** — (was: raw text input) `renderer/settings.html:187`; save reads `.value.trim()` raw (`renderer/js/capture.js:243-257`). No keystroke→accelerator mapper exists in either version, so "Command+Shift" never made it in — the operator hand-edited the default `…Alt+Space` down to `…Alt`. Fix: a record-shortcut control that captures `keydown` modifiers+key → valid accelerator (and, for PTT, allows a bare modifier). sev med / effort **S–M**. (Pairs with the modifier-PTT fix.)
- ✅ **[built → ROADMAP Phase 1.5, 2026-06-04] FE-2 floating pill** (was: not built; Phase 2 → pulled forward) — only 2 windows exist (settings + transient HUD); HUD hides on any non-record state (`src/main.ts:110-117`), so there's no idle/always-visible/click-to-dictate affordance. **This IS symptom (d).** Hard part already solved in `src/hud-window.ts` (non-activating panel: `focusable:false :125`, `showInactive :209`, `type:'panel' :139`, blur-on-focus guard `:168-171`). Needs: persistent idle state + a **renderer→main IPC** (preload is one-way today, `src/hud-preload.ts:8-12`) to call `bv:startRecording`/`bv:stopAndTranscribe` (`src/main.ts:281-282`) + drag + KV position persist. Risk: accept pointer events for click/drag while never taking keyboard focus. effort **L**. (Corroborates FE-2 + de-stales its refs.)

### 🔧 Optimizations / latent (lower priority)
- 🐞 **[low] Model-row "✓ Active" pill keyed on selected id, not disk presence** — `src/main.ts:308` + `renderer/js/capture.js:122,135-139`; a persisted-but-absent modelId (e.g. carried over from v0.3.1) shows "✓ Active" while the engine is on Speech fallback. (Overview label IS honest.) effort S.
- 🐞 **[low] `setModelId` persists selection independent of download** — `global-capture.ts:769-775`; a cancelled/failed download still reads "selected" with no bytes. Decide selection semantics. effort S.
- 🐞 **[low] Silent pipeline no-ops** — empty transcript returns with **no toast** (`global-capture.ts:533-536`); transcribe errors are `console.warn`-only (`:505-525`). On a *fixed* build these are the next "nothing happened" surfaces. effort S.
- **[doc] ROADMAP Phase-2 FE-2 line refs are stale** — `ROADMAP.md:145` cites old layout; actuals: `hud-window.ts` `:125`/`:209`/`:139`/`:168-171`, `main.ts:281-282`. Fix when FE-2 starts.

### 📋 ROADMAP status correction
The "✅ Done — pending push + on-device smoke" block (below) is **validated as correct code that was never shipped**: the on-device smoke just happened — on the **wrong (v0.3.1) build**. Phase 0/1 are merged to `main` but **unpushed (14 commits) + unreleased**. **Next action (operator-owned): push `main` → tag a release → re-run the live smoke on the new DMG**, which should clear symptoms (a) + (c) outright. Then schedule the two real gaps (modifier-PTT + hotkey-capture UX) and FE-2.

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

## ✅ Done — shipped in v0.4.0 (pre-release; on-device smoke pending → stable)

Gate-green (`pnpm typecheck`+`pnpm test` 20/20+`pnpm build`), spec+quality reviewed (no regressions). Marked ✅ inline below.
- **Phase 0 (all)** (merge `9e74a81`, 2026-05-31): UX-1 · UX-5 · UX-9 · UX-10 · UX-11 · UX-12 · UX-15 · FE-9 · CA-3 · CA-4 · CA-5 · CA-6 · CA-8 · PF-1 · PF-4.
- **Phase 1 (all)** (merge `422c8d2`, 2026-06-01): UX-2 · UX-3 · UX-4 · UX-6 · UX-7 · UX-8 · UX-13 · UX-14 · UX-16 · UX-19 · UX-20 · UX-21 · FE-5 · CA-2 (split + CSP `'self'`).
- **Phase 3 (partial):** CA-1 (test harness) · CA-2 · SEC-1 · SEC-2 · SEC-4 · SEC-5.
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
- ✅ **UX-2** Light mode / `prefers-color-scheme` (currently dark-only, ignores system appearance). `high/M`
- ✅ **UX-3** Window chrome: `hiddenInset` titlebar + `under-window` vibrancy + min-size (kills the double
  titlebar; makes the glass real). `medium/M`
- ✅ **UX-21** Settings restyle → selectable cards + capability chips (BridgeVoice-inspired Local/Cloud cards,
  model rows, iOS toggles). `medium/M`
- ✅ **UX-13** Status tab → dashboard (active model+ready, hotkey as keycaps, mode, live permission grants).
  `medium/M`
- ✅ **UX-5** Fix undefined `.status-badge` class → "✓ Active" renders unstyled. `medium/S`
- ✅ **UX-4** 44pt hit targets (toggle/tabs/×/chips). `medium/M`
- ✅ **UX-19** Render hotkey as ⌘⌥⇧⎵ keycaps, not the raw accelerator string. `low/S`
- ✅ **UX-7** Apple spring motion (CSS `linear()` spring on HUD entrance + toggle). `low/S`
- ✅ **UX-14** 8pt spacing/type normalization (11px text floor). `low/M`
- ✅ **UX-16** Accent consistency (systemGreen overloaded: switch-on **and** `routing` badge). `low/S`

## 🅲 Recording HUD & floating pill
- ~~**FE-2** Floating always-visible dictation pill (idle/listening/processing, draggable, click-to-dictate,
  position persisted) — **BridgeVoice signature**; extends the existing focus-preserving HUD. `medium/L`~~ → **promoted to ROADMAP Phase 1.5** (2026-06-04).
- ✅ **UX-6** Replace the FAKE equalizer with an honest "listening" animation (app-shell now; real audio level
  = 🔧 **ENG-5**). `medium/M`
- ✅ **UX-8** HUD states: idle/error/no-input/done (render now; richer triggers need 🔧 engine). `medium/M`
- ✅ **CA-6** Recording HUD hard time-ceiling (~10 min) + manual dismiss (currently unbounded → can pin over
  the screen until quit). `medium/S` · bug
- ✅ **UX-20** HUD ARIA live-text matches actual state (currently announces "recording" in idle fallback).
  `low/S`

## 🅳 Features (dictation product)
- ⛔→🅷 **FE-4 (moved to engine track, Phase 4)** Clipboard-only output toggle (skip AX-paste) — BridgeVoice just shipped this; wins the
  focus-loss case. `high(daily)/S` ⭐
- ✅ **FE-9** Model download: determinate progress bar + MB/MB + wire the **already-plumbed** Cancel
  (`abortDownload`). `medium/S` ⭐
- ✅ **FE-5** Usage: add **WPM + Sessions** + an "Overview" dashboard (hero cards + recent activity).
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
- ~~**FE-13** Widget appearance toggle (logo+text ↔ logo-only) + show/hide (after FE-2). `low/S`~~ → **promoted to ROADMAP Phase 1.5** (2026-06-04).
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
- ✅ **CA-2** Split `settings.html` (1390 lines → html + css + JS modules, <500 each). `medium/M`
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
- ✅ **SEC-3** Commit `pnpm-lock.yaml` + CI/release root `--frozen-lockfile`. Non-blocking `pnpm audit` remains a follow-up, not a release blocker. `medium/S`
- ✅ **SEC-7** macOS installer: per-release SHA-256 verify + `vX.Y.Z` tag regex + explicit sudo. `medium/M`
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

## 🪟 Windows parity (app-shell) — audit 2026-06-16; full evidence → [`_research/2026-06-16-windows-parity-audit.md`](./_research/2026-06-16-windows-parity-audit.md)
> 5-agent read-only Phase-1 audit of `main`@`a58d4b3`. **No Windows build ships until W-SV1 (🅷) clears** —
> but cloud STT may not need local whisper (confirm engine-side) → these become live. Validate runtime
> items via `pnpm dev` on Windows (this dev box). All in-repo unless flagged.
> **✅ Quick-wins shipped in v0.5.1** (PR #2 — gate-green, 2-reviewer SHIP, merged `a28a24d`): WIN-1, WIN-3,
> WIN-4, WIN-11, WIN-13d, WIN-14. The macOS-relevant subset (WIN-4 + the secret false-success fix) is live
> in the v0.5.1 DMG; keycap/copy changes are inert on mac until the Windows build unblocks.

### Tier 1 — first 5 minutes on Windows
- ✅ **WIN-1** [shipped v0.5.1] Platform-aware keycaps — Windows shows Ctrl/Alt/Win/Shift text
  (`CommandOrControl`→Ctrl, never ⌘); mac glyphs unchanged. `src/keycaps.ts` + renderer mirror + `platform`
  via preload + a parity test enforcing the KEYCAP CONTRACT. `high/M` ⭐ · bug
- **WIN-2** HUD pinned above taskbar/Start (`setAlwaysOnTop('screen-saver')`), default-ON, no dismiss →
  intrusive on Windows. `high/S` · bug
- ✅ **WIN-3** [shipped v0.5.1] Degraded-PTT "Input Monitoring" copy platform-branched (mac-only); settings
  note hidden + Ctrl+Alt hints on Windows. `medium/S`
- ✅ **WIN-4** [shipped v0.5.1] Persistence write-safety — new `src/atomic-write.ts` (unique temp, retry on
  transient Windows lock errors, overwrite fallback, throws); secret-store propagates failure (kills the
  false-success bug), kv-store best-effort + warns. `high/M` ⭐ · bug
- ✅ **WIN-5** Hotkey capture maps Windows Ctrl → `CommandOrControl` and Win → `Super`; Windows hints use
  Ctrl/Alt/Win vocabulary. Punctuation capture still uses layout-dependent `e.key` as a lower-risk follow-up. `medium/M` · bug

### Tier 2 — correctness / parity
- **WIN-6** Window/pill geometry not DPI/`scaleFactor`-aware → mis-place/size on mixed-DPI multi-monitor. `medium/M` · bug
- **WIN-7** Second-instance won't foreground settings on Windows (`app.focus({steal})` darwin-only). `medium/S` · bug
- **WIN-8** Tray left-click is a no-op on Windows (no `tray.on('click')`); 18px PNG icon, no ICO/DPI variants. `medium/S`
- ✅ **WIN-9** Remote-STT API key stored in `SecretStore`, with a secret-backed KV adapter for the capture runtime. `medium/S` · 🔒 (ADR-007 decision)
- ✅ **WIN-10** "macOS Speech" hardcoded engine label shown on Windows (fallback is SAPI5). `low/S`
- ✅ **WIN-11** [shipped v0.5.1] NSIS installer welcome page + `publish.repo` → SigmaVoice (were SigmaLink). `medium/S`
- **WIN-12** Packaged `WinKeyServer.exe` inclusion unverified → could silently break PTT. `medium/S` (gated on W-SV1)

### Tier 3 — polish / posture
- **WIN-13** Windows polish bundle (see research §Tier 3): ✅ (a partial) settings `vibrancy`/`hiddenInset`/`transparent`
  are now darwin-only; HUD `backdrop-filter`/theme fallback remains; (b) `0o600/0o700`
  modes ignored on Windows (mitigated by DPAPI); (c) `setVisibleOnAllWorkspaces` over-fullscreen promise
  mac-only; ✅ (d) [shipped v0.5.1] set `productName` → fixes dev↔packaged userData divergence; (e) NSIS config
  completeness; (f) no `install-windows.ps1`; (g) drop redundant `npm_config_build_from_source`; (h) base64-fallback
  "no OS keyring" copy. `low/varies`

### Infra
- ✅ **WIN-14** [shipped v0.5.1] `ci.yml` is now a `[macos-14, windows-latest]` matrix (early Windows signal);
  also fixed the `pnpm test` glob (single→double quotes) so it isn't a vacuous no-op under cmd.exe on Windows. `medium/S` ⭐
- ✅ **WIN-15** `release.yml` build-windows now installs MSBuild + Python explicitly before native rebuilds. `medium/S` (latent, gated W-SV1)

### Follow-ups (from the v0.5.1 PR #2 review — non-blocking)
- **WIN-16** Unify platform detection: `renderer/js/capture.js` derives `isWin` from `window.bridgeVoice.platform`
  only, while `renderer/js/keycaps.js#defaultPlatform()` has a richer fallback — they can disagree if the
  preload fails to load. Share one helper. `low/S`
- **WIN-17** `build/dmg/README — Open SigmaVoice.txt` still links the macOS "Source" to
  `github.com/s1gmamale1/SigmaLink` — the mac-side twin of WIN-11 (pre-existing). Repoint to SigmaVoice. `low/S`

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
