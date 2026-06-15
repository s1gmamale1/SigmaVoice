# Design — Cloud transcription selector + default Whisper model

**Date:** 2026-06-16
**Status:** Approved (design) — implementation pending
**Scope:** App-shell only (`renderer/`, `src/`). No submodule / engine changes.
**Builds on:** ADR-007 (remote STT + OpenRouter cleanup), `docs/03-plan/_plans/2026-06-14-remote-stt-and-openrouter-cleanup-{design,plan}.md`

## Problem

The Capture pane's **"Cloud" transcription-mode card** still shows a **"Coming soon"** chip and
is hard-disabled — `renderer/js/capture.js` comments it as *"Cloud is decorative, NEVER wired."*
That's now stale: ADR-007 shipped **real cloud transcription**. The Cloud pane already has a working
"Remote transcription" toggle that sends audio to an OpenAI-compatible Whisper endpoint and sets
`voice.transcriptionMode = 'openai-whisper-api'`, and OpenRouter AI cleanup (incl.
`anthropic/claude-sonnet-4.5`) is live. The decorative "Coming soon" card misrepresents shipped
capability — exactly the kind of dishonest-UI placeholder the project treats as a defect.

Separately, the remote-STT **Model** field defaults to blank (placeholder `whisper-1`); we want a
sensible latest-Whisper default.

## Decisions (locked with operator)

1. **Make the Cloud card a live selector.** Clicking "Cloud" switches transcription to the remote
   Whisper server; if no endpoint is configured yet, it opens the Cloud pane to set it up.
2. **Default remote-STT model = `whisper-large-v3`.**

> Note: OpenRouter is the **text-only LLM cleanup** provider and does **not** host Whisper STT. The
> "latest Whisper default" therefore belongs to the **remote-STT** model field, not OpenRouter.

## Design

### A. Live Local/Cloud selector (Capture pane)

Both `.mode-card`s become real toggles: `role="button"`, `tabindex="0"`, keyboard (Enter/Space),
`aria-pressed`, focus ring. The active card shows the ✓ check; selection is driven by JS from the
persisted `transcriptionMode`, not hardcoded markup.

- **Click "Cloud"** → read `getRemoteSttConfig()`:
  - **endpoint configured** (`baseUrl` non-empty): `setRemoteSttConfig({enabled:true, baseUrl, model})`
    — re-validates the URL, flips `transcriptionMode → openai-whisper-api`. Mark Cloud active,
    toast "Cloud transcription on."
  - **not configured**: do **not** switch. Navigate to the Cloud pane
    (`.rail-item[data-panel="cloud"].click()`) and toast "Set your remote Whisper endpoint to use Cloud."
- **Click "Local"** → `setRemoteSttConfig({enabled:false})` → `transcriptionMode → local`. Saved
  endpoint/model/key are preserved (toggling back is one click).
- **State sync**: cards reflect the actual `transcriptionMode` on load and whenever the Capture pane
  is re-activated (so enabling remote STT in the Cloud pane is reflected here). One line added to
  `onPaneActivate` in `settings.js`.

Cloud card copy: chips `Remote · Larger models · Online`; desc "Send audio to your remote Whisper server."

### B. Default remote-STT model = `whisper-large-v3`

`src/cloud-config.ts`: add `DEFAULT_STT_MODEL = 'whisper-large-v3'`. `getRemoteSttConfig()` returns it
when none is saved, so the Cloud-pane Model field pre-fills it instead of being blank. HTML placeholder
updated `whisper-1 → whisper-large-v3`.

### C. Contained config change (enables A safely)

`setRemoteSttConfig`'s `apiKey` becomes **optional**:
- `apiKey === undefined` (absent) → **preserve** the existing stored key (don't write `STT_KEY`).
- `apiKey === ''` → clear it (keyless-LAN behavior, unchanged for the Cloud pane).
- `apiKey === 'xxx'` → set it.

This lets the Capture "Cloud" toggle flip the mode **without wiping the saved STT key** (the renderer
never sees the key). `cloud.js` keeps passing an explicit string, so its behavior is untouched.
`baseUrl`/`model` also become optional in `RemoteSttInput` (the setter already null-coalesces) so the
`{enabled:false}` call type-checks.

## Files (app-shell only)

| File | Change |
|---|---|
| `renderer/settings.html` | Cloud/Local card markup (drop `disabled`/"Coming soon"; add ids, `role=button`, checks, honest chips); STT model placeholder → `whisper-large-v3` |
| `renderer/js/capture.js` | Transcription-mode selector: apply state, click/keydown handlers, init read, Cloud/Local switch + Cloud-pane navigation |
| `renderer/js/settings.js` | Refresh card state on Capture pane activation |
| `renderer/settings.css` | Focus/hover state for interactive mode cards |
| `src/cloud-config.ts` | `DEFAULT_STT_MODEL='whisper-large-v3'`; optional/preserve `apiKey`, optional `baseUrl`/`model` |
| `src/cloud-config.test.ts` | Tests: default model on read; apiKey preserve-vs-clear; enable-from-existing mode flip |

## Edge cases

- **Bad/empty endpoint on Cloud-click** → URL re-validation in `setRemoteSttConfig` returns
  `{ok:false}`; we surface the error toast and route the user to the Cloud pane rather than leaving a
  broken "cloud active" state.
- **Bridge absent** (settings opened outside Electron): `safeCall` returns `undefined`; the selector
  no-ops gracefully (existing pattern).
- **Key preservation**: enabling Cloud from the Capture card must never null a stored STT key
  (covered by the optional-`apiKey` semantics + a unit test).

## Out of scope (flagged, not fixed)

`cloud.js` re-saving remote STT with a blank key field clears a previously-saved key (there's no
"key set ✓" indicator for the STT key like there is for the OpenRouter key). Pre-existing latent
issue; not touched here.

## Verification gate

`pnpm typecheck` + `pnpm build` + `node --test` all green before commit.
