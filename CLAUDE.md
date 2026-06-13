# SigmaVoice — Agent Conventions

Standalone, local-first, system-wide voice→text dictation app for macOS (Apple Silicon).
Tray-only, unsigned/internal-use. **New here? Read [`docs/HANDOFF.md`](docs/HANDOFF.md) first.**

## The one rule that will bite you: the engine boundary

This repo is the **app shell**. The voice **engine + native modules** live in the SigmaLink git
submodule at `./sigmalink/` and are **shared with SigmaLink** — `voice-core` is the single source
of truth. **Never** vendor or copy engine code.

- App-shell code (`src/`, `renderer/`, `scripts/`, configs) → edit **here**.
- Engine/native code (`sigmalink/app/packages/voice-core/`, `sigmalink/app/native/voice-*`) →
  edit **in SigmaLink**, commit there, then bump this repo's submodule pointer:
  `git -C sigmalink checkout <sha> && git add sigmalink && git commit`.
- **Both open bugs (W-SV1, W-SV2) are engine/native** → fixed in SigmaLink, not here. See `docs/08-bugs/OPEN.md`.

## Rules
- Do what's asked; nothing more. Prefer editing existing files over creating new ones.
- NEVER commit secrets/credentials/.env. NEVER commit build output (`sigma-dist/`, `release/`) — gitignored.
- ALWAYS read a file before editing it. Keep files focused.
- For CODE-EDITING sub-agents working in parallel, pass `isolation:"worktree"` on the Agent call
  (prose in the prompt does NOT isolate). Capture new-file diffs with `git add -A` first.
- **Gate in this repo, not a worktree:** `pnpm typecheck` (tsc) + `pnpm build` must pass before commit.

## Native / build gotchas (READ `docs/04-design/native-gotchas.md` before touching deps or build)
1. `link:` deps NOT `file:` (file: drops gitignored build/ → stub natives).
2. electron-builder `npmRebuild:false`; **never local-pack against a dev tree** (recompiles natives
   through the symlink → can wipe the shared `.node`). Packaging is CI-only.
3. esbuild-EXTERNALIZE `node-global-key-listener` (it spawns a server binary by relative path).
4. `node-gyp-build` + `sudo-prompt` are DIRECT deps (transitive deps of link:/external modules
   aren't bundled). Verify the PACKAGED native loads, not just "the DMG built".
5. Release CI builds natives with explicit `node-gyp` (`@electron/rebuild -w` doesn't match `@sigmalink/*`).
6. macOS AVAudioEngine tap installs with `format:nil` (avoid 44.1kHz format-mismatch abort).
7. The submodule pin is the CI source of truth — bump it after any engine fix.

## Build / test / release
```bash
pnpm install        # links engine from ./sigmalink
pnpm typecheck      # tsc --noEmit  (REQUIRED before commit)
pnpm build          # esbuild → sigma-dist/{main.js,preload.cjs,hud-preload.cjs}
pnpm dev            # run from source
```
Release: push a `v*` tag → `.github/workflows/release.yml` (recursive submodule → build natives →
bundle → unsigned DMG/NSIS). macOS validated; **Windows blocked on W-SV1**. Don't tag without
operator authorization.

## Shared Ruflo memory (single DB across both products)

SigmaLink + SigmaVoice are one production → they **share ONE Ruflo AgentDB**. The ruflo MCP server is
registered **per machine at local scope** with `CLAUDE_FLOW_DIR` pointed at SigmaLink's store
(`/Users/aisigma/projects/SigmaLink/app/.claude-flow`) so patterns/feedback written from either repo
land in the same store and are retrievable from both (`memory_search_unified`).

- **Register per machine** (local scope auto-loads — no approval prompt; a project-scope `.mcp.json`
  def instead requires a manual `/mcp` approval that's easy to miss → tools silently don't appear).
  Then **restart Claude Code** so the MCP tools load:
  `claude mcp add ruflo -s local -e CLAUDE_FLOW_DIR=/Users/aisigma/projects/SigmaLink/app/.claude-flow -- npx -y ruflo@latest mcp start`
- The local-scope def lives in `~/.claude.json` (per-machine, not committed); `.mcp.json` stays empty.
  The **daemon is per-repo** (binds to cwd `./.claude-flow`, ignores `CLAUDE_FLOW_DIR`): `ruflo daemon start`.
- Convention unchanged: **WRITE to namespace `patterns`, READ via `memory_search_unified`**.
- **Caveat — sequential use only.** Don't run the SigmaLink and SigmaVoice agents *live at the same
  time*: two ruflo daemons on one sql.js store won't see each other's in-session writes until reload
  and can contend on locks. Working one repo at a time is fine (committed writes persist + cross-read).

## Posture (don't relitigate without an ADR)
macOS arm64 + Windows x64 only · unsigned (mac ad-hoc / win no Authenticode) · engine via submodule
(single source of truth) · shared Ruflo DB (one store, sequential use) · no heavy new deps · wake-word OFF.

## Docs map
`docs/HANDOFF.md` (orientation) · `docs/08-bugs/OPEN.md` (bugs+repro) · `docs/04-design/native-gotchas.md`
· `docs/03-plan/{WISHLIST,ROADMAP}.md` · `docs/ddd/DOMAINS.md` · `docs/10-memory/{master_memory,memory_index}.md`.


<!-- sigmalink-guardrails:start -->
<!-- sigmalink-guardrails:end -->
