# SigmaVoice — Agent Notes (Codex / non-Claude)

Conventions live in [`CLAUDE.md`](CLAUDE.md) — read it; it applies to all agents regardless of CLI.
Orientation for a fresh maintainer: [`docs/HANDOFF.md`](docs/HANDOFF.md).

## TL;DR
- Standalone macOS (Apple Silicon) tray dictation app: global hotkey → on-device Whisper → paste anywhere.
- **Engine boundary:** this repo = the app shell. The voice engine + natives live in the **SigmaLink
  git submodule** (`./sigmalink/`), shared, consumed via pnpm `link:` deps. Edit engine code in
  SigmaLink → bump the submodule pointer. Both open bugs (W-SV1, W-SV2) are engine/native → fixed there.
- **Gate before commit:** `pnpm typecheck` + `pnpm build`. Packaging (electron-builder) is CI-only —
  do NOT run `pack:*` locally (it can recompile the shared natives through the symlink).
- **Native/build gotchas:** `docs/04-design/native-gotchas.md` — read before touching deps or the build.
- Posture: macOS arm64 + Windows x64, unsigned/internal-use. Don't relitigate without an ADR.

## Where things are
`src/` app shell · `renderer/` settings+HUD HTML · `scripts/build.cjs` esbuild · `electron-builder.yml`
· `.github/workflows/{ci,release}.yml` · `sigmalink/` engine submodule · `docs/` full doc tree.
