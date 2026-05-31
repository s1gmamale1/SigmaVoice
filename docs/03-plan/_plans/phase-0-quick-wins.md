# Phase 0 — Quick wins · implementation plan

Executes ROADMAP **Phase 0** on branch `feat/phase-0-quick-wins`. Source of truth for the slice
boundaries + cross-cutting contracts the parallel agents implement against. Evidence:
[`_research/codebase-findings.md`](../_research/codebase-findings.md).

## Scope change (from the engine scout, 2026-05-31)
- **FE-4 (clipboard-only output toggle) → DESCOPED to the engine track.** `RouteOpts`
  (`voice-core/output-router.ts:48-63`) has no output-mode flag and the macOS path unconditionally
  `writeText`+`sendPasteKeystroke` when AX is trusted (`:293-298`). Clipboard-only requires adding
  `clipboardOnly`/`outputMode` to `RouteOpts` + threading it via `GlobalCaptureDeps` — that's a
  SigmaLink (`voice-core`) change + submodule bump. Moved to **Phase 4 / a small SigmaLink change**.
- Everything else in Phase 0 is app-shell and stays.

## Pinned cross-cutting contracts (so disjoint-file slices integrate)
- **UX-10 hotkey result contract.** `ipcMain.handle('bv:setHotkey')` (Slice A) validates the
  accelerator and **returns `{ ok: boolean; error?: string }`**; `src/preload.ts` `setHotkey` must
  `return ipcRenderer.invoke(...)`. The renderer (Slice B) `await`s `bv.setHotkey(value)` and shows
  "Hotkey updated" **only if `ok`**, else shows `error` at `error` level.
- **UX-1 tray asset path contract.** The tray image ships at `renderer/assets/tray-icon.png` (created
  by the integration step, not an agent). Slice A loads it via
  `path.join(__dirname, '..', 'renderer', 'assets', 'tray-icon.png')`, `.resize({width:18,height:18})`,
  with `createEmpty()` fallback. (Proper monochrome **template** image is a Phase-1 follow-up.)

## Slices (disjoint files — safe to run in parallel worktrees)
- **A · main process** (`src/main.ts`, `src/preload.ts`): CA-3 (whenReady try/catch → Notification +
  degraded tray), CA-4 (dedupe `warnPushToTalkDegraded` via module flag), CA-5 (drop `os`/`void os`,
  replace local `HudLike` with `import type { HudController }`), UX-11 (`.focus()` in the create-path
  ready-to-show), UX-1 (load tray icon), PF-1 (one-time whisper prewarm in `whenReady` + re-warm on
  `bv:setModelId`), UX-10 (validate accelerator + return `{ok,error}`; preload returns the promise).
- **B · settings renderer** (`renderer/settings.html`): UX-5 (`status-badge`→`state-badge routing`),
  UX-9 (Usage tab refreshes on each activation), UX-10 (await result + toast), UX-12 (report dropped
  dictionary rows from the sanitized return), UX-15 (real empty state, stop saving fake examples),
  FE-9 (determinate download progress bar + MB/MB + Cancel via `bv.abortDownload`).
- **C · HUD** (`src/hud-window.ts`, `renderer/hud.html`): CA-6 (~10-min recording hard-ceiling +
  click-dismiss), PF-4 (HUD clock → `setInterval`, write only on second change).
- **D · build** (`package.json`): CA-8 (`dev` → `node scripts/build.cjs && electron sigma-dist/main.js`).

## Execution
1. 4 parallel **worktree-isolated** implementer agents (CLAUDE.md), each edits ONLY its files, returns
   a unified diff + self-review (worktrees lack `node_modules` → no local typecheck; central gate is
   authoritative).
2. **Integrate** (controller, main tree): `cp build/icon.png renderer/assets/tray-icon.png`; `git apply`
   the 4 disjoint diffs onto `feat/phase-0-quick-wins`.
3. **Gate:** `pnpm typecheck` + `pnpm build` must pass; controller fixes integration issues.
4. **Two-stage review** (spec compliance, then code quality) over the integrated diff.
5. Report at the checkpoint; **commit only on the operator's go** (CLAUDE.md).

## Definition of done
Fresh launch shows a visible tray icon; an engine boot failure shows a notification + a Quit-able tray
(no silent inert process); a malformed hotkey shows a failure toast (not "updated"); saving an untouched
dictionary persists **zero** rows; over-long dictionary rows are reported as dropped; the Usage tab
refreshes on open; the first dictation after enabling has no model-load stall; a model download shows a
filling bar + MB/MB and can be cancelled; the recording HUD self-dismisses after a hard ceiling; the HUD
clock no longer runs at 60fps; `pnpm dev` launches; `pnpm typecheck` + `pnpm build` pass.
