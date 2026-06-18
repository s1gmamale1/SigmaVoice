# SigmaVoice — Memory Index

Compact index of milestones. Detailed narrative lives in [`master_memory.md`](master_memory.md);
open bugs in [`../08-bugs/OPEN.md`](../08-bugs/OPEN.md); next-phase sequence in
[`../03-plan/ROADMAP.md`](../03-plan/ROADMAP.md).

| task_index | task_title | result | notes |
|---|---|---|---|
| SV-01 | Relocate `app/apps/sigma-voice` → top-level `sigma-voice/` in SigmaLink; rewire to `link:` deps | shipped | the `file:`→`link:` fix (gotcha #1) |
| SV-02 | Finish standalone v0.3: real PTT, focus-preserving HUD, dictionary/macros + stats, persistent KV, single-instance, Apple-grade settings | shipped | 3 worktree lanes + Opus review |
| SV-03 | Publish to own repo `s1gmamale1/SigmaVoice`; embed SigmaLink as submodule; CI (ci.yml + release.yml) | shipped | single source of truth via submodule |
| SV-04 | v0.3.0 macOS DMG release | shipped → deleted | crashed on launch (missing transitive dep) |
| SV-05 | v0.3.1 — fix launch crash (`sudo-prompt`/`node-gyp-build` direct deps; lazy key-listener) + distinct icon | shipped → deleted | gotcha #4 |
| SV-06 | v0.3.2 — fix Test-Recording crash (AVAudioEngine tap `format:nil`) + model-download UX | shipped (Latest) | gotcha #6; engine fix → SigmaLink + submodule bump |
| SV-07 | macOS `curl\|bash` installer (`scripts/install-macos.sh`, quarantine-free) | shipped | mirrors SigmaLink's installer |
| SV-08 | Repo doc ecosystem + handoff (this docs/ tree) for the incoming maintainer | shipped | CLAUDE.md + docs/ + HANDOFF |
| SV-09 | v0.4.0 — Phase 0 (functional/honest UX) + Phase 1 (Apple-grade UI) + Phase 1.5 (modifier hold-to-talk PTT + floating pill) | shipped (pre-release) | macOS arm64 DMG; reviewed by 2 sub-agents; on-device smoke pending → stable |
| SV-10 | v0.5.5 — release-readiness app-shell hardening + macOS release | shipped (pre-release) | macOS DMG/ZIP + checksum published; Windows job advisory until SigmaLink W-SV1 |
| W-SV1 | Windows NSIS build — `voice-whisper` MSVC link (`LNK1120`) | 🔴 open | engine fix in SigmaLink; Windows-runner CI |
| W-SV2 | Quit-time TSFN SIGABRT | 🟠 open (low) | `tsfn_bridge` fix in SigmaLink |
