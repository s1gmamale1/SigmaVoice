# SigmaVoice — Roadmap

SigmaVoice is a local-first, system-wide voice→text dictation app for macOS (Apple Silicon): global
hotkey → on-device Whisper (macOS Speech fallback) → clipboard + AX-paste into the focused app; tray-only,
unsigned/internal-use. **Shipped: macOS arm64 v0.3.2 (2026-05-29).** The voice engine + native modules
live in the shared **SigmaLink submodule** (`./sigmalink/`, single source of truth). The detailed,
file:line-grounded evidence behind every phase is in
[`_research/codebase-findings.md`](./_research/codebase-findings.md) (69 adversarially-verified findings)
and [`_research/bridgevoice-video-analysis.md`](./_research/bridgevoice-video-analysis.md) (competitive
teardown). Raw/parked ideas live in [`WISHLIST.md`](./WISHLIST.md); IDs (`UX-*`, `FE-*`, `PF-*`, `CA-*`,
`SEC-*`, `ENG-*`) are shared across all three docs.

This ROADMAP is the single source of truth for what to build next.

---

## How to read this

- **Phases are ordered by value/effort**, with cross-phase prerequisites called out.
- **Effort** is S (≤½ day), M (1–2 days), L (3–5 days), XL (>1 week).
- **Confirmed bugs are fixed first** (hotlist below), then feature phases.
- **🔧 engine** items live in the SigmaLink submodule — authored upstream, pulled in via a submodule pin
  bump (native-gotchas #7). Everything else is app-shell (this repo).
- **🔒 posture** reversals (cloud-by-default, accounts, signing, Linux, wake-word) are **not** scheduled —
  they need an ADR first (see Architecture decisions).

---

## Confirmed bugs to fix first (hotlist)

App-shell bugs surfaced by the audit, fixed in **Phase 0**. (Engine bugs W-SV1/W-SV2/ENG-3 are in Phase 4.)

| # | Sev | Bug | Where (file:line) | Effort |
|---|-----|-----|-------------------|--------|
| CA-3 | High | `app.whenReady().then()` has no `.catch()` → a boot-time engine throw becomes a silent inert process (no tray/window/feedback) | `src/main.ts:312` (`buildGlobalCaptureController` at `:324`) | S |
| UX-1 | High | Tray icon is `nativeImage.createEmpty()` — invisible menu-bar item, the only affordance for a tray-only app | `src/main.ts:167-173` (assets exist at `build/icon.*`) | S |
| CA-6 | Med | Recording HUD has no time bound; a missed terminal event pins the always-on-top overlay over the user's screen until quit | `src/hud-window.ts:195` (only `transcribing` capped, `:70/208`) | S |
| UX-10 | Med | `bv:setHotkey` accepts any non-empty string; an invalid accelerator fails to bind while the UI toasts "Hotkey updated" | `renderer/settings.html:1067`; engine warns only `global-capture.ts:372-377` | S |
| UX-15 | Med | Dictionary injects fake example rows that get **saved as real data** if the user hits Save without editing | `renderer/settings.html:1197-1211, 1287-1300` | S |
| UX-5 | Low | `.status-badge` class is undefined → the "✓ Active" model tag renders unstyled | `renderer/settings.html:1130` (defined class is `.state-badge :217`) | S |
| CA-4 | Low | Double "push-to-talk degraded" notification on startup (two un-deduped call sites) | `src/main.ts:231` & `:360` | S |
| CA-8 | Low | `pnpm dev` (`electron src/main.ts`) can't run raw ESM TypeScript under Electron 30 — documented source-run path is broken | `package.json:10` | S |

---

## Phase 0 — Make it present, functional & honest

**Goal.** The tray app is visibly present, never boots into a silent inert state, gives truthful feedback on every action, and the first dictation of a session is fast.

**Deliverables.**
- A real menu-bar tray icon (16/32px monochrome template PNG + a recording-state variant) wired via `createFromPath(...).setTemplateImage(true)`.
- A **Clipboard-only output** toggle (skip AX-paste) in Settings → Capture.
- Whisper **model prewarm** fired once after capture is enabled / model resolves.
- A determinate **model-download progress bar** (`NN MB of NN MB`) + a working **Cancel** button (wires the already-exposed `bv.abortDownload`).
- The 8 hotlist bug fixes above.

**Why now.** These are the highest impact-to-effort items and all app-shell/low-risk. The app currently ships an invisible tray icon, can boot into an inert state, claims success on failed hotkey binds, and pays full model-load latency on the first dictation — Phase 0 removes the "looks broken" surface before any deeper work.

**Scope.**
- Tray (UX-1): add a template-image asset to the renderer/build copy globs; load it in `initTray()` `src/main.ts:167-173`; swap to a filled/red variant while `status.state==='recording'` (`updateTray` already runs on state change `:333`).
- Boot guard (CA-3): wrap the `whenReady` body `src/main.ts:312-367` in try/catch → `Notification` + degraded tray (Quit still works).
- HUD ceiling (CA-6): add a ~10-min last-resort auto-hide + a click/shortcut dismiss in `src/hud-window.ts` (HUD is `focusable:false` but not mouse-ignoring, so a click handler works).
- Honest hotkey toast (UX-10): validate main-side in the `bv:setHotkey` handler `src/main.ts:219-223` (note: `resolveMainKey` is main-process-only, not importable in the renderer) and/or return success so `renderer/settings.html:1063-1068` can show "Couldn't bind".
- Dictionary empty state (UX-15): replace the fake rows `renderer/settings.html:1197-1211` with a real empty state; render only saved entries.
- Quick fixes: UX-5 (`className='state-badge routing'`), CA-4 (module-level `degradedWarned` guard), CA-8 (`electron --import tsx` or build-then-run), UX-12 (report dropped over-long dictionary entries), UX-9 (drop the `statsLoaded` guard on the Usage tab), UX-11 (`.focus()` the created settings window), CA-5 (delete `void os`, dedupe `HudLike`).
- Clipboard-only (FE-4): Settings toggle persisted in KV; branch the output path (engine owns the paste; app-shell sets policy via the injected clipboard).
- Prewarm (PF-1): in `whenReady()` after `captureCtrl` is built and `getDownloadedModelPath()` resolves, import `getWhisperEngine` (`@sigmalink/voice-core` `index.ts:36`) and run a fire-and-forget warm `transcribe`; re-warm on `bv:setModelId`.
- Progress bar (FE-9): render `p.fraction` from `onModelDownload` into a thin track in the model row `renderer/settings.html:1176-1177`; add a Cancel calling `bv.abortDownload` (`preload.ts:27`).
- PF-4: HUD clock → `setInterval` (write only on second change) `renderer/hud.html:207-218`.

**Findings + recommendation.** All items verified against code with file:line (see `_research/codebase-findings.md` §A,D,E,F). Every item is app-shell, no new deps, no posture conflict. Recommend shipping as one batch behind the `pnpm typecheck` + `pnpm build` gate; each is independently revertable.

**Risks.** Tray template image rendering differs light/dark → use `setTemplateImage(true)` and test both. Prewarm could add a brief CPU blip at launch → fire off the event loop, after a model is confirmed downloaded. Clipboard-only toggle interacts with the engine's output-router → keep the AX-paste default; gate purely in the app-shell policy.

**Definition of done.** A fresh launch shows a visible tray icon; choosing Settings/Enable works; an engine boot failure shows a notification and a Quit-able tray (no silent inert process); a malformed hotkey shows a failure toast (not "updated"); saving an untouched dictionary persists **zero** rows; the first dictation after enabling starts transcribing with no multi-hundred-ms model-load stall; a model download shows a filling bar and can be cancelled; `pnpm typecheck` + `pnpm build` pass.

---

## Phase 1 — Apple-grade UI/UX pass

**Goal.** The settings window and recording HUD look and behave Cupertino-grade — adaptive appearance, real materials, honest feedback, spring motion, and accessible targets.

**Deliverables.**
- `@media (prefers-color-scheme: light)` token set (settings currently dark-only).
- `titleBarStyle:'hiddenInset'` + `vibrancy:'under-window'` window (kills the double titlebar) + min-size.
- Settings restyled to selectable **cards + capability chips** (BridgeVoice-inspired), iOS-style toggles.
- A **Status dashboard** (active model + readiness, hotkey as ⌘⌥⎵ keycaps, mode, live permission grants).
- An **Overview** stats panel: Words / Speaking-Time / **Sessions** / **Avg WPM** + recent-activity feed.
- An honest "listening" HUD animation (replaces the fake equalizer) + idle/error/no-input/done states.
- CSS `linear()` spring on HUD entrance + toggle; 44pt hit targets; 8pt spacing normalization.

**Why now.** With the app functional (Phase 0), the next-highest-value lever is perceived quality — this is a UI/UX-first roadmap and the settings/HUD are the whole face of the product. Most items are renderer-only and compose into one coherent restyle.

**Scope.** Use the `apple-design` skill family. Light mode (UX-2) `settings.html:17-55`; window chrome (UX-3) `src/main.ts:186-198`; card/chip restyle (UX-21) + Status dashboard (UX-13) `settings.html:760-783`; keycaps (UX-19) `settings.html:795,1008`; WPM/Sessions/Overview (FE-5) — engine `voice-stats` already aggregates, surface it; honest HUD animation (UX-6, app-shell half) + states (UX-8) `renderer/hud.html`, `src/hud-window.ts:37`; springs (UX-7), 44pt (UX-4), spacing (UX-14), accent fix (UX-16), HUD ARIA (UX-20), toast actions (UX-17). Full pointers in `_research/codebase-findings.md` §B,C.

**Findings + recommendation.** The renderer is vanilla HTML/CSS/JS with a clean token system already; an Apple-grade pass is CSS-token + small-JS work with no framework and no new deps. Real audio-level rendering (the premium HUD waveform) needs **ENG-5** (Phase 4) — ship the honest indeterminate animation now, upgrade later.

**Risks.** Vibrancy + transparent body can regress contrast → honor `prefers-reduced-transparency` (already present `:58-64`) and verify WCAG AA. Over-springing a utility surface feels gimmicky → one tasteful spring on the HUD entrance, keep reduced-motion kill-switches.

**Definition of done.** Settings respects system light/dark; no double titlebar; the glass samples real window vibrancy; Status shows model/hotkey(keycaps)/mode/permissions at a glance; the Usage tab shows Words/Time/Sessions/WPM; the HUD never shows a bouncing waveform during silence; all interactive targets ≥44pt; VoiceOver announces HUD state correctly; reduced-motion/transparency honored; `pnpm typecheck` + `pnpm build` pass; before/after screenshots captured.

---

## Phase 2 — Signature features (BridgeVoice parity + beyond)

**Goal.** SigmaVoice is a daily-driver dictation tool: a persistent floating pill, a guided first run, searchable history, mic selection, and an optional local prompt-cleanup pass.

**Deliverables.**
- A persistent, draggable **floating dictation pill** (idle / listening / processing), click-to-dictate, position persisted in KV.
- A **first-run onboarding** panel: Mic + Accessibility + Input-Monitoring checklist with live status + deep links.
- A searchable **transcription history** with per-row "Add to Dictionary".
- A **mic input-device picker** (preferred + "active now" fallback).
- An optional **local prompt-cleanup pass** ("Custom Instructions": camelCase/punctuation/strip-filler/verbal commands), default OFF.
- Dictionary **`@repo`/agent-reference recipes** (examples + docs), a local **what's-new modal**, and a **version-check nag**.

**Why now.** These are the features that close the gap with BridgeVoice's signature UX (the always-visible pill, dictionary tricks, prompt cleanup) while staying local-first. They depend on the Phase-0 plumbing and Phase-1 visual language being in place.

**Scope.** Floating pill (FE-2) extends `src/hud-window.ts` (reuse `focusable:false :108`, `showInactive :182`, `type:'panel' :122`; mind the blur-on-focus guard `:142-145`); driven by the existing `voice:global-capture-state` stream + `bv:startRecording/stopAndTranscribe` (`src/main.ts:241-242`). Onboarding (FE-1): reuse the settings window, `shell.openExternal` deep-links (`x-apple.systempreferences:…Privacy_Microphone/Accessibility/ListenEvent`), KV first-run flag. History (FE-6) + empty-state-to-history link (UX-15). Mic picker (FE-8). Local cleanup (FE-3): a transform after `normalizeTranscript` `global-capture.ts:539`, runner dep-injected (mirror `cli-transcribe-engine` pattern) — **local CLI/model only** (cloud = ADR-002). Recipes (FE-7), what's-new (FE-11), version nag (FE-14). Pointers in `_research/codebase-findings.md` §C,D + `bridgevoice-video-analysis.md` §F.

**Findings + recommendation.** The HUD already proves the hard parts of the pill (a focus-preserving non-activating panel), so the pill is an app-shell extension, not a new capability. BridgeVoice's standout dictionary/`@repo` trick is just a usage pattern our engine already supports. Recommend FE-2 + FE-1 first (biggest perceived wins), then the dictionary/history loop.

**Risks.** A clickable pill fights the HUD's blur-on-focus guard (`hud-window.ts:142-145`) → a click hit-region must preserve focus-return; budget the L estimate for this. Local cleanup that shells an LLM CLI must stay opt-in and local, or it crosses the posture line (becomes ADR-002). Onboarding deep-links are macOS-version-sensitive → degrade to a plain "open System Settings" if a URL scheme fails.

**Definition of done.** An opt-in floating pill is visible at idle, draggable, remembers its position, starts/stops dictation on click, and never steals focus; a first run walks an operator through all three permissions with live status; history is searchable and a row can be promoted to the dictionary in one click; the active mic is selectable; an opt-in cleanup pass reformats a sample dictation locally with cloud OFF by default; `pnpm typecheck` + `pnpm build` pass.

---

## Phase 3 — Longevity, security & performance hardening

**Goal.** The app-shell is testable, the supply chain is pinned, clipboard privacy residue is handled, and idle resource use is bounded.

**Deliverables.**
- A `node:test`+`tsx` harness covering the 3 pure modules + a `pnpm test` CI step.
- `settings.html` split into `settings.html` + `settings.css` + small JS modules (<500 lines each).
- Committed `pnpm-lock.yaml` + CI `--frozen-lockfile` + a non-blocking `pnpm audit`.
- A **clipboard-residue policy** (save/restore prior clipboard, or clear after paste, or a setting).
- Installer hardening: per-release **SHA-256 verification** + `vX.Y.Z` tag-regex + explicit sudo.
- Electron defense-in-depth: CSP in both renderers, `setWindowOpenHandler`/`will-navigate` deny, `sandbox:true`, dictionary-`replacement` length/control-char cap, scoped `adhoc-sign` chmod.
- Whisper context **idle-eviction** + HUD idle teardown + debounced/async KV persist.

**Why now.** Once features land, the codebase needs to stay maintainable and trustworthy. There are zero app-shell tests today and the two boundaries most likely to silently break (the accelerator map, the input-validation layer) are untested; the supply chain is unpinned for a curl|bash-distributed binary; and a privacy-positioned tool leaves transcripts on the system clipboard.

**Scope.** Tests (CA-1): `resolveMainKey` (`hotkey-manager.ts:138`), `settings-data.ts`, `kv-store.ts`; wire into `ci.yml:39-43`. Split (CA-2). Lockfile (SEC-3) `.gitignore:3` + `ci.yml:37`/`release.yml`. Clipboard policy (SEC-6) `output-router.ts:293…` (engine owns the write; app-shell chooses policy via the injected clipboard, then bump the pin). Installer (SEC-7) `scripts/install-macos.sh:58-68,91,139`. CSP/nav/sandbox/cap (SEC-1/2/4/5) `src/main.ts`, `renderer/*.html`. adhoc-sign (SEC-8) `scripts/adhoc-sign.cjs:49-67`. Perf: idle-eviction (PF-2), HUD idle teardown (PF-3), KV debounce (PF-5/PF-7). Full detail in `_research/codebase-findings.md` §E,F,G.

**Findings + recommendation.** All app-shell except the clipboard *durable* fix (engine). The CSP/nav/sandbox items are defense-in-depth (no live XSS today — every sink is `textContent`/`.value`), so they're low-effort insurance, not emergencies. Recommend leading with tests + lockfile + clipboard policy (highest real value).

**Risks.** A strict CSP breaks the inline `<script type=module>` → move scripts to external `.js` emitted by `build.cjs`, or scope `style-src 'unsafe-inline'` only. Clipboard save/restore can race a fast second dictation → restore on a short post-paste delay, guard re-entrancy. `--frozen-lockfile` will fail CI until the lockfile is committed → land them together.

**Definition of done.** `pnpm test` runs in CI and covers the three pure modules; `settings.html` and each split file are <500 lines; CI installs with `--frozen-lockfile` against a committed lockfile; the prior clipboard is restored (or the transcript cleared) after a paste; the installer verifies a published SHA-256 and rejects a tampered DMG; all three windows set `sandbox:true` + a CSP; idle RAM drops after N minutes of no dictation; `pnpm typecheck` + `pnpm build` pass.

---

## Phase 4 — Engine / native (🔧 SigmaLink submodule)

**Goal.** Windows builds and pastes, per-dictation latency drops, and the quit-time crash + cloud-path hang are fixed — all authored upstream in SigmaLink and pulled in via a submodule-pin bump.

**Deliverables.**
- A green **Windows NSIS build** (W-SV1 fixed) + Windows **keystroke-inject** (ENG-1) so paste works.
- Whisper **`audio_ctx` trimming** for short clips (ENG-7) — the biggest per-dictation latency win.
- A voice-core **audio-level signal** (ENG-5) enabling the real HUD waveform (upgrades UX-6).
- A **Gemini-CLI spawn timeout** (ENG-3); the **W-SV2** TSFN-release fix; the SigmaLink-routing standalone opt-out (ENG-2); redirect host-allowlist (ENG-4); `-mcpu` baseline (ENG-6); thread autodetect (ENG-8); paste-delay trim (ENG-9).

**Why now.** Unblocking Windows is the single biggest scope expansion, but it can't be validated locally (needs a `windows-latest` runner) and touches the shared engine, so it's sequenced after the macOS app is polished. The latency/HUD-level engine work pairs naturally with the same submodule iteration.

**Scope (prerequisite: each fix authored in SigmaLink → `git -C sigmalink checkout <sha>` → submodule pin bump → CI builds natives).** W-SV1 (`sigmalink/app/native/voice-whisper/binding.gyp`): remove the `GGML_USE_CUDA=0` define `:84`, add `GGML_USE_CPU`, add `ggml-cpu-hbm.cpp`, fix x64 arch/`-march`/aarch64 + add `cpu-feats-x86.cpp` `:86-89` — diff `sources`/`defines` against whisper.cpp v1.7.4 CMake, iterate on a Windows runner. ENG-1: add `sendPasteKeystroke` (SendInput Ctrl+V) + `typeUnicode` to `voice-win`, wire the win branch of `output-router.ts:314-323`. ENG-7: set `params.audio_ctx` from clip length `whisper_bridge.cc:211-225`. ENG-5: emit a 0–1 level on the capture event. W-SV2: `napi_tsfn_abort`/env-cleanup-hook in `voice-mac/src/tsfn_bridge.*`. Detail in `_research/codebase-findings.md` §H + `docs/08-bugs/OPEN.md`.

**Findings + recommendation.** W-SV1 root cause is a high-confidence hypothesis but `vendor/whisper.cpp/` is an unchecked-out nested submodule, so confirm against upstream on the runner before declaring it fixed. The four sub-causes are one bug — fix together in one Windows-runner iteration. Recommend W-SV1 → ENG-1 first (makes Windows a real product), then ENG-7/ENG-5 (latency + HUD), then the low-priority cleanups.

**Risks.** No local Windows → all W-SV1 iteration is CI round-trips (slow); budget XL. Changing whisper threads/`audio_ctx` can affect accuracy → validate WER on sample clips; Metal builds may be GPU-bound so extra CPU threads may not help (ENG-8 — measure). Engine edits affect SigmaLink's own in-app voice too → coordinate, run the shared tests, and bump the pin only when green.

**Definition of done.** `release.yml` `build-windows` completes and produces an installable NSIS; on Windows a dictation pastes into the focused app (not just clipboard); a 2-word dictation's transcribe latency measurably drops vs baseline; the HUD bars track real input level; quitting after a recording emits no SIGABRT crash report; the submodule pin is bumped and macOS CI stays green.

---

## Architecture decisions (ADRs)

### ADR-001 — Local-first, unsigned, internal-use posture
**Decision.** SigmaVoice stays local-first (on-device Whisper, no telemetry/accounts/cloud-by-default), unsigned (mac ad-hoc / win no Authenticode), internal-use, macOS arm64 + Windows x64 only.
**Context.** It's a free internal counterpart to BridgeMind's commercial **BridgeVoice** (Tauri/Rust, $40/mo, account-gated, cloud-preferring, signed, cross-platform incl. Linux). Matching BridgeVoice's commerce/cloud model is out of scope.
**Consequences.** (+) No backend, no accounts, full privacy, simple distribution. (+) Clear "won't do" line keeps scope tight. (−) No auto-update on mac (Squirrel needs notarization), Gatekeeper friction on install, no Linux. Reversing any of these (cloud transcription opt-in, signing+auto-update, wake-word, Linux) requires a new ADR — these are tracked as 🔒 items in WISHLIST, **not** scheduled phases.

### ADR-002 — Cloud / AI-cleanup paths are opt-in and local-by-default
**Decision.** The engine's Gemini-CLI cloud transcribe path and any AI prompt-cleanup ship **off by default, explicit opt-in**; the cleanup pass (FE-3) is implemented against a **local** CLI/model. A cloud LLM for cleanup is deferred pending an ADR.
**Context.** The engine already contains a Gemini-CLI transcribe path (unreached) and BridgeVoice's headline differentiator is an LLM cleanup pass; both touch the cloud line in ADR-001.
**Consequences.** (+) Preserves local-first default while exposing latent capability. (+) Multilingual-local models become a genuine edge over BridgeVoice. (−) A cloud toggle, if ever added, ships audio off-device → must be loud, opt-in, account-free, and is its own ADR. Prereq: ENG-3 (spawn timeout) before any cloud path is wired.

### ADR-003 — Engine + natives via the shared SigmaLink submodule (single source of truth)
**Decision.** `voice-core` and the native modules are never vendored/copied here; they're consumed via `link:` deps from the `./sigmalink/` submodule and edited upstream, then pulled via a pin bump.
**Context.** The same voice stack powers SigmaLink's in-app voice; one source prevents drift.
**Consequences.** (+) No fork drift; fixes benefit both products. (−) Engine fixes (Phase 4, W-SV1/W-SV2) are a two-repo dance and Windows work needs CI iteration. The submodule pin is the CI source of truth (native-gotchas #7).

### ADR-004 — Ruflo MCP at local scope, shared SigmaLink AgentDB
**Decision.** The ruflo MCP server is registered **per machine at local scope** (`claude mcp add ruflo -s local`) with `CLAUDE_FLOW_DIR` → `/Users/aisigma/projects/SigmaLink/app/.claude-flow`; `.mcp.json` stays empty. The worker daemon is per-repo (cwd-bound).
**Context.** A project-scope `.mcp.json` def requires a manual `/mcp` approval that silently leaves tools unloaded; local scope auto-loads. Verified 2026-05-31 with a `patterns` write → `memory_search_unified` round-trip.
**Consequences.** (+) Tools load reliably; patterns/feedback are cross-readable with SigmaLink. (−) Shared store is **sequential-use** — run SigmaVoice *or* SigmaLink agents, not both live (sql.js lock contention).

### ADR-005 — ROADMAP/WISHLIST live in `docs/03-plan/` (not repo root)
**Decision.** Keep the planning docs under `docs/03-plan/` per the project docs map (CLAUDE.md), with the `_research/` evidence base alongside.
**Context.** The `/roadmap` skill defaults to repo root, but this project already standardizes on `docs/03-plan/` (referenced across HANDOFF/CLAUDE.md/WISHLIST).
**Consequences.** (+) No doc fragmentation; one discoverable plan tree. (−) Deviates from the skill default — noted here so future agents don't create a duplicate root file.

---

## Effort / impact table

| Item | Phase | Effort | Impact | Notes |
|------|-------|--------|--------|-------|
| Tray icon + boot guard + hotlist bugs | 0 | M (sum of S's) | High | Removes the "looks broken" surface; do first |
| Clipboard toggle + prewarm + download UX | 0 | M | High | BridgeVoice parity + first-dictation latency |
| Apple-grade restyle (light/vibrancy/cards/dashboard) | 1 | L | High | The whole face of the product |
| WPM/Sessions/Overview dashboard | 1 | S | Medium | Engine already aggregates stats |
| Honest HUD animation + states | 1 | M | Medium | App-shell now; real level via ENG-5 |
| Floating dictation pill | 2 | L | High | BridgeVoice signature; HUD proves the pattern |
| First-run onboarding + permissions | 2 | L | High | Highest value under Gatekeeper friction |
| History + dictionary recipes + mic picker | 2 | M–L | Medium | Tightens the dictation loop |
| Local prompt-cleanup pass | 2 | M | Medium | Opt-in/local only (ADR-002) |
| Test harness + CI test step | 3 | M | High | Zero app-shell tests today |
| Clipboard-residue policy | 3 | M | High | Real privacy leak for a local-first tool |
| Lockfile pin + installer SHA-256 | 3 | S–M | Medium | Supply chain for curl\|bash artifacts |
| CSP / sandbox / nav / dict-cap / adhoc-sign | 3 | S each | Low–Med | Defense-in-depth |
| Idle eviction / HUD teardown / KV debounce | 3 | S–M | Low | Bounds idle resource use |
| W-SV1 Windows build + ENG-1 keystroke | 4 | XL | High | Unblocks Windows; CI-only iteration |
| ENG-7 audio_ctx / ENG-5 audio level | 4 | M each | Medium | Latency + real HUD waveform |
| W-SV2 / ENG-2/3/4/6/8/9 cleanups | 4 | S–M each | Low | Engine hygiene |

## When an item ships
→ move its one-line note to the GitHub Release notes + `docs/10-memory/master_memory.md`; delete it from
the relevant phase. Keep `WISHLIST.md` for new raw findings/ideas. Engine items: bump the submodule pin (#7).
