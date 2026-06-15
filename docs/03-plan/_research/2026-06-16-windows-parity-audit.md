# SigmaVoice — Windows (x64) app-shell parity audit (2026-06-16)

> **Full evidence** for the `WIN-*` items in [`../WISHLIST.md`](../WISHLIST.md) → 🪟 Windows parity.
> **Method:** 5 parallel **read-only** investigation agents (input/hotkey · window/HUD/tray/lifecycle ·
> build/packaging/CI · secrets/cloud/LLM · cross-cutting sweep+persistence), Phase-1 evidence gathering
> per `superpowers:systematic-debugging`. **No code was changed.** Run against `main` @ `a58d4b3`
> (post `remote-stt-and-openrouter-cleanup` merge).
> **Scope:** app shell only (`src/`, `renderer/`, `scripts/`, configs). Engine/native (`sigmalink/`)
> findings are parked as out-of-scope (fixed in SigmaLink + pin bump). See [`../../08-bugs/OPEN.md`](../../08-bugs/OPEN.md).

## Strategic framing (read first)

1. **W-SV1 gates everything.** The Windows NSIS build is blocked by the engine-side `voice-whisper`
   MSVC link failure (W-SV1). Until that's fixed in SigmaLink, **no packaged Windows app ships**, so
   every item below is *latent* — real, but not yet user-reachable through an installer.
2. **The new remote-STT/cloud path is the unlock.** Cloud STT does **not** need the local whisper
   native that W-SV1 breaks. If `voice-core` can boot without loading local whisper (an **engine-side
   question to confirm in SigmaLink**), Windows users could dictate via cloud STT *before* W-SV1 is
   fixed — which turns every app-shell fix here from "blocked" into "immediately valuable."
3. **Validation is possible on the dev box.** Development is happening **on Windows 11** (this machine).
   Runtime findings (HUD overlay, keycaps, focus, tray) can be confirmed via `pnpm dev` from source —
   modulo the local whisper native not linking — *before* committing to fixes. Several med-confidence
   items below explicitly want such a repro.

**Legend.** severity: `blocker | bug | parity-gap | perf | polish` · confidence: `high | med | low`
(+ what would confirm) · scope: `in-repo` (app-shell, fixable here) | `engine-side` (SigmaLink).

---

## Tier 1 — first 5 minutes on Windows (in-repo, high confidence)

### WIN-1 — Keycap glyphs are hardcoded macOS symbols (⌘ ⌥ ⌃) on every platform
- **location** `src/keycaps.ts:8-34` + its renderer mirror `renderer/js/keycaps.js:8-34`; rendered in the
  tray menu (`src/main.ts:153`), Overview (`renderer/js/overview.js:43,51-56`), hotkey-capture UI
  (`renderer/js/hotkey-capture.js:58,66-71,76-77`), and hint/placeholder copy
  (`renderer/js/capture.js:41-42`, `renderer/settings.html:212,220`).
- **issue** `GLYPHS` maps `CommandOrControl/Cmd/Super/Meta → ⌘`, `Control/Ctrl → ⌃`, `Alt/Option → ⌥`,
  `Shift → ⇧` with **no platform branch**. On Windows `CommandOrControl` resolves to **Ctrl**, so a
  ⌘ keycap is shown for a shortcut that physically fires on Ctrl. All instructional copy ("hold ⌘⇧ to
  talk", "Add a modifier (⌘/⌥/⌃/⇧)") is mac-glyph only.
- **whyWindows** Windows has no ⌘ key; ⌘/⌥/⌃ are alien glyphs. The single most visible mac-centric defect.
- **severity** blocker (UX correctness of the only user-facing control) · **confidence** high
- **direction** Platform-aware glyph/label table selected by `process.platform` (main) and
  `navigator.userAgentData?.platform`/`navigator.platform` (renderer mirror). On Windows:
  `CommandOrControl/Control/Ctrl → "Ctrl"`, `Alt/Option → "Alt"`, `Super/Meta/Command → "Win"`,
  `Shift → "Shift"`. Make hint/placeholder strings conditional. Keep the two tables in sync (existing
  "KEYCAP CONTRACT" note). · **scope** in-repo · _agents A1 #1, A5 F4_

### WIN-2 — HUD pinned above taskbar/Start at `'screen-saver'` level, default-ON, no dismiss
- **location** `src/hud-window.ts:187` (`setAlwaysOnTop(true,'screen-saver')`); persistent pill default-ON
  `src/main.ts:449`; `RECORD_SAFETY_MS = 10min` `src/hud-window.ts:104`.
- **issue** `'screen-saver'` is the highest standard z-level → on Windows the pill sits above the
  taskbar/Start/most foreground UI permanently. It's `focusable:false` but **not** mouse-ignoring
  (no `setIgnoreMouseEvents`) and has no keyboard/escape dismiss — only the 10-min safety timer or quit.
  If the engine never emits terminal `idle` (e.g. W-SV2 teardown), it pins for up to 10 minutes.
- **whyWindows** macOS treats `screen-saver`-level windows gracefully under a Dock-hidden accessory app;
  Windows has no "non-activating accessory" concept, so a topmost transparent window is far more intrusive.
- **severity** blocker · **confidence** med (confirm z-order vs taskbar/Start on a Windows run)
- **direction** Lower the always-on-top level on Windows (`'normal'`/`'floating'`); add a dismiss
  affordance; reconsider default-ON persistence for the under-tested Windows target. · **scope** in-repo · _A2_

### WIN-3 — Degraded push-to-talk help points to macOS "Input Monitoring"
- **location** `src/main.ts:90-96` (`warnPushToTalkDegraded`), `renderer/settings.html:219-221`
  (`#hotkey-im-note`, gated only on PTT mode in `renderer/js/capture.js:35-37` — **not** on platform).
- **issue** When the global key-UP listener fails to attach, the user is told to grant macOS
  "Input Monitoring (System Settings → Privacy & Security)". That permission does not exist on Windows;
  the note is shown for any PTT user on any OS.
- **whyWindows** Dead-end guidance; the Windows failure cause (hook install / AV / session isolation) is
  different. · **severity** parity-gap · **confidence** high
- **direction** Platform-branch the message + hide/replace `#hotkey-im-note` on Windows. *(Why the
  listener fails on Windows is engine/native — out of scope.)* · **scope** in-repo · _A1 #6, A2, A5 F3_

### WIN-4 — Silent persistence loss on Windows (rename-over-existing + swallowed errors + false success)
- **location** `src/kv-store.ts:42-50` (`persist`), `src/secret-store.ts:43-49` (`persist`),
  `src/llm-ipc.ts:22-23` (returns `{ok:true}` from the encryption step only).
- **issue** Both stores do `writeFileSync(tmp)` → `renameSync(tmp, file)` and `catch {}` all FS errors.
  On Windows, rename-over-existing is **not** atomic and throws `EPERM`/`EACCES` when the destination is
  transiently locked (Defender/AV, indexer, another handle). Failures are silently swallowed → a "saved"
  dictionary/stats/secret edit may never hit disk. `setSecret` then returns success even though the write
  failed (UI shows "AI cleanup saved", `renderer/js/cloud.js:66`). The temp file uses a fixed
  `${file}.tmp` name → two near-simultaneous `set()` calls (stats append + dictionary save) race.
- **whyWindows** POSIX atomic-replace tolerates open readers; Win32 mandatory locking + AV handles make
  rename-over-existing fragile. · **severity** bug · **confidence** high (code path) / med (Win frequency)
- **direction** Unique temp name (pid/random); retry on `EPERM`/`EACCES` with backoff; fall back to direct
  overwrite; **propagate** write failure through `persist()` → `setSecret` → `llm-ipc` so the UI shows an
  error instead of false success. · **scope** in-repo · _A4, A5 F1_

### WIN-5 — Hotkey capture maps the Windows key to `CommandOrControl`; punctuation capture is layout-dependent
- **location** `renderer/js/hotkey-capture.js:11-18` (`modsFromEvent`, line 13
  `if (e.metaKey) mods.push('CommandOrControl')`) and `:36` (punctuation via `e.key`); resolve side
  `src/hotkey-manager.ts:105-139` (`KEY_NAME_MAP`).
- **issue** On Windows `e.metaKey` = the **Win/Super** key, but it's recorded as `CommandOrControl`
  (which Electron registers as **Ctrl**) → the captured token doesn't match the physically pressed key.
  Punctuation keys return the produced character `e.key` (layout-dependent) rather than physical `e.code`,
  so on a non-US Windows layout the captured token won't match what `globalShortcut` binds.
- **whyWindows** Win≠Cmd; non-US physical layouts are far more common in the Windows base than on the
  US-centric validated mac target. · **severity** bug · **confidence** high (meta) / med (punctuation)
- **direction** On Windows map `e.metaKey → 'Super'` (or ignore during capture); derive punctuation from
  `e.code`; align `KEY_NAME_MAP` to the same physical-key vocabulary. *(Low-level registration is
  engine-side.)* · **scope** in-repo · _A1 #2/#3/#7, A5 F5_

---

## Tier 2 — correctness / parity (in-repo)

### WIN-6 — Window/pill geometry is not DPI/`scaleFactor`-aware
- **location** `src/hud-window.ts:86-89,125-137,290-297`, `src/pill-geometry.ts:14-20`, drag math
  `renderer/hud.html:438-445`, tray-driven resize `src/main.ts:197`.
- **issue** All geometry uses fixed DIP constants + `screen.getPrimaryDisplay().workArea` with **no**
  `display.scaleFactor` / `screen.dipToScreenRect` / `screenToDipRect`. The drag uses `e.screenX/Y`
  minus `clientX/Y` (CSS px), which drifts under fractional DPI. Tuned for macOS uniform backing scale.
- **whyWindows** Windows per-monitor-v2 DPI: the same DIP rect lands at different physical positions/sizes
  across mixed-DPI monitors; dragging 150%→100% mis-places the pill. · **severity** bug · **confidence** med
  (confirm with a mixed-DPI multi-monitor Windows repro)
- **direction** Audit geometry against `scaleFactor` + Electron dip/screen converters; verify drag math
  under non-100% scaling. · **scope** in-repo · _A2_

### WIN-7 — Second-instance won't reliably foreground the settings window on Windows
- **location** `src/main.ts:253` (`if (process.platform==='darwin') app.focus({steal:true})`),
  `second-instance` handler `:388`, `openSettingsWindow` `:250-254`.
- **issue** The compensating `app.focus({steal:true})` is **darwin-only**; on Windows `SetForegroundWindow`
  restrictions mean `show()+focus()` from a background process may only flash the taskbar button.
- **whyWindows** Windows foreground-lock blocks background focus-stealing. · **severity** bug · **confidence**
  med (confirm with a relaunch test)
- **direction** Add a Windows path to raise/foreground (transient `setAlwaysOnTop` toggle, `moveTop`,
  or `flashFrame`), guarded per platform. · **scope** in-repo · _A2_

### WIN-8 — Tray: left-click is a no-op on Windows + 18px raster icon, no ICO/DPI variants
- **location** `src/main.ts:195-201` (`createFromPath(tray-icon.png).resize({18,18})`,
  `setContextMenu` only — no `tray.on('click'/'double-click')`); asset `renderer/assets/tray-icon.png`
  is 1024×1024 RGBA.
- **issue** On Windows the context menu is right-click only; **left-click does nothing** without an explicit
  handler (mac auto-pops it). A single 18px downscale from 1024px is mac-menu-bar sized — Windows tray is
  16px baseline scaling to 20/24/32px per DPI and prefers a multi-res `.ico`/`nativeImage` reps.
- **whyWindows** Click semantics + icon format/DPI both diverge. · **severity** parity-gap · **confidence** high
- **direction** Add `tray.on('click')` (and optionally `double-click`) on Windows; load a multi-res `.ico`
  / DPI reps at a 16px baseline. *(`setTemplateImage` correctly omitted — mac-only.)* · **scope** in-repo · _A2_

### WIN-9 — Remote-STT API key stored in **plaintext** in the KV JSON (not the encrypted store) 🔒
- **location** `src/cloud-config.ts:47` (`kv.set(STT_KEY, apiKey)`) → `src/kv-store.ts:42-51`
  (`sigmavoice-kv.json`, no `mode`). Only the OpenRouter key uses the encrypted `secret-store`.
- **issue** A live remote-STT credential is written verbatim to the KV file; on Windows that file has no
  DPAPI encryption and no ACL restriction (see WIN-13/F2), so a paid-cloud STT token sits in cleartext
  in `%APPDATA%`.
- **whyWindows** Worse on Windows for the same no-ACL reason; mechanism is cross-platform. · **severity**
  parity-gap (bug if the STT endpoint is a paid cloud service) · **confidence** high
- **direction** Route the STT `apiKey` through the same encrypted `secret-store` as the OpenRouter key,
  **or** document remote STT as keyless/LAN-only. Likely an ADR-007 design decision, not a silent fix. ·
  **scope** in-repo · _A4_

### WIN-10 — "macOS Speech" hardcoded as the engine/fallback label, shown on Windows
- **location** `renderer/js/overview.js:34-35` (also `:8,:33`).
- **issue** With no Whisper model downloaded, the Overview label is hardcoded `'macOS Speech'`. On Windows
  the engine fallback is SAPI5 (`src/main.ts:8` comment "AVAudioEngine / SAPI5"), so the label is wrong.
- **whyWindows** No macOS Speech on Windows. · **severity** parity-gap · **confidence** high
- **direction** Platform-conditional label ("Windows Speech"), or better, have the engine report the active
  fallback name. *(Actual fallback engine identity is engine-side.)* · **scope** in-repo · _A5 F6_

### WIN-11 — NSIS installer welcome page links to the WRONG repo (SigmaLink, not SigmaVoice)
- **location** `build/installer.nsh:25,37-40`, `electron-builder.yml:118-121` (`publish.repo: SigmaLink`).
- **issue** The Windows welcome page sends users to `github.com/s1gmamale1/SigmaLink` for Source / Release
  notes / Issues, but `release.yml` attaches the `.exe` to **SigmaVoice** (the release home, per
  `install-macos.sh` + HANDOFF). Every URL is wrong; only the `.exe` filename is right.
- **whyWindows** Only the Windows path surfaces these URLs (NSIS welcome page); mac has no equivalent.
- **severity** parity-gap · **confidence** high
- **direction** Repoint `installer.nsh` URLs + `publish.repo` to `SigmaVoice`. · **scope** in-repo · _A3 #2_

### WIN-12 — Packaged `WinKeyServer.exe` inclusion is unverified (could silently break PTT) — gated on W-SV1
- **location** `electron-builder.yml:20-30` (`files:` allowlist — no explicit `node_modules/**`),
  `:36` (`asar:false`), externalize `scripts/build.cjs:48`, runtime `src/hotkey-manager.ts:380`.
- **issue** `node-global-key-listener` is correctly externalized (gotcha #3 ✓) so it must ship from
  `node_modules`; it spawns `WinKeyServer.exe` by relative path. electron-builder auto-includes prod deps,
  but the `files` block is actively curated (explicit `!` exclusions) and this has **never** been verified
  inside a packaged NSIS build (W-SV1 blocks reaching packaging). If the binary is pruned, PTT key-UP
  silently never fires.
- **whyWindows** The Windows server binary is a different artifact than mac's `MacKeyServer`; only the mac
  DMG path has been validated. · **severity** bug (latent) · **confidence** med
- **direction** Once W-SV1 clears, add a Windows post-package check (mirror gotcha #4) asserting
  `WinKeyServer.exe` is present + the module loads; consider an explicit
  `files: node_modules/node-global-key-listener/**` include. · **scope** in-repo · _A1 #5, A3 #5_

---

## Tier 3 — polish / posture (bundled as **WIN-13** in WISHLIST)

- **WIN-13a — Windows fallback styling.** HUD `transparent:true` + `backdrop-filter: blur(22px)`
  (`src/hud-window.ts:145-168`, `renderer/hud.html:47-48`) does **not** blur the desktop on Windows
  (only in-page content) → the glass look flattens; a resident transparent GPU window costs more for less.
  Settings window `vibrancy:'sidebar'` + `titleBarStyle:'hiddenInset'` + `transparent:true`
  (`src/main.ts:221-228`) are inert/mac-centric on Windows and `transparent:true` breaks snapping/shadow
  and demands a guaranteed-opaque CSS root. `nativeTheme`/`prefers-color-scheme` is unhandled (dark-only on
  Windows light mode — relates to shipped UX-2). *direction:* per-platform Windows styling — solid pill
  surface, non-transparent framed settings window. polish · med. _A2_
- **WIN-13b — secret-file ACL.** `mkdirSync({mode:0o700})` / `writeFileSync({mode:0o600})`
  (`src/secret-store.ts:45,47`; `kv-store.ts:44` has no mode at all) are **ignored** on Windows. Mitigated
  by DPAPI per-user encryption for the secret store; the KV file (WIN-9) is not. *direction:* document the
  DPAPI scoping as the real protection; ACL via `icacls` only if the threat model requires it (adds a
  shell-out the repo otherwise avoids). parity-gap · high. _A4, A5 F2_
- **WIN-13c — over-fullscreen promise.** `setVisibleOnAllWorkspaces(true,{visibleOnFullScreen})`
  (`src/hud-window.ts:190`) is a macOS-Spaces API; on Windows it's a no-op and won't overlay exclusive
  fullscreen apps. *direction:* document as mac-only; the call is harmless. parity-gap · high. _A2_
- **WIN-13d — dev↔packaged userData divergence.** No top-level `productName` in `package.json`. Packaged
  Win app → `%APPDATA%\SigmaVoice`; `pnpm dev` → sanitized `@sigmalink/sigma-voice` → **different** folder,
  so dev settings/dictionary don't carry to the installed build. *direction:* set
  `productName: "SigmaVoice"` so `app.getName()` is stable. polish · low (trivial, ⭐). _A5_
- **WIN-13e — NSIS config completeness.** `win:`/`nsis:` blocks omit explicit `win.icon` (auto-discovers a
  valid `build/icon.ico`), `perMachine`, `runAfterFinish`, `uninstallDisplayName`, `deleteAppDataOnUninstall`
  vs the fuller mac DMG config (`electron-builder.yml:85-103`). Defaults are reasonable for unsigned per-user;
  this is explicitness/polish. polish · low. _A3 #4_
- **WIN-13f — no `install-windows.ps1`.** macOS gets a `curl|bash` quarantine-free installer
  (`scripts/install-macos.sh`); Windows users get only the raw NSIS `.exe` (SmartScreen). *direction:*
  optional PowerShell installer (download latest release → `Unblock-File` → run). parity-gap · low/M. _A3 #3_
- **WIN-13g — redundant build env.** `npm_config_build_from_source:'false'` under `--ignore-scripts`
  (`release.yml:129-130`) is a no-op; natives build via the explicit `node-gyp` steps. *direction:* drop it.
  polish · low. _A3 #6_
- **WIN-13h — fallback copy.** `renderer/js/cloud.js:47-48` "stored unencrypted — no OS keyring" is
  keyring/Keychain terminology; Windows uses DPAPI (and this branch is effectively dead on Windows since
  `isEncryptionAvailable()` ~always true). *direction:* generalize to "OS encryption unavailable". polish ·
  low. _A4_

---

## Infra (cheap, high-leverage)

### WIN-14 — CI always-on gate has ZERO Windows coverage ⭐
- **location** `.github/workflows/ci.yml:18` (`runs-on: macos-14`, single job).
- **issue** The typecheck+bundle gate runs only on macOS. It's platform-agnostic (natives external), so a
  regression that breaks `build.cjs`, the bundle, or `node-global-key-listener` resolution on Windows is
  invisible until a `v*` tag triggers `release.yml`. · **severity** parity-gap · **confidence** high
- **direction** Add a `windows-latest` matrix leg running `typecheck` + `pnpm build` (no natives, fast) for
  early Windows-bundle signal. **Does not need W-SV1 resolved.** · **scope** in-repo · _A3 #7_

### WIN-15 — `release.yml` build-windows lacks explicit VS/CMake/Python toolchain (latent, gated W-SV1)
- **location** `.github/workflows/release.yml:106-138` (build-windows job).
- **issue** Jumps straight to `npx node-gyp rebuild` with no `microsoft/setup-msbuild` / `actions/setup-python`
  / CMake provisioning. Works today only by luck of the `windows-latest` image; when W-SV1's gyp branch is
  fixed it may need a newer SDK/CMake than the default image. · **severity** blocker (latent, masked by W-SV1)
  · **confidence** med
- **direction** Add explicit `microsoft/setup-msbuild` + `actions/setup-python` (+ CMake if the fixed gyp
  shells out to it), pinned. · **scope** in-repo · _A3 #1_

---

## Verified *correct* (audit negatives you can trust)

- **`safeStorage` → DPAPI is the right cross-platform secret backend.** No `keytar`, no `security`/Keychain
  CLI, no `osascript`. `isEncryptionAvailable()` returns true on Windows out-of-the-box (no keyring daemon
  needed, unlike Linux). `src/main.ts:406-409`, `src/secret-store.ts:30`.
- **No hardcoded POSIX paths anywhere.** All paths use `path.join` + `app.getPath('userData')`
  (`sigmavoice-kv.json`, `sigmavoice-secrets.json`, `voice-models/`).
- **Bare-modifier PTT is platform-aware + test-covered.** `resolveModifierKeys` branches
  `CommandOrControl → LEFT/RIGHT CTRL` on non-darwin (`src/hotkey-manager.ts:182-185`,
  `hotkey-manager.test.ts:37-43`).
- **Accelerator validation is platform-neutral & correct** (`src/accelerator.ts:10-65`).
- **esbuild externalizes `node-global-key-listener`** (gotcha #3, `scripts/build.cjs:48`).
- **`adhoc-sign.cjs` is mac-gated** (returns early when `electronPlatformName !== 'darwin'`); never runs on win.
- **build-windows orchestration is structurally sound** apart from WIN-15: recursive submodule checkout
  (gotcha #7), explicit per-native `node-gyp rebuild --target --arch=x64 --dist-url` (gotcha #5, not
  `@electron/rebuild -w`), `npmRebuild:false`, `CSC_IDENTITY_AUTO_DISCOVERY:false`.
- **`node-gyp-build` + `sudo-prompt` are direct deps** (gotcha #4) so they bundle.
- **`build/icon.ico`** is a valid multi-size icon (16/32 incl.).
- **No mac-only shell-outs** (`osascript`/`pbcopy`/`pbpaste`/`security`/`open -a`/`defaults`) anywhere in
  `src/`, `renderer/`, `scripts/`.

## Platform-branch coverage map (from the cross-cutting sweep)

| Location | Branch | Windows path | Status |
|---|---|---|---|
| `hotkey-manager.ts:183-185` | `darwin?META:CTRL` for `CommandOrControl` (PTT) | LEFT/RIGHT CTRL | **IMPLEMENTED** (tested) |
| `hud-window.ts:165` | `type: darwin?'panel':undefined` | plain window | **IMPLEMENTED** |
| `main.ts:253` | `if(darwin) app.focus({steal:true})` | skipped → **WIN-7** | NEEDS-REVIEW |
| `main.ts:396-398` | `if(darwin) app.dock?.hide()` | skipped (`?.` safe) | **IMPLEMENTED** |
| `main.ts:512-516` | `app.on('activate')` (mac Dock) | never fires | **IMPLEMENTED** (harmless) |
| `hud-window.ts:187,190` | `setAlwaysOnTop('screen-saver')` + `setVisibleOnAllWorkspaces` — **not guarded** | runs on win → **WIN-2/WIN-13c** | NEEDS-REVIEW |
| `secret-store.ts:45,47` | `mode:0o700/0o600` — no branch | ignored → **WIN-13b** | NEEDS-REVIEW |
| `main.ts:90-96` & `settings.html:220` | mac "Input Monitoring" copy — no branch | wrong text → **WIN-3** | MISSING |
| `keycaps.ts` + `js/keycaps.js` | hardcoded mac glyphs — no branch | mac glyphs → **WIN-1** | MISSING |
| `hotkey-capture.js:13` | `e.metaKey→'CommandOrControl'` — no branch | maps Win key → **WIN-5** | NEEDS-REVIEW |
| `overview.js:34-35` | `'macOS Speech'` label — no branch | wrong label → **WIN-10** | MISSING |

_No instances found of `osascript`/`pbcopy`/`pbpaste`/`security`/`open -a`/`defaults`/`AppleScript`,
`child_process`/`exec`/`spawn`, hardcoded `/Users/`/`~/`/`split('/')`/string `'/'` joins, `chmod`,
`symlink`, or `\r\n`/`os.EOL` assumptions in the app shell._

---

## Engine-side — parked (cannot fix in this repo; SigmaLink + pin bump)

- **W-SV1** — `voice-whisper` MSVC link failure (`LNK1120`), `sigmalink/app/native/voice-whisper/binding.gyp`.
  **Blocks the Windows build entirely.** (Tracked in `OPEN.md` + WISHLIST 🅷.)
- **W-SV2** — quit-time TSFN `SIGABRT`, `sigmalink/app/native/voice-*/src/tsfn_bridge.*`.
- **Why the global key-listener fails to attach on Windows** (native; the *message* is WIN-3, in-repo).
- **Cloud network/TLS/proxy** for OpenRouter/Whisper — lives in `voice-core` (`buildGlobalCaptureController`
  gets only a `getApiKey` callback, `src/main.ts:438`).
- **Engine default-hotkey value** (app shell consumes it; verify it's `CommandOrControl`-based, not `Cmd`).
- **Windows fallback STT engine identity** (the label is WIN-10; the engine is engine-side).
