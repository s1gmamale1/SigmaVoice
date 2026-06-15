# Cloud Transcription Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the stale "Coming soon" decorative Cloud card and make the Capture pane's Local/Cloud cards a live transcription-mode selector, with `whisper-large-v3` as the default remote-STT model.

**Architecture:** Selection is driven entirely from the persisted `voice.transcriptionMode` KV value (`local` | `openai-whisper-api`). The Capture cards call the existing `getRemoteSttConfig`/`setRemoteSttConfig` bridge; clicking "Cloud" with no endpoint configured routes the user to the Cloud pane. A small, test-covered change to `cloud-config.ts` makes the STT `apiKey` optional (omitted = preserve the stored key) so the Capture toggle can flip the mode without wiping a key the renderer never sees.

**Tech Stack:** Electron renderer (vanilla ES modules, no framework), TypeScript for `src/` shell logic, `node:test` for unit tests, esbuild for the renderer bundle.

**Design source:** `docs/03-plan/_plans/2026-06-16-cloud-transcription-selector-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/cloud-config.ts` | Pure read/validate/persist of remote-STT + transform config | Add `DEFAULT_STT_MODEL`; make `apiKey`/`baseUrl`/`model` optional with preserve-on-omit semantics |
| `src/cloud-config.test.ts` | Unit tests for the above | Add 3 tests |
| `renderer/settings.html` | Capture-pane card markup + Cloud-pane STT field | Replace both mode cards; update STT model placeholder |
| `renderer/settings.css` | Mode-card styling | Add focus/hover + selected-only check visibility |
| `renderer/js/capture.js` | Capture-pane behavior | Add transcription-mode selector logic; update header comment |
| `renderer/js/settings.js` | Window bootstrap + pane activation | Refresh card state when the Capture pane is activated |

**Note on test coverage:** the repo's test runner is `node --test "src/**/*.test.ts"` — it covers `src/` only. The renderer (`renderer/**`) has **no unit-test harness**, so Tasks 3–6 are verified by `pnpm build` (esbuild catches syntax/import errors) plus the manual smoke checklist in Task 7. Do **not** invent fake/empty tests for renderer files.

---

## Task 1: Default remote-STT model → `whisper-large-v3`

**Files:**
- Modify: `src/cloud-config.ts` (add constant near line 20; use it in `getRemoteSttConfig`, ~line 35)
- Test: `src/cloud-config.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/cloud-config.test.ts` (after the existing `getRemoteSttConfig reflects persisted values` test, ~line 58):

```ts
test('getRemoteSttConfig defaults model to whisper-large-v3 when unset', () => {
  assert.deepEqual(getRemoteSttConfig(fakeKv()), {
    enabled: false, baseUrl: '', model: 'whisper-large-v3',
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test "src/**/*.test.ts"`
Expected: FAIL — the new test reports `model: ''` not `'whisper-large-v3'`.

- [ ] **Step 3: Implement the default**

In `src/cloud-config.ts`, add the constant next to `DEFAULT_TF_MODEL` (line 20):

```ts
const DEFAULT_TF_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_STT_MODEL = 'whisper-large-v3';
```

Then in `getRemoteSttConfig` change the `model` line:

```ts
export function getRemoteSttConfig(kv: KvStore): RemoteSttConfig {
  return {
    enabled: kv.get(STT_MODE) === 'openai-whisper-api',
    baseUrl: kv.get(STT_BASE) ?? '',
    model: kv.get(STT_MODEL) ?? DEFAULT_STT_MODEL,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test "src/**/*.test.ts"`
Expected: PASS — all tests green (the pre-existing `reflects persisted values` test still passes because it seeds a `model`).

- [ ] **Step 5: Commit**

```bash
git add src/cloud-config.ts src/cloud-config.test.ts
git commit -m "feat(cloud): default remote-STT model to whisper-large-v3"
```

---

## Task 2: Optional `apiKey` — preserve the stored key when omitted

**Files:**
- Modify: `src/cloud-config.ts` (`RemoteSttInput` interface ~line 23; `setRemoteSttConfig` ~lines 39–53)
- Test: `src/cloud-config.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/cloud-config.test.ts` (after the `empty apiKey persists empty string` test, ~line 45):

```ts
test('setRemoteSttConfig preserves the stored key when apiKey is omitted', () => {
  const kv = fakeKv({ 'voice.stt.openai-whisper-api.apiKey': 'secret' });
  const r = setRemoteSttConfig(kv, { enabled: true, baseUrl: 'http://x/v1', model: 'whisper-large-v3' });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.stt.openai-whisper-api.apiKey'), 'secret');
  assert.equal(kv.get('voice.transcriptionMode'), 'openai-whisper-api');
});

test('setRemoteSttConfig switches to local with only {enabled:false}', () => {
  const kv = fakeKv({ 'voice.transcriptionMode': 'openai-whisper-api' });
  const r = setRemoteSttConfig(kv, { enabled: false });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.transcriptionMode'), 'local');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test "src/**/*.test.ts"`
Expected: FAIL — `setRemoteSttConfig({enabled:false})` currently type-errors at compile (missing `baseUrl`/`model`/`apiKey`), and the preserve test would overwrite the key with `''`. (If `node --test` transpiles per-file and the type error doesn't surface at runtime, the preserve test still fails on the `'secret'` assertion.)

- [ ] **Step 3: Make `apiKey`/`baseUrl`/`model` optional + preserve-on-omit**

In `src/cloud-config.ts`, change the input interface (line 23):

```ts
export interface RemoteSttInput { enabled: boolean; baseUrl?: string; model?: string; apiKey?: string; }
```

Then rewrite `setRemoteSttConfig` (lines 39–53):

```ts
export function setRemoteSttConfig(kv: KvStore, input: RemoteSttInput): SaveResult {
  const baseUrl = (input.baseUrl ?? '').trim();
  const model = (input.model ?? '').trim();
  if (input.enabled) {
    if (!isHttpUrl(baseUrl)) return { ok: false, error: 'Enter a valid http(s):// endpoint URL.' };
    kv.set(STT_BASE, baseUrl);
    kv.set(STT_MODEL, model);
    // apiKey omitted (undefined) → preserve the stored key; an explicit '' clears
    // it (keyless LAN). The Capture-pane Cloud toggle omits it so flipping the
    // mode never wipes a key the renderer can't see.
    if (input.apiKey !== undefined) kv.set(STT_KEY, input.apiKey.trim());
    kv.set(STT_MODE, 'openai-whisper-api');
  } else {
    kv.set(STT_MODE, 'local');
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test "src/**/*.test.ts"`
Expected: PASS — all tests green. The existing `enabled writes trimmed ... key` and `empty apiKey persists empty string` tests still pass (they pass an explicit `apiKey`).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no errors. Confirms the optional-field change doesn't break `src/main.ts` / IPC callers.

- [ ] **Step 6: Commit**

```bash
git add src/cloud-config.ts src/cloud-config.test.ts
git commit -m "feat(cloud): preserve stored STT key when apiKey omitted"
```

---

## Task 3: Capture-pane card markup + STT placeholder

**Files:**
- Modify: `renderer/settings.html` (mode cards, lines 158–178; STT model input, line 357)

- [ ] **Step 1: Replace both mode cards**

Replace the entire `<div class="mode-card selected" ...>...</div>` and `<div class="mode-card disabled" ...>...</div>` block (lines 158–178) with:

```html
          <div class="mode-card selected" id="mode-card-local" role="button" tabindex="0" aria-pressed="true">
            <div class="mode-card-head">
              <span class="mode-card-title">Local</span>
              <span class="mode-card-check" aria-hidden="true">✓</span>
            </div>
            <p class="mode-card-desc">On-device Whisper. No audio leaves your Mac.</p>
            <div class="chip-row">
              <span class="chip">Private</span>
              <span class="chip">Offline</span>
              <span class="chip">English</span>
            </div>
          </div>
          <div class="mode-card" id="mode-card-cloud" role="button" tabindex="0" aria-pressed="false">
            <div class="mode-card-head">
              <span class="mode-card-title">Cloud</span>
              <span class="mode-card-check" aria-hidden="true">✓</span>
            </div>
            <p class="mode-card-desc">Send audio to your remote Whisper server.</p>
            <div class="chip-row">
              <span class="chip">Remote</span>
              <span class="chip">Larger models</span>
              <span class="chip">Online</span>
            </div>
          </div>
```

(Both cards now have a `.mode-card-check`; Task 4's CSS shows it only on the `.selected` card. The `disabled` class and "Coming soon" chip are gone.)

- [ ] **Step 2: Update the remote-STT model placeholder**

On line 357, change the `stt-model` input placeholder from `whisper-1` to `whisper-large-v3`:

```html
              <input type="text" id="stt-model" class="text-input" placeholder="whisper-large-v3" spellcheck="false" />
```

- [ ] **Step 3: Commit**

```bash
git add renderer/settings.html
git commit -m "feat(ui): make Cloud card interactive, drop 'Coming soon'"
```

---

## Task 4: Mode-card CSS — focus/hover + selected-only check

**Files:**
- Modify: `renderer/settings.css` (after `.mode-card.disabled`, line 311)

- [ ] **Step 1: Add the interactive-state rules**

Immediately after the `.mode-card.disabled { ... }` rule (line 311), add:

```css
.mode-card:hover { border-color: var(--accent); }
.mode-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* Show the ✓ only on the active card (display:inline-flex on .mode-card-check
   would otherwise override the [hidden] attribute). */
.mode-card:not(.selected) .mode-card-check { display: none; }
```

- [ ] **Step 2: Commit**

```bash
git add renderer/settings.css
git commit -m "style(ui): focus/hover + selected-only check for mode cards"
```

---

## Task 5: Capture-pane selector logic

**Files:**
- Modify: `renderer/js/capture.js` (header comment, lines 3–4; new section + wire-up in `initCapture`)

- [ ] **Step 1: Update the stale header comment**

Replace lines 3–4:

```js
// Transcription mode (Local active / Cloud disabled — Cloud is decorative,
// NEVER wired), the model list with size + 'Download required' pill +
```

with:

```js
// Transcription mode (live Local/Cloud selector driven by voice.transcriptionMode;
// Cloud routes to the Cloud pane when no remote endpoint is configured), the model
// list with size + 'Download required' pill +
```

- [ ] **Step 2: Add the selector module section**

Insert this block immediately before `// --- Whisper models` (line 63):

```js
// --- Transcription mode (Local / Cloud selector) ---------------------------

const CLOUD_MODE = 'openai-whisper-api';

/** Reflect the active transcription mode onto the Local/Cloud cards. */
function applyTranscriptionMode(mode) {
  const cloud = mode === CLOUD_MODE;
  const localCard = document.getElementById('mode-card-local');
  const cloudCard = document.getElementById('mode-card-cloud');
  localCard?.classList.toggle('selected', !cloud);
  cloudCard?.classList.toggle('selected', cloud);
  localCard?.setAttribute('aria-pressed', String(!cloud));
  cloudCard?.setAttribute('aria-pressed', String(cloud));
}

/** Re-read persisted mode and reflect it (on init + Capture pane re-activation). */
export async function refreshTranscriptionMode() {
  const cfg = await safeCall('getRemoteSttConfig');
  applyTranscriptionMode(cfg?.enabled ? CLOUD_MODE : 'local');
}

/** Jump the sidebar to the Cloud pane (reuses the rail item's own handler). */
function gotoCloudPane() {
  document.querySelector('.rail-item[data-panel="cloud"]')?.click();
}

async function selectLocal() {
  applyTranscriptionMode('local'); // optimistic
  const res = await safeCall('setRemoteSttConfig', { enabled: false });
  if (res && res.ok === false) {
    showToast(res.error || 'Could not switch to Local', 'error');
    void refreshTranscriptionMode();
    return;
  }
  showToast('Local transcription on');
}

async function selectCloud() {
  const cfg = await safeCall('getRemoteSttConfig');
  if (!cfg || !cfg.baseUrl) {
    showToast('Set your remote Whisper endpoint to use Cloud', 'warn');
    gotoCloudPane();
    return;
  }
  const res = await safeCall('setRemoteSttConfig', { enabled: true, baseUrl: cfg.baseUrl, model: cfg.model });
  if (res && res.ok === false) {
    showToast(res.error || 'Could not enable Cloud', 'error');
    gotoCloudPane();
    return;
  }
  applyTranscriptionMode(CLOUD_MODE);
  showToast('Cloud transcription on');
}

/** Wire the Local/Cloud cards: click + keyboard (Enter/Space). */
function initTranscriptionMode() {
  const handler = (fn) => (e) => {
    if (e.type === 'keydown') {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
    }
    void fn();
  };
  const localCard = document.getElementById('mode-card-local');
  const cloudCard = document.getElementById('mode-card-cloud');
  localCard?.addEventListener('click', handler(selectLocal));
  localCard?.addEventListener('keydown', handler(selectLocal));
  cloudCard?.addEventListener('click', handler(selectCloud));
  cloudCard?.addEventListener('keydown', handler(selectCloud));
  void refreshTranscriptionMode();
}
```

- [ ] **Step 3: Call `initTranscriptionMode()` from `initCapture`**

In `initCapture` (currently starts ~line 263), add the call as the first statement inside the function body, immediately after the opening `export function initCapture() {` line and its leading comment block. Concretely, insert before the `hotkeyCapture = initHotkeyCapture({` line:

```js
  // Transcription-mode selector (Local / Cloud cards).
  initTranscriptionMode();

```

- [ ] **Step 4: Build to verify no syntax/import errors**

Run: `pnpm build`
Expected: PASS — esbuild emits `sigma-dist/main.js` etc. with no errors. (`safeCall` and `showToast` are already imported at the top of `capture.js`.)

- [ ] **Step 5: Commit**

```bash
git add renderer/js/capture.js
git commit -m "feat(ui): wire Local/Cloud transcription-mode selector"
```

---

## Task 6: Refresh card state on Capture pane activation

**Files:**
- Modify: `renderer/js/settings.js` (import line 31; `onPaneActivate`, lines 48–55)

- [ ] **Step 1: Import the refresh function**

Change line 31:

```js
import { initCapture, applyCaptureStatus, refreshTranscriptionMode } from './capture.js';
```

- [ ] **Step 2: Refresh on Capture activation**

In `onPaneActivate` (lines 48–55), add a `capture` branch so the cards re-sync with whatever the Cloud pane persisted:

```js
function onPaneActivate(panel) {
  // Overview + Usage re-fetch on each activation (UX-9); Dictionary loads once
  // (lazy) so unsaved edits aren't discarded when re-selecting the pane.
  if (panel === 'overview') renderOverviewStats();
  if (panel === 'capture') void refreshTranscriptionMode();
  if (panel === 'dictionary') loadDictionary();
  if (panel === 'usage') loadStats();
  if (panel === 'cloud') loadCloud();
}
```

- [ ] **Step 3: Build to verify**

Run: `pnpm build`
Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add renderer/js/settings.js
git commit -m "feat(ui): re-sync transcription cards on Capture activation"
```

---

## Task 7: Full gate + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `pnpm typecheck && pnpm build && node --test "src/**/*.test.ts"`
Expected: all three PASS — tsc clean, esbuild emits the bundle, all `node:test` cases green.

- [ ] **Step 2: Manual smoke (run `pnpm dev`, open Settings → Capture)**

Verify each:
- The Cloud card shows **no** "Coming soon" chip; chips read **Remote · Larger models · Online**.
- Local card is selected (✓) on first open; Cloud card has no ✓.
- **Click Cloud with no endpoint configured** → toast "Set your remote Whisper endpoint to use Cloud", sidebar jumps to the **Cloud** pane. Cards still show Local selected.
- In the Cloud pane, the **Model** field pre-fills `whisper-large-v3`. Enter a valid Endpoint URL (e.g. `http://localhost:8000/v1`) + an API key, Save.
- Go back to **Capture**: Cloud card now shows ✓ (selected) — state synced from the Cloud pane.
- **Click Local** → toast "Local transcription on", Local card selected.
- **Click Cloud again** → toast "Cloud transcription on", Cloud selected (endpoint now configured). Re-open the Cloud pane and confirm the **API key is still set** (not wiped by the Capture toggle).
- Keyboard: Tab to a card, press **Enter**/**Space** → it toggles like a click.

- [ ] **Step 3: Final verification of the working tree**

Run: `git status -sb`
Expected: clean (all task commits landed; no stray files).

---

## Self-Review

- **Spec coverage:** §A live selector → Tasks 3,4,5,6. §B default model → Tasks 1,3. §C optional apiKey → Task 2. Edge cases (bad endpoint, bridge absent, key preservation) → Task 5 (`selectCloud` error/nav paths, `safeCall` no-op) + Task 2 test. Manual smoke → Task 7. No gaps.
- **Type consistency:** `CLOUD_MODE = 'openai-whisper-api'` matches `getRemoteSttConfig().enabled` semantics; `refreshTranscriptionMode` is exported from `capture.js` and imported in `settings.js` under the same name; `setRemoteSttConfig` is called with `{enabled:false}` and `{enabled:true,baseUrl,model}`, both valid under the Task-2 optional-field interface.
- **No placeholders:** every code/test step shows complete content; renderer files (no harness) use `pnpm build` + the explicit Task-7 smoke checklist instead of fake tests.
