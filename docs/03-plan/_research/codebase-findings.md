# SigmaVoice — Codebase Deep-Dive Findings (evidence base)

> **Auto-generated 2026-05-31** by a 5-dimension audit (code/arch, UI-UX Apple, performance,
> engine+bugs+features, security/privacy) with **adversarial verification of every finding** —
> each was re-opened against the actual code, ungrounded claims dropped, impacts re-rated for a
> ~2,900-LOC unsigned/internal tray app, and posture conflicts confirmed. **69 findings survived.**
>
> This is the **evidence trail**. The scannable capture is [`WISHLIST.md`](../WISHLIST.md); the
> sequenced plan is [`ROADMAP.md`](../ROADMAP.md). IDs here are referenced from both.
> Companion: [`_research/bridgevoice-video-analysis.md`](./bridgevoice-video-analysis.md).
>
> Legend: `impact/effort` (effort S/M/L) · **🔒 posture** = conflicts with locked posture → ADR
> candidate, not a normal item · **🔧 engine** = lives in the SigmaLink submodule (author upstream,
> bump the pin) · ⭐ = high impact-to-effort.

---

## A. Tray & first-run

- **UX-1 — Tray icon is empty (`nativeImage.createEmpty()`).** `high/S` ⭐ · bug —
  `src/main.ts:167-173` ships a blank menu-bar icon (stub comment "replace in production") even
  though `build/icon.{png,icns,ico}` exist (those feed electron-builder, **not** the live Tray). For
  a Dock-hidden tray-only app the menu-bar glyph is the *only* persistent affordance — it's currently
  invisible. → Bundle a 16/32px monochrome template PNG, `createFromPath(...).setTemplateImage(true)`;
  optional red/filled variant while `state==='recording'` (`updateTray` already runs on every state).
- **FE-1 — No first-run onboarding / permissions flow.** `medium/L` · feature —
  app needs Microphone + Accessibility + Input-Monitoring; `grep` confirms no
  `systempreferences`/`openExternal`/`getMediaAccessStatus`/`firstRun` anywhere (`src/`,`renderer/`).
  Only feedback is `warnPushToTalkDegraded()` (`main.ts:85-104`) *after* silent failure. → First-run
  panel in the settings window (no new window/dep): 3-permission checklist w/ live status +
  `shell.openExternal` deep-links (`x-apple.systempreferences:…Privacy_Microphone/Accessibility/ListenEvent`),
  gated on a KV first-run flag. Unsigned/Gatekeeper friction makes this *more* valuable.

## B. Apple-grade UI/UX (renderer — `renderer/settings.html`, `renderer/hud.html`)

- **UX-2 — Hardcoded dark-only; ignores system appearance.** `high/M` · ux —
  `settings.html:17-55` single dark `:root`; only `prefers-reduced-transparency`/`-motion` queries;
  `grep prefers-color-scheme` → 0, `grep nativeTheme` in `src/` → 0. → Add
  `@media (prefers-color-scheme: light)` token override (light bg `#f2f2f7`, accent `#007aff`). CSS only.
- **UX-3 — Double titlebar + no window vibrancy.** `medium/M` · ux —
  `main.ts:186-198` creates the window with no `titleBarStyle`/`vibrancy`/`frame`/min-size, so macOS
  draws traffic-lights **above** the custom 38px `.titlebar` (`settings.html:94-103,743-745`); the
  `.card` `backdrop-filter: blur(20px)` (`:169-170`) blurs only the opaque body → expensive, no real
  material. → `titleBarStyle:'hiddenInset'` + `vibrancy:'under-window'` + transparent body; add
  `minWidth/minHeight` (window is currently freely resizable).
- **UX-21 — Settings restyle to selectable cards + capability chips** (BridgeVoice-inspired). `medium/M`
  · ux — reskin to BV's card+chip language (Local/Cloud cards, model rows w/ size + "Download required"
  pill, iOS toggles). Renderer-only; leverage the `apple-design` skill family.
- **UX-4 — Hit targets below Apple's 44pt.** `medium/M` · ux — toggle 40×24 (`:258-263`), nav-tab
  ~21px (`:123/131`), seg-btn (`:317-331`), dict-remove 2×4px (`:576-587`), `.row` min-height 42
  (`:184`). → Bump `.row`→44, pad toggle/×/chip hit-areas; `:focus-visible` already defined (`:10-14`).
- **UX-5 — Undefined `.status-badge` class → unstyled "✓ Active" tag.** `medium/S` · bug —
  `renderModels()` sets `className='status-badge'` (`:1130`) but that class has **no CSS** (single grep
  hit); the defined class is `.state-badge` (`:217-244`). → `className='state-badge routing'`. One line.
- **UX-7 — Canned cubic-bezier easing, not Apple springs.** `low/S` · ux — `--ease-out` (`:52`),
  HUD `hud-in 240ms` (`hud.html:54`). → CSS `linear()` spring on HUD entrance + toggle thumb (keep the
  reduced-motion kill-switches). Don't over-apply.
- **UX-14 — Spacing/type drift off the 8pt grid; sub-12px copy.** `low/M` · ux —
  11px nav/header, 10px th/stat-label/tip (`:131,207,506,621,855`); mixed 5/8/9/14px paddings. →
  Normalize to 4/8; 11px text floor.
- **UX-16 — Accent overload: systemGreen used for both switch-on and the `routing` badge.** `low/S` ·
  ux — `--green` at `:281-283` (switch, OK by macOS convention) **and** `.state-badge.routing` (`:243`)
  while the single accent is systemBlue. → Give `routing` a distinct treatment so green means one thing.
- **UX-19 — Hotkey shown as raw accelerator `CommandOrControl+Alt+Space`, never keycaps.** `low/S` ·
  ux — input placeholder (`:795`), value (`:1008-1010`), engine default (`global-capture.ts:188`), tray
  label (`main.ts:130`). → Map tokens→glyphs (⌘⌥⇧⎵), render styled `<kbd>`; tray reuses it.
- **UX-13 — Status tab is thin (badge + Enable toggle only).** `medium/M` · ux — `settings.html:760-783`;
  active model + hotkey + mode + permissions are scattered/absent → tab-hopping. → Make Status a
  dashboard (model+ready, hotkey as keycaps, mode, live permission grants w/ fix links). Data already in
  `getStatus()`/`listModels()`.

## C. Recording HUD & floating pill (`src/hud-window.ts`, `renderer/hud.html`)

- **UX-6 — HUD shows a FAKE equalizer.** `medium/M` · ux — `hud.html:99` ("NOT real audio"), 7 bars on
  fixed keyframe delays (`:108-128`) — identical during speech and silence, masking a dead-mic failure.
  Verified the engine emits **no** level (`grep level/rms/amplitude` in voice-core + voice-mac → none).
  → **(b, ship now, app-shell):** replace with an honest indeterminate "listening" breathing animation.
  **(a, premium):** real level via 🔧 **ENG-5**.
- **UX-8 — HUD has only `recording`/`transcribing`; no idle/error/no-input/done.** `medium/M` · ux —
  `hud-window.ts:37`; engine `CaptureState` also has `routing` (`global-capture.ts:113`) but `syncHud`
  maps it to `hide()` (`main.ts:112`); 90s safety hide is silent. → Extend `HudState` + render an
  error/no-input/success state. Render now; richer triggers need 🔧 ENG.
- **UX-20 — HUD ARIA mis-announces "recording" in the fail-visible/idle default.** `low/S` · ux —
  static `data-state='recording'` + `aria-live='polite'` (`hud.html:167`); `applyState` swaps only the
  visual, never a live-text/`aria-label` (`:228-236`). → Visually-hidden live-text updated per state.
- **CA-6 — Recording HUD has no upper time bound (only `transcribing` is 90s-capped).** `medium/S` · bug
  — `hud-window.ts:195` clears the safety timer for `recording`; if the engine emits `recording` then no
  terminal state (native crash / W-SV2 teardown), the screen-saver-level overlay pins over the user's
  work until quit. → ~10-min last-resort ceiling + a click/shortcut dismiss (HUD is `focusable:false`
  but **not** mouse-ignoring — no `setIgnoreMouseEvents`, so a click handler works).
- **FE-2 — Floating always-visible dictation pill** (BridgeVoice signature). `medium/L` · feature —
  the HUD already proves the hard parts: `focusable:false` (`:108`), `showInactive()` (`:182`),
  `type:'panel'` (`:122`), `skipTaskbar` (`:119`), `setVisibleOnAllWorkspaces` (`:138`); today it only
  shows during capture (`syncHud` hides on idle, `main.ts:112`). → Opt-in persistent draggable idle pill
  (idle/listening/processing), click-to-dictate via existing `bv:startRecording/stopAndTranscribe`
  (`main.ts:241-242`), position persisted in KV. **Care:** `hud-window.ts:142-145` blurs on any focus —
  a clickable variant must preserve focus-return.

## D. Features (dictation product — BridgeVoice parity + beyond)

- **FE-4 — Clipboard-only output toggle** (BridgeVoice just shipped this). `high(daily)/S` ⭐ · feature —
  we already do clipboard+paste; expose a switch to skip the AX-paste. Wins the focus-loss case
  (BridgeVoice's observed "Couldn't switch focus to you…" pill). → Settings toggle + branch in the
  output path (engine owns the paste; app-shell sets policy).
- **FE-5 — Usage: add WPM + Sessions + an "Overview" dashboard** (BridgeVoice parity). `medium/S` · feature
  — stats exist; add Avg-Pace(WPM) + Sessions and present 4 hero cards + recent-activity feed. Local KV.
- **FE-6 — Searchable transcription history + per-row "Add to Dictionary."** `medium/M` · feature —
  pure local KV; tightens the dictionary loop. (Pairs with UX-15.)
- **UX-15 — Dictionary injects FAKE example rows that can be saved as real data.** `medium/S` · ux —
  `settings.html:1197-1211` injects 4 examples when empty; save persists whatever rows exist (`:1287-1300`)
  → clicking Save without editing saves the examples. No true empty state. → Real empty state in the card;
  move examples to the tip text (`:855-857`); render only real entries.
- **FE-7 — Dictionary "`@repo`/agent-reference" recipes** (BridgeVoice headline trick). `medium/S` ·
  feature — our dictionary already maps spoken→literal; ship example entries + docs
  (`"bridge mind api"`→`@bridgemindapi`, `"use effect"`→`useEffect`). Near-zero effort.
- **FE-8 — Mic input-device picker (preferred + "active now" fallback).** `medium/M` · feature —
  common dictation pain point; surface device selection (engine likely already selects one).
- **FE-3 — Local "Custom Instructions" / prompt-cleanup pass.** `medium/M` · feature (🔒 if cloud) —
  BridgeVoice author's #1 differentiator. A second transform after `normalizeTranscript`
  (`global-capture.ts:539`); the `cli-transcribe-engine` spawn pattern (`cli-transcribe-engine.ts:79-145`)
  is the lowest-posture-impact LLM-runner precedent. → **Local CLI/model = posture-OK**; **cloud LLM =
  ADR-3**. Default OFF.
- **FE-9 — Model download: no progress bar; existing Cancel API is unwired.** `medium/S` ⭐ · ux —
  only "Downloading… NN%" text (`:1176-1177`); `abortDownload` is plumbed end-to-end (`preload.ts:27`
  →`main.ts:293`) but never called from the UI. → Determinate bar + "NN MB of NN MB" + Cancel button.
- **FE-10 — "Mute system audio while listening" toggle.** `low/M` · feature — native CoreAudio ducking
  on mac (no heavy dep). Quality-of-life.
- **FE-11 — Local what's-new / changelog modal.** `low/S` · feature — bundled local JSON, **no network**.
  Good for an internal tool's release notes.
- **FE-12 — Multilingual local whisper model in the download UX.** `low/S` · feature (🔧 model config) —
  BridgeVoice ships English-only locally and pushes multilingual to cloud; offering offline multilingual
  is a **local-first edge over BridgeVoice**.
- **FE-13 — Widget appearance toggle (logo+text ↔ logo-only) + show/hide.** `low/S` · feature — cheap
  once FE-2 exists.
- **FE-14 — Version-check nag (within posture).** `low/M` · longevity — compare GitHub latest tag vs
  `app.getVersion()` in the Status tab, link to download — **no binary self-update** (that's ADR-4).

## E. Performance & smoothness

- **PF-1 — No whisper model prewarm → first dictation pays full model-load latency.** `medium/S` ⭐ · perf
  — context loads lazily on first `transcribe()` (`whisper_bridge.cc:142`, hundreds of ms; cache
  `:106-154`), inside `stopAndTranscribe` (`global-capture.ts:498`). App-shell-feasible: `getWhisperEngine`
  is exported (`index.ts:36`) → fire a one-time warm pass in `whenReady()` after a model resolves; re-warm
  on `setModelId`. One-time cold-start only.
- **PF-2 — Whisper contexts never freed (no `disposeModels`, no idle eviction).** `low/M` · perf —
  cache holds ~150 MB (base.en) up to ~2 GB (medium, `model-registry.ts:86`) for the session;
  `disposeModels` exported (`whisper_bridge.cc:369`, stub no-op `index.js:27`) but app-shell never calls
  it (grep 0). → **Idle eviction** after N min (app-shell), + an at-quit dispose **before**
  `captureCtrl.dispose()` (NB: at-quit alone reclaims nothing the OS wouldn't and overlaps the W-SV2
  abort path — idle eviction is the real lever).
- **PF-3 — HUD blurred transparent window kept alive after first show.** `low/M` · perf — construction is
  lazy (`ensureWindow` `hud-window.ts:96`), but `hide()` keeps it (`:186-191`) → a transparent
  `backdrop-filter: blur(22px)` window stays resident. → Idle teardown after minutes hidden; `ensureWindow`
  already supports recreation. Confirm idle GPU work via a snapshot before investing.
- **PF-4 — HUD clock uses 60fps `requestAnimationFrame` for a 1-second display.** `low/S` · optimization —
  `hud.html:207-218` rewrites mm:ss every frame for the whole (minutes-long) recording. → `setInterval`
  that writes only when the integer second changes.
- **PF-5 — File KV does a synchronous full-store rewrite on every `set()`, on the dictation path.** `low/S`
  · perf — `kv-store.ts:42-58` (stringify + temp-write + rename) fires from `appendSessionStat`
  (`voice-stats.ts:57-71`) after **every** transcription (`global-capture.ts:504`). Small today; grows. →
  Debounce / async `fs.promises.writeFile`+rename, keep the in-memory map authoritative for sync `get()`.
- **PF-7 — KV whole-map-rewrite-per-set is an undocumented assumption.** `low/S` · perf — add a one-line
  comment in `kv-store.ts` so a future contributor doesn't route large/hot values through it.

## F. Code, architecture & longevity

- **CA-1 — Zero app-shell tests; CI only typechecks + bundles.** `medium/M` · longevity —
  no `test` script; `ci.yml:39-43` = typecheck+build. Three pure, Electron-free modules are the highest-
  value targets: `hotkey-manager.ts resolveMainKey()` (`:138`, the accelerator→IGlobalKey map most likely
  to silently break PTT), all of `settings-data.ts`, and `kv-store.ts`. → `node:test`+`tsx` (~150 LOC) +
  a `pnpm test` CI step.
- **CA-2 — `renderer/settings.html` is 1390 lines** (CSS + 5-tab markup + all logic in one inline script).
  `medium/M` · architecture — breaks the 500-line rule; none of the logic is importable/testable. → Split
  into `settings.html` + `settings.css` + small JS modules (tabs/models/dictionary/stats); electron-builder
  already ships `renderer/**/*`.
- **CA-3 — `app.whenReady().then()` has no `.catch()`.** `medium/S` · bug — `main.ts:312`; a synchronous
  throw in `buildGlobalCaptureController` (`:324`) → unhandled rejection, no tray/window/feedback (silent
  inert process, worse than a clean crash). → try/catch → Notification + degraded tray so the user can Quit.
- **CA-4 — Possible double "push-to-talk degraded" notification on startup.** `low/S` · bug — two call
  sites (`main.ts:231` and `:360`); hotkey-manager de-dupes its own (`:225`), main.ts doesn't. →
  Module-level `degradedWarned` guard.
- **CA-5 — Dead/awkward code.** `low/S` · optimization — `import os` + `void os;` keep-alive
  (`main.ts:14,396`, never used); local `HudLike` (`:71-76`) duplicates exported `HudController`
  (`hud-window.ts:40-49`); `refresh()` is an unused no-op. → Delete; `import type { HudController }`.
- **CA-7 — `build.cjs`: stale "app/…" comments + likely-dead Drizzle externals.** `low/S` · optimization —
  header references the pre-2026 mirrored layout (`:3`); externals hardcode pg/mysql2/sqlite3/@libsql
  (`:52-55`) not imported by voice-core. → Update comments; pruning is cosmetic (externalizing an
  unimported name is a no-op); optional `--watch` dev mode.
- **CA-8 — `pnpm dev` (`electron src/main.ts`) likely can't run raw ESM TypeScript under Electron 30.**
  `low/S` · bug — `package.json:10`; main.ts is ESM TS w/ `import.meta.url`; no tsx/ts-node/loader (grep 0).
  Documented "run from source" is probably broken. → `electron --import tsx src/main.ts` (add tsx devDep)
  or build-then-run.
- **UX-9 — Usage tab shows stale stats until manual Refresh.** `low/S` · ux — `statsLoaded` guard
  (`:1303`) never resets on re-activation (`activateTab :961-974`). → Drop the guard for Usage (cheap sync
  KV read); keep dictionary lazy (avoids discarding unsaved edits).
- **UX-10 — `bv:setHotkey` accepts any non-empty string; invalid accelerators fail silently while the UI
  toasts success.** `medium/S` · ux — `settings.html:1067` unconditional "Hotkey updated"; engine
  `registerHotkey` only warns on failure (`global-capture.ts:372-377`). → Validate main-side (NB:
  `resolveMainKey` is main-process-only, not importable in the renderer) or have `setHotkey` return success.
- **UX-11 — `second-instance` opens settings but the create path never `.focus()`es.** `low/S` · ux —
  exists-branch focuses (`main.ts:182`), create-branch only `show()`s on ready (`:201`); on a Dock-hidden
  app the first relaunch may not surface. → `focus()` (+ guarded `app.focus({steal:true})`) in ready-to-show.
- **UX-12 — Dictionary editor silently drops over-long (>200-char) patterns; toasts the pre-sanitize count.**
  `low/S` · ux — `settings-data.ts:57-63` drops; renderer ignores the returned sanitized list
  (`:1287-1300`). → Use the return value; "Saved N; M dropped".

## G. Security & privacy

- **SEC-6 — Last transcript left on the system clipboard with no clear/restore.** `medium/M` · security —
  every transcription `clipboard.writeText` (`output-router.ts:293,321,339,345`); no save/restore, never
  cleared (grep `readText`/`clear` → none). Passwords/PII linger on the shared clipboard for any app /
  clipboard-history manager — the most plausible real-world leak for a privacy-positioned tool. → Decide a
  policy (save-and-restore prior clipboard, or clear after paste, or a setting); durable fix is 🔧 upstream
  (engine owns the write), app-shell picks policy via the injected clipboard object.
- **SEC-3 — `pnpm-lock.yaml` gitignored + CI installs `--no-frozen-lockfile`.** `medium/S` · security —
  `.gitignore:3`; `ci.yml:37` + `release.yml:48,71,127,148`. The release job produces the curl|bash DMG,
  resolving deps fresh from npm within semver (incl. `node-global-key-listener`, `sudo-prompt` — privileged
  input/sudo) with no committed integrity record. (`--ignore-scripts` narrows it to runtime-loaded, not
  install-time.) → Commit the lockfile + `--frozen-lockfile` + a non-blocking `pnpm audit` step.
- **SEC-7 — macOS installer: no DMG checksum + unauthenticated GitHub API + silent sudo.** `medium/M` ·
  security — `install-macos.sh:58-68` grep/sed of anonymous `api.github.com`; `:91` downloads the DMG with
  no checksum/signature (only trust anchor = TLS); silent `sudo rm -rf "$DEST"`/`cp -R`/`xattr -cr`
  (`:139,146,154`). → Publish + verify a per-release SHA-256; validate the tag matches `vX.Y.Z` before URL
  interpolation; prefer explicit `sudo installer`/prompt. (The quarantine-strip itself is locked posture —
  keep, but document as a deliberate Gatekeeper bypass.)
- **SEC-1 — No Content-Security-Policy in either renderer.** `low/S` · security — no `<meta>`/header
  (grep 0); both pages run inline `<script type=module>`. **No live XSS today** (every sink is
  `textContent`/`.value`; `innerHTML` grep = 0) — pure defense-in-depth. → Strict CSP `<meta>`
  (move inline script to an external `.js` to allow `script-src 'self'`).
- **SEC-2 — No navigation / `setWindowOpenHandler` hardening.** `low/S` · security — grep 0 across `src/`.
  → `setWindowOpenHandler(()=>({action:'deny'}))` + `will-navigate` preventDefault on both windows.
- **SEC-4 — `sandbox:true` not set.** `low/S` · security — `contextIsolation`/`nodeIntegration` correct
  (`main.ts:191-198`, `hud-window.ts:126-130`) but no sandbox; preloads use only contextBridge/ipcRenderer
  (sandbox-safe), so it's essentially free. → Add `sandbox:true`.
- **SEC-5 — Dictionary `replacement` not length/content-bounded.** `low/S` · security — `setDictionary`
  caps pattern at 200 but passes `replacement` verbatim (`settings-data.ts:61`); it's pasted into arbitrary
  focused apps and the macro set already includes `\n` → a self-inflicted but real auto-submit vector. →
  Cap replacement (~2000) + strip control chars except `\n`/`\t`.
- **SEC-8 — `adhoc-sign.cjs`: repo-wide `chmod 0755` of any file named `spawn-helper` + `codesign --deep`.**
  `low/M` · security — `:49-60` blanket name-based executable bit; `:63-67` deprecated `--deep`. CI-only,
  clean checkout (limited blast radius). → Scope the chmod to known dep paths; move off `--deep`.
- **SEC-9 — IPC consistency: `bv:setHotkey` grammar/length unguarded; `bv:setEnabled` coerces loosely.**
  `low/S` · security — (`bv:setModelId` is **already** catalog-validated by the engine —
  `global-capture.ts:769-775`, test `global-capture.test.ts:307-318` — do **not** add a redundant
  allowlist there.) → Bound the accelerator string + coerce `enabled` to a real boolean.

## H. Engine / native — SigmaLink submodule (🔧 author upstream, then bump the pin)

- **W-SV1 — Windows `voice-whisper` MSVC link failure (`LNK1120`, ~40 unresolved `ggml_*`).** `high/S–M` ⭐
  · bug — four grounded sub-causes in `binding.gyp` (one bug, fix together, iterate on a windows-latest
  runner): **(a)** win branch *defines* `GGML_USE_CUDA=0` (`:84`) — definedness pulls in
  `ggml_backend_cuda_reg()` with no CUDA TU → **remove the define**; **(b)** omits `GGML_USE_CPU` while
  listing the ggml-cpu sources (`:76-78`) → **add `GGML_USE_CPU`**; **(c)** all branches drop
  `ggml-cpu-hbm.cpp` → **add it**; **(d)** `-march=native`/aarch64 assumptions leak into x64 + `cpu-feats-x86.cpp`
  absent (`:86-89`) → **add x86 feature TU + arch defines**. *Caveat:* `vendor/whisper.cpp/` is an
  unchecked-out nested submodule, so the upstream `#ifdef` guards are high-confidence hypotheses — confirm
  on a Windows runner; diff the gyp `sources`/`defines` against whisper.cpp v1.7.4's CMake.
- **ENG-1 — voice-win has no `sendPasteKeystroke` → Windows output is clipboard-only.** `medium/M` · feature
  — darwin pastes via CGEvent (`output-router.ts:293-297`); win only writes clipboard + "copied" toast
  (`:314-323`). The practical blocker to Windows being a real product even after W-SV1. → Add `sendPasteKeystroke`
  (SendInput Ctrl+V) + optional `typeUnicode` fallback (KEYEVENTF_UNICODE); wire the win output branch.
  Gated on W-SV1.
- **ENG-7 — No `audio_ctx` trim for short clips → whisper encodes a 30s window for a 2-word dictation.**
  `medium/M` · optimization — `whisper_bridge.cc:211-225` never sets `audio_ctx`. The **biggest per-dictation
  latency win** for the dictation workload. → Set `audio_ctx` from clip length (gated so long recordings
  keep full context); validate WER.
- **ENG-5 — voice-core emits no audio level → real HUD waveform impossible.** `medium/M` · feature —
  enables the premium half of **UX-6**. → Emit a 0–1 level on the existing capture event; HUD preload
  forwards it.
- **ENG-3 — Gemini-CLI transcribe spawn has no timeout/kill/AbortSignal.** `low/S` · bug — `cli-transcribe-engine.ts`
  (grep 0); a hung CLI never settles the promise and never reaches the documented fallback-to-local
  (`global-capture.ts:506`). Latent (path is dark) but a **prereq for any cloud ADR**. → 30s timeout that
  kills + rejects; maxBuffer guard.
- **W-SV2 — Quit-time TSFN `SIGABRT`.** `low/M` · bug — five emitters `Release()` in dtors
  (`tsfn_bridge.h:22,53,75`→`.mm:30-33,…`) on a function-local-static singleton (`recognizer.mm:65-66`)
  during `dispose()` at before-quit, after libuv begins teardown → `napi_release_threadsafe_function` locks a
  destroyed mutex. voice-win has `napi_add_env_cleanup_hook` (`sigmavoice_win.cc:250`); voice-mac doesn't. →
  `napi_tsfn_abort` from a native `dispose()` called synchronously **before** loop teardown, or mirror the
  cleanup-hook in voice-mac. Cosmetic, quit-only, no data loss. The app-shell guarded teardown
  (`main.ts:376-386`) is already the max possible here.
- **ENG-2 — SigmaLink focused-pane/dispatch routing is dead weight in standalone SigmaVoice.** `low/S` ·
  architecture — `output-router.ts:150-151` matches `/sigmalink/i` exe / `com.sigmalink.agentorchestrator`
  and routes to a `sigmalink-pane` dispatch event with an **empty toast** (`:288-290,316-318,333-335`); none
  is wired here → a SigmaVoice user who focuses any `/sigmalink/i`-named app gets **no paste, no toast**
  (silent drop). → Backward-compatible opt to disable the detection branch in standalone (add upstream); at
  minimum document it.
- **ENG-4 — Model-download reuses headers (incl. resume `Range`) across redirects to arbitrary hosts.**
  `low/S` · security — `model-registry.ts` follows ≤5 redirects reusing `headers` with no host allowlist.
  **Strongly mitigated**: bytes are SHA-256-verified against hardcoded per-model hashes (`:61,70,79,88`,
  verify `:287`, unlink on mismatch). Defense-in-depth, not exploitable. → Pin redirect hosts / drop `Range`
  cross-host.
- **ENG-6 — macOS whisper compiled with `-march=native`** (`binding.gyp:47,53`). `low/S` · longevity — ties
  shipped codegen to the CI runner's microarch (reproducibility); cross-M-series SIGILL risk low (shared
  armv8 + ggml runtime detection). → `-mcpu=apple-m1` baseline (matches whisper.cpp CMake).
- **ENG-8 — Hardcoded `threads:4`** (`global-capture.ts:498,513,621`). `low/M` · perf — ignores P-core count;
  **not** app-shell-passable (main.ts never calls `transcribe()`). → Default from
  `os.availableParallelism()` clamped; **validate vs Metal** (GPU-bound builds may not benefit).
- **ENG-9 — Unconditional 50ms `setTimeout` before every AX-paste** (`output-router.ts:297`). `low/S` · perf
  — clipboard write is synchronous; 50ms is a conservative guess on every dictation. → ~10–20ms / next-tick;
  measure on target apps.
- **ENG-10 — `flush()` + `resampleTo16k` do a double full-length copy + JS resample on the main thread at
  stop** (`global-capture.ts:278-288,221-234,490-497`). `low/M` · optimization — briefly blocks the event
  loop on long recordings. → Resample in the native worker, or avoid the extra concat. Short clips fine as-is.

---

## I. ADR candidates (🔒 posture-breaking — NOT roadmap items; require an ADR)

- **ADR-1 — Opt-in Local⇄Cloud transcription toggle** (Gemini-CLI exists `cli-transcribe-engine.ts`;
  BridgeVoice uses Groq). Cloud ships audio off-device → conflicts with local-first/no-cloud-by-default.
  Default Local, explicit opt-in, no account; multilingual is the real payoff. Prereq: **ENG-3** (spawn timeout).
- **ADR-2 — Wake-word ("Hey Jorvis") enablement.** Full C-11 loop exists in the engine, dep-gated OFF
  (`global-capture.ts:160-173,194,604,624`); locked OFF. Also needs a wake-model provisioning slot in the
  model UX (today single active model only). Enabling requires an ADR; do **not** enable silently.
- **ADR-3 — AI cleanup via a CLOUD LLM** (the local-CLI/model variant is **FE-3**, posture-OK).
- **ADR-4 — Auto-update + signing.** Electron auto-update needs Developer-ID signing+notarization on mac
  (Squirrel) — conflicts with unsigned posture + adds a heavy dep. Within-posture alternative = **FE-14**
  (version-check nag, no self-update).
- **ADR-5 — Linux support.** macOS arm64 + Windows x64 only is locked.
- **Non-goals (won't-do without an ADR):** accounts/subscription/trial gating, cloud-by-default,
  cross-device sync, telemetry — all violate the local-first/internal/no-accounts posture (BridgeVoice has
  these because it's a commercial product; SigmaVoice is the local-first internal counterpart).
