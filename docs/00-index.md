# SigmaVoice Documentation Index

The persistent docs for the standalone SigmaVoice app. Mirrors SigmaLink's `docs/` layout, scoped
to this app. The voice **engine** is documented in the SigmaLink submodule (`./sigmalink/`).

## Start here (taking over the project?)

1. [`HANDOFF.md`](HANDOFF.md) — orientation: what it is, the **engine boundary**, architecture, build/release.
2. [`08-bugs/OPEN.md`](08-bugs/OPEN.md) — the two open bugs (W-SV1 Windows build, W-SV2 quit-abort) with repro + exact errors.
3. [`04-design/native-gotchas.md`](04-design/native-gotchas.md) — the 7 native/build traps. Read before touching deps/build.
4. [`03-plan/ROADMAP.md`](03-plan/ROADMAP.md) — next-phase sequence · [`03-plan/WISHLIST.md`](03-plan/WISHLIST.md) — capture inbox.
5. [`ddd/DOMAINS.md`](ddd/DOMAINS.md) — bounded contexts (who owns what; app vs shared engine).
6. [`10-memory/master_memory.md`](10-memory/master_memory.md) + [`10-memory/memory_index.md`](10-memory/memory_index.md) — history + task index.

Also: [`../CLAUDE.md`](../CLAUDE.md) (agent conventions) · [`../AGENTS.md`](../AGENTS.md) (Codex) · [`../README.md`](../README.md) (product + install).

## Tree
```
docs/
  00-index.md              this file
  HANDOFF.md               developer handoff / orientation
  03-plan/
    WISHLIST.md            capture inbox (findings + ideas)
    ROADMAP.md             next-phase execution sequence
  04-design/
    native-gotchas.md      the 7 native/build traps
  08-bugs/
    OPEN.md                W-SV1, W-SV2 (+ fixed history)
  09-release/              (release notes land here as versions ship)
  10-memory/
    master_memory.md       long-form narrative + decisions
    memory_index.md        compact milestone table
  ddd/
    DOMAINS.md             bounded-context map
```
