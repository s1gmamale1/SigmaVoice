# Remote STT (self-hosted/LAN) + OpenRouter LLM cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let SigmaVoice transcribe against a user's self-hosted OpenAI-compatible Whisper server (RTX 3060 over LAN) with auto-fallback to on-device Whisper, and optionally run the transcript through any OpenRouter model for cleanup/formatting — both opt-in, off by default.

**Architecture:** The voice **engine** (`@sigmalink/voice-core`) already routes transcription by `voice.transcriptionMode` and already ships an OpenAI-compatible STT engine — we make its URL/model configurable + key-optional, generalize its fallback-to-local, and add a new OpenRouter transform engine + a post-`normalizeTranscript` cleanup seam. The **app shell** (this repo) adds an encrypted key store, IPC, and two Settings panels. Engine work lands upstream in **SigmaLink** then this repo bumps the submodule pin (ADR-003).

**Tech Stack:** TypeScript (ESM), Electron 30, esbuild, `node:test` (app shell) / **vitest** (voice-core), global `fetch`, Electron `safeStorage`. No new runtime deps (ADR-007).

**Spec:** `docs/03-plan/_plans/2026-06-14-remote-stt-and-openrouter-cleanup-design.md` · **ADR:** ADR-007 in `docs/03-plan/ROADMAP.md`.

---

## Working-directory map (READ FIRST)

- **Phase A tasks** edit the engine in the **SigmaLink repo**: `cd /Users/aisigma/projects/SigmaLink/app`. Files under `packages/voice-core/src/`. Tests: `npx vitest run packages/voice-core/src/<file>.test.ts`. Commit in SigmaLink.
- **Phase B + C tasks** edit **this repo** (SigmaVoice): repo root `/Users/aisigma/Library/Application Support/SigmaLink/worktrees/0243793c723b/builder-builder-1-f5185880` (or wherever this checkout lives). Tests: `pnpm test`. Gate: `pnpm typecheck && pnpm build` **in this repo, not a worktree** (CLAUDE.md).
- **Ruflo sequential-use:** do not run SigmaLink + SigmaVoice agents live at the same time (shared AgentDB lock).
- The `sigmalink/` submodule is **not checked out** in this worktree; Phase A happens in the real SigmaLink clone.

---

## File structure

**SigmaLink `packages/voice-core/src/` (Phase A):**
- Modify `cloud-stt-engine.ts` — configurable baseUrl/model, optional key, fetch timeout. (+ `cloud-stt-engine.test.ts`)
- Modify `global-capture.ts` — wire baseUrl/model into `makeCloudDeps`; generalize fallback to cover `openai-whisper-api`; add the transform seam + `transformDeps`. (+ `global-capture.test.ts`)
- Create `openrouter-llm-engine.ts` — `buildOpenRouterTransform`, `LlmKeyMissingError`, `TRANSFORM_PRESETS`, `resolveTransformPrompt`. (+ `openrouter-llm-engine.test.ts`)
- Modify `index.ts` — export the new symbols.

**SigmaVoice `src/` + `renderer/` (Phase B):**
- Create `src/secret-store.ts` — Electron-agnostic encrypted secret store (injectable backend). (+ `src/secret-store.test.ts`)
- Create `src/cloud-config.ts` — validate/persist remote-STT + transform config in KV. (+ `src/cloud-config.test.ts`)
- Create `src/llm-ipc.ts` — IPC handlers (key + configs).
- Modify `src/main.ts` — build secret store, inject `transformDeps`, register IPC, guard prewarm to local mode.
- Modify `src/preload.ts` — expose new `bv:*` channels.
- Modify `renderer/settings.html` — add a "Cloud" rail tab + pane.
- Create `renderer/js/cloud.js` — wire the Cloud pane (remote STT + AI cleanup).
- Modify `renderer/js/settings.js` — import + init the Cloud pane.

**Phase C:** bump `sigmalink` submodule pin in this repo; gate; smoke checklist.

---

## KV keys & secret id (single source of truth — reference for every task)

| Key | Where | Meaning / default |
|---|---|---|
| `voice.transcriptionMode` | KV | `'local'` (default) or `'openai-whisper-api'` (remote) |
| `voice.stt.openai-whisper-api.baseUrl` | KV | e.g. `http://192.168.1.50:8000/v1` (empty = OpenAI cloud — not exposed in SV UI) |
| `voice.stt.openai-whisper-api.model` | KV | e.g. `Systran/faster-whisper-large-v3`; default `whisper-1` |
| `voice.stt.openai-whisper-api.apiKey` | KV | optional; omitted for keyless LAN servers |
| `voice.transform.mode` | KV | `'off'` (default) or `'openrouter'` |
| `voice.transform.model` | KV | default `google/gemini-2.5-flash-lite` |
| `voice.transform.preset` | KV | `'punctuate'`(default)`/'fillers'/'email'/'custom'` |
| `voice.transform.prompt` | KV | the prompt when preset = `custom` |
| `provider.openrouter.apiKey` | **secret-store** (encrypted) | the OpenRouter key — never in KV |

---

# PHASE A — Engine (in SigmaLink: `cd /Users/aisigma/projects/SigmaLink/app`)

## Task A1: Configurable URL + optional key + timeout in `buildOpenAiSttEngine`

**Files:**
- Modify: `packages/voice-core/src/cloud-stt-engine.ts`
- Test: `packages/voice-core/src/cloud-stt-engine.test.ts`

- [ ] **Step 1: Write failing tests** — append to `cloud-stt-engine.test.ts`:

```ts
describe('buildOpenAiSttEngine — configurable endpoint (ADR-007)', () => {
  it('POSTs to a custom baseUrl + model and omits Authorization when keyless', async () => {
    let calledUrl = '';
    let calledHeaders: Record<string, string> = {};
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      calledUrl = url;
      calledHeaders = (init.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ text: 'hello lan' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const engine = buildOpenAiSttEngine({
      fetchFn,
      getApiKey: () => null,
      getBaseUrl: () => 'http://192.168.1.50:8000/v1',
      getModel: () => 'Systran/faster-whisper-large-v3',
    });
    const result = await engine.transcribe(silentAudio(), '');
    expect(result.text).toBe('hello lan');
    expect(calledUrl).toBe('http://192.168.1.50:8000/v1/audio/transcriptions');
    expect('Authorization' in calledHeaders).toBe(false);
  });

  it('sends Authorization when a key IS present, against the custom baseUrl', async () => {
    let calledHeaders: Record<string, string> = {};
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      calledHeaders = (init.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ text: 'k' }), { status: 200 });
    }) as unknown as typeof fetch;
    const engine = buildOpenAiSttEngine({
      fetchFn, getApiKey: () => 'sk-test', getBaseUrl: () => 'https://api.groq.com/openai/v1',
    });
    await engine.transcribe(silentAudio(), '');
    expect(calledHeaders.Authorization).toBe('Bearer sk-test');
  });

  it('does NOT throw SttKeyMissingError when a baseUrl is set but no key', async () => {
    const fetchFn = makeFetchFn(200, { text: 'ok' });
    const engine = buildOpenAiSttEngine({ fetchFn, getApiKey: () => null, getBaseUrl: () => 'http://box:9000' });
    await expect(engine.transcribe(silentAudio(), '')).resolves.toEqual({ text: 'ok', segments: [] });
  });

  it('still throws SttKeyMissingError for default cloud (no baseUrl, no key)', async () => {
    const engine = buildOpenAiSttEngine({ fetchFn: vi.fn() as unknown as typeof fetch, getApiKey: () => null });
    await expect(engine.transcribe(silentAudio(), '')).rejects.toBeInstanceOf(SttKeyMissingError);
  });
});
```

- [ ] **Step 2: Run tests, verify they FAIL**

Run: `npx vitest run packages/voice-core/src/cloud-stt-engine.test.ts`
Expected: FAIL — `getBaseUrl`/`getModel` not on `CloudSttEngineDeps`; default-cloud URL hardcoded.

- [ ] **Step 3: Implement** — in `cloud-stt-engine.ts`, extend the deps interface:

```ts
export interface CloudSttEngineDeps {
  fetchFn?: typeof fetch;
  getApiKey: (provider: 'openai-whisper-api' | 'deepgram') => string | null;
  /** ADR-007 — optional base URL for a self-hosted/LAN OpenAI-compatible server.
   *  Absent/empty → default OpenAI cloud. Only consulted by the OpenAI engine. */
  getBaseUrl?: () => string | null;
  /** ADR-007 — optional model id (self-hosted servers use their own ids). Default 'whisper-1'. */
  getModel?: () => string | null;
}
```

Replace the body of `buildOpenAiSttEngine`'s `transcribe` (lines ~71-103) with:

```ts
async transcribe(audio: Float32Array): Promise<TranscribeResult> {
  const apiKey = deps.getApiKey('openai-whisper-api');
  const rawBase = deps.getBaseUrl?.()?.trim() || '';
  // No key AND no custom endpoint → this is the default OpenAI cloud path, which requires a key.
  if (!apiKey && !rawBase) throw new SttKeyMissingError('openai-whisper-api');

  const base = (rawBase || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = `${base}/audio/transcriptions`;
  const model = deps.getModel?.()?.trim() || 'whisper-1';

  const wavBuffer = encodeWav(audio, 16000);
  const formData = new FormData();
  formData.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'audio.wav');
  formData.append('model', model);
  formData.append('response_format', 'json');
  formData.append('language', 'en');

  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetchFn(url, {
    method: 'POST',
    headers,
    body: formData,
    signal: AbortSignal.timeout(30_000), // ADR-007: HTTP analog of the ENG-3 spawn timeout
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`OpenAI-compatible STT error ${response.status}: ${body}`);
  }
  const json = await response.json() as { text?: string };
  return { text: (json.text ?? '').trim(), segments: [] };
},
```

- [ ] **Step 4: Run tests, verify PASS** (the new block + all pre-existing OpenAI/Deepgram tests)

Run: `npx vitest run packages/voice-core/src/cloud-stt-engine.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit** (in SigmaLink)

```bash
git -C /Users/aisigma/projects/SigmaLink add app/packages/voice-core/src/cloud-stt-engine.ts app/packages/voice-core/src/cloud-stt-engine.test.ts
git -C /Users/aisigma/projects/SigmaLink commit -m "feat(voice-core): configurable URL + optional key for OpenAI-compatible STT (ADR-007)"
```

---

## Task A2: Wire baseUrl/model into capture + generalize fallback-to-local for remote STT

**Files:**
- Modify: `packages/voice-core/src/global-capture.ts` (`makeCloudDeps` ~521-524; fallback branch ~558-582)
- Test: `packages/voice-core/src/global-capture.test.ts`

- [ ] **Step 1: Write a failing test** — append to `global-capture.test.ts` (follow the file's existing controller-construction helper; the assertion that matters is that a remote failure falls back to local). Add:

```ts
describe('remote STT fallback (ADR-007)', () => {
  it('falls back to on-device Whisper when the remote endpoint fails', async () => {
    // Arrange a controller in 'openai-whisper-api' mode with a baseUrl set, a downloaded
    // local model, a fetchFn that rejects (box offline), and a stub local whisper engine.
    // Assert: finalText comes from the LOCAL engine and a toast was emitted.
    // (Use the same harness the other tests in this file use to build the controller and
    //  drive a capture; inject deps.cloudSttEngineDeps.fetchFn = () => Promise.reject(new Error('ECONNREFUSED')).)
    // EXPECTED ASSERTIONS:
    //   expect(localTranscribe).toHaveBeenCalled();
    //   expect(emittedToasts.some(t => /on-device|fell back|unreachable/i.test(t.message))).toBe(true);
  });
});
```
> NOTE for the implementer: `global-capture.test.ts` already constructs controllers and mocks the native path — reuse that exact harness (KV seeded via the file's fake KV, `getWhisperEngine` mock). Write the assertions concretely against it; do not leave the comment block in the committed test.

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx vitest run packages/voice-core/src/global-capture.test.ts`
Expected: FAIL — remote failure currently hits the `else` branch (`:579`) and does not fall back.

- [ ] **Step 3: Implement** — two edits in `global-capture.ts`:

(a) In `makeCloudDeps` (~521-524) add baseUrl/model getters:

```ts
const makeCloudDeps = (provider: 'openai-whisper-api' | 'deepgram'): CloudSttEngineDeps => ({
  ...cloudDepsBase,
  getApiKey: () => kvGet(`voice.stt.${provider}.apiKey`),
  getBaseUrl: () => kvGet(`voice.stt.${provider}.baseUrl`),
  getModel: () => kvGet(`voice.stt.${provider}.model`),
});
```

(b) Generalize the fallback branch (~563) so remote STT failures also fall back to local. Change:

```ts
} else if (transcriptionMode === 'gemini-cli') {
```
to:
```ts
} else if (transcriptionMode === 'gemini-cli' || transcriptionMode === 'openai-whisper-api') {
```
and update the log + toast inside that branch to be mode-aware:
```ts
console.warn(`[global-capture] ${transcriptionMode} transcription failed, falling back to local:`, err);
const localEngine = getWhisperEngine();
if (localEngine && modelPath) {
  try {
    const audio16k = resampleTo16k(audio, hwRate);
    const result = await localEngine.transcribe(audio16k, modelPath, { language: 'en', threads: 4 });
    if (result.text.trim()) finalText = result.text.trim();
    appendSessionStat(deps.kv, computeSessionStats(result.segments ?? []));
    toast('Remote transcription unreachable — used on-device Whisper.', 'warn');
  } catch (fallbackErr) {
    console.warn('[global-capture] local fallback also failed:', fallbackErr);
  }
} else {
  toast('Remote transcription failed and no local model is downloaded.', 'warn');
}
```
(Leave the `SttKeyMissingError` branch above it untouched — a missing key still surfaces its own toast.)

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run packages/voice-core/src/global-capture.test.ts`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git -C /Users/aisigma/projects/SigmaLink add app/packages/voice-core/src/global-capture.ts app/packages/voice-core/src/global-capture.test.ts
git -C /Users/aisigma/projects/SigmaLink commit -m "feat(voice-core): wire remote STT baseUrl/model + fallback-to-local on failure (ADR-007)"
```

---

## Task A3: New OpenRouter transform engine + presets

**Files:**
- Create: `packages/voice-core/src/openrouter-llm-engine.ts`
- Test: `packages/voice-core/src/openrouter-llm-engine.test.ts`

- [ ] **Step 1: Write failing tests** — `openrouter-llm-engine.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  buildOpenRouterTransform, LlmKeyMissingError, resolveTransformPrompt, TRANSFORM_PRESETS,
} from './openrouter-llm-engine.js';

function chatResponse(content: string, status = 200): typeof fetch {
  return vi.fn(async () => new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status, headers: { 'Content-Type': 'application/json' } },
  )) as unknown as typeof fetch;
}

describe('buildOpenRouterTransform', () => {
  it('throws LlmKeyMissingError when no key', async () => {
    const transform = buildOpenRouterTransform({ fetchFn: vi.fn() as unknown as typeof fetch, getApiKey: () => null });
    await expect(transform('hi', { model: 'm', prompt: 'p' })).rejects.toBeInstanceOf(LlmKeyMissingError);
  });

  it('POSTs chat/completions with system+user messages and returns content', async () => {
    let url = ''; let body: any = {}; let headers: Record<string, string> = {};
    const fetchFn = vi.fn(async (u: string, init: RequestInit) => {
      url = u; headers = init.headers as Record<string, string>; body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'Cleaned text.' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const transform = buildOpenRouterTransform({ fetchFn, getApiKey: () => 'or-key' });
    const out = await transform('cleaned text', { model: 'google/gemini-2.5-flash-lite', prompt: 'Fix it' });
    expect(out).toBe('Cleaned text.');
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(headers.Authorization).toBe('Bearer or-key');
    expect(body.model).toBe('google/gemini-2.5-flash-lite');
    expect(body.messages).toEqual([
      { role: 'system', content: 'Fix it' },
      { role: 'user', content: 'cleaned text' },
    ]);
  });

  it('throws on non-2xx so the caller can passthrough', async () => {
    const transform = buildOpenRouterTransform({ fetchFn: chatResponse('x', 500), getApiKey: () => 'k' });
    await expect(transform('t', { model: 'm', prompt: 'p' })).rejects.toThrow(/OpenRouter 500/);
  });
});

describe('resolveTransformPrompt', () => {
  it('returns the preset prompt for a known preset id', () => {
    expect(resolveTransformPrompt('punctuate', null)).toBe(TRANSFORM_PRESETS.punctuate);
    expect(resolveTransformPrompt('email', null)).toBe(TRANSFORM_PRESETS.email);
  });
  it('returns the custom prompt when preset=custom and a prompt is set', () => {
    expect(resolveTransformPrompt('custom', 'Make it a haiku')).toBe('Make it a haiku');
  });
  it('falls back to the punctuate preset for unknown/empty', () => {
    expect(resolveTransformPrompt(null, null)).toBe(TRANSFORM_PRESETS.punctuate);
    expect(resolveTransformPrompt('custom', '')).toBe(TRANSFORM_PRESETS.punctuate);
  });
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `npx vitest run packages/voice-core/src/openrouter-llm-engine.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement** — create `openrouter-llm-engine.ts`:

```ts
// openrouter-llm-engine.ts — OpenRouter chat/completions transform pass (ADR-007).
//
// Mirrors cloud-stt-engine.ts: injectable fetch, typed key-missing error, no Electron deps.
// Used as the post-transcription cleanup stage in global-capture.ts. Non-streaming.

export class LlmKeyMissingError extends Error {
  readonly provider = 'openrouter' as const;
  constructor() {
    super('OpenRouter API key missing. Set it in Settings → Cloud.');
    this.name = 'LlmKeyMissingError';
  }
}

export interface OpenRouterTransformDeps {
  /** Injectable fetch (global in prod, mock in tests). @default globalThis.fetch */
  fetchFn?: typeof fetch;
  /** Returns the OpenRouter API key (the app shell reads it from encrypted storage). */
  getApiKey: () => string | null;
}

export type TransformFn = (text: string, opts: { model: string; prompt: string }) => Promise<string>;

export function buildOpenRouterTransform(deps: OpenRouterTransformDeps): TransformFn {
  const fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
  return async (text, opts) => {
    const apiKey = deps.getApiKey();
    if (!apiKey) throw new LlmKeyMissingError();

    const response = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://sigmavoice.app',
        'X-Title': 'SigmaVoice',
      },
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: opts.prompt },
          { role: 'user', content: text },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenRouter ${response.status}: ${body}`);
    }
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return (json.choices?.[0]?.message?.content ?? '').trim();
  };
}

// ── Transform prompt presets ────────────────────────────────────────────────
export const TRANSFORM_PRESETS = {
  punctuate:
    'You are a dictation cleanup tool. Fix punctuation, capitalization, and obvious ' +
    'transcription errors in the user\'s text. Do NOT add, remove, or rephrase content. ' +
    'Return only the corrected text, nothing else.',
  fillers:
    'You are a dictation cleanup tool. Remove filler words (um, uh, like, you know), false ' +
    'starts, and repetitions, then fix punctuation and capitalization. Preserve meaning and ' +
    'wording otherwise. Return only the cleaned text, nothing else.',
  email:
    'Rewrite the user\'s dictated text as a clear, professional email body. Keep the intent and ' +
    'facts; improve structure and tone. Return only the email body, no subject line, no preamble.',
} as const;

export type TransformPresetId = keyof typeof TRANSFORM_PRESETS | 'custom';

/** Resolve a preset id (+ optional custom prompt) to the system prompt string. */
export function resolveTransformPrompt(preset: string | null, customPrompt: string | null): string {
  if (preset === 'custom') {
    const p = (customPrompt ?? '').trim();
    return p || TRANSFORM_PRESETS.punctuate;
  }
  if (preset && preset in TRANSFORM_PRESETS) {
    return TRANSFORM_PRESETS[preset as keyof typeof TRANSFORM_PRESETS];
  }
  return TRANSFORM_PRESETS.punctuate;
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run packages/voice-core/src/openrouter-llm-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/aisigma/projects/SigmaLink add app/packages/voice-core/src/openrouter-llm-engine.ts app/packages/voice-core/src/openrouter-llm-engine.test.ts
git -C /Users/aisigma/projects/SigmaLink commit -m "feat(voice-core): OpenRouter transform engine + prompt presets (ADR-007)"
```

---

## Task A4: Cleanup seam in the capture pipeline (+ `transformDeps`)

**Files:**
- Modify: `packages/voice-core/src/global-capture.ts` (deps interface ~177; seam after `normalizeTranscript` ~596)
- Test: `packages/voice-core/src/global-capture.test.ts`

- [ ] **Step 1: Write a failing test** — append to `global-capture.test.ts`:

```ts
describe('OpenRouter cleanup seam (ADR-007)', () => {
  it('replaces the transcript with the transform output when mode=openrouter', async () => {
    // KV seeded: voice.transform.mode='openrouter', voice.transform.model='m', voice.transform.preset='punctuate'.
    // deps.transformDeps = { getApiKey: () => 'k', fetchFn: <mock returning {choices:[{message:{content:'Polished.'}}]}> }.
    // Drive a capture whose raw transcript is 'polished'. ASSERT finalText routed == 'Polished.'.
  });
  it('passes the RAW transcript through when the transform throws (offline/bad key)', async () => {
    // Same as above but fetchFn rejects OR getApiKey returns null.
    // ASSERT the routed text == the raw transcript (no loss) AND a warn toast was emitted.
  });
  it('does nothing when mode!=openrouter (default off)', async () => {
    // No voice.transform.mode set; ASSERT transformDeps.fetchFn was never called.
  });
});
```
> Implementer: reuse the existing controller harness + the way it captures the routed text (it already asserts on routed/clipboard output). Replace these comment stubs with real assertions; do not commit comment-only tests.

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx vitest run packages/voice-core/src/global-capture.test.ts`
Expected: FAIL — no transform seam / `transformDeps` not on `GlobalCaptureDeps`.

- [ ] **Step 3: Implement** — three edits in `global-capture.ts`:

(a) Add the import near the other engine imports (top, ~26):
```ts
import { buildOpenRouterTransform, resolveTransformPrompt } from './openrouter-llm-engine.js';
```

(b) Add the optional dep to `GlobalCaptureDeps` (after `cloudSttEngineDeps`, ~177):
```ts
  // ── ADR-007 — OpenRouter transcript transform (optional; absent = cleanup off) ──
  /**
   * Injected deps for the OpenRouter cleanup pass. The app shell supplies `getApiKey`
   * reading from ENCRYPTED storage (the key is never in KV). Only used when
   * `kv.get('voice.transform.mode') === 'openrouter'`.
   */
  transformDeps?: { fetchFn?: typeof fetch; getApiKey: () => string | null };
```

(c) Insert the seam between `normalizeTranscript` (~596) and `setState('routing')` (~600):
```ts
    // C-10a — Apply phrase/macro dictionary substitutions before routing.
    finalText = normalizeTranscript(finalText, kvGet);

    // ADR-007 — Optional OpenRouter cleanup pass. On ANY failure, keep the raw
    // transcript (never drop a dictation).
    if (kvGet('voice.transform.mode') === 'openrouter' && deps.transformDeps) {
      try {
        const transform = buildOpenRouterTransform(deps.transformDeps);
        const model = kvGet('voice.transform.model') ?? 'google/gemini-2.5-flash-lite';
        const prompt = resolveTransformPrompt(kvGet('voice.transform.preset'), kvGet('voice.transform.prompt'));
        const cleaned = await transform(finalText, { model, prompt });
        if (cleaned) finalText = cleaned;
      } catch (err) {
        console.warn('[global-capture] OpenRouter cleanup failed, using raw transcript:', err);
        toast('AI cleanup failed — used the raw transcript.', 'warn');
      }
    }

    // Route the transcript — C-10b: pass focused-pane opts when available.
    setState('routing');
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `npx vitest run packages/voice-core/src/global-capture.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /Users/aisigma/projects/SigmaLink add app/packages/voice-core/src/global-capture.ts app/packages/voice-core/src/global-capture.test.ts
git -C /Users/aisigma/projects/SigmaLink commit -m "feat(voice-core): OpenRouter cleanup seam with raw-passthrough on failure (ADR-007)"
```

---

## Task A5: Export the new engine symbols

**Files:** Modify `packages/voice-core/src/index.ts` (after the cloud-STT exports, ~81)

- [ ] **Step 1: Implement** — add:
```ts
// ── OpenRouter transform engine (ADR-007) ──────────────────────────────────
export {
  buildOpenRouterTransform, LlmKeyMissingError, resolveTransformPrompt, TRANSFORM_PRESETS,
} from './openrouter-llm-engine.js';
export type { OpenRouterTransformDeps, TransformFn, TransformPresetId } from './openrouter-llm-engine.js';
```

- [ ] **Step 2: Typecheck the package**

Run: `cd /Users/aisigma/projects/SigmaLink/app && pnpm --filter @sigmalink/voice-core typecheck`
Expected: PASS (no TS errors).

- [ ] **Step 3: Run the FULL voice-core suite** (shared with SigmaLink — must stay green)

Run: `cd /Users/aisigma/projects/SigmaLink/app && npx vitest run packages/voice-core`
Expected: PASS (all).

- [ ] **Step 4: Commit + note the SHA for the pin bump**

```bash
git -C /Users/aisigma/projects/SigmaLink add app/packages/voice-core/src/index.ts
git -C /Users/aisigma/projects/SigmaLink commit -m "feat(voice-core): export OpenRouter transform API (ADR-007)"
git -C /Users/aisigma/projects/SigmaLink rev-parse HEAD   # record this SHA for Phase C
```

---

# PHASE B — App shell (in this repo: SigmaVoice)

## Task B1: Encrypted secret store (Electron-agnostic, injectable backend)

**Files:**
- Create: `src/secret-store.ts`
- Test: `src/secret-store.test.ts`

- [ ] **Step 1: Write failing tests** — `src/secret-store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSecretStore, type SafeStorageLike } from './secret-store.ts';

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sv-secret-')), 'secrets.json');
}

/** Fake "encrypting" backend: reversible XOR-ish (not real crypto — just proves the path). */
function encBackend(available = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(`ENC:${s}`, 'utf8'),
    decryptString: (b) => b.toString('utf8').replace(/^ENC:/, ''),
  };
}

test('set/get roundtrip with an encrypting backend', () => {
  const store = createSecretStore({ backend: encBackend(true), filePath: tmpFile() });
  store.setSecret('provider.openrouter.apiKey', 'or-123');
  assert.equal(store.getSecret('provider.openrouter.apiKey'), 'or-123');
  assert.equal(store.hasSecret('provider.openrouter.apiKey'), true);
});

test('persists across instances (same file)', () => {
  const file = tmpFile();
  createSecretStore({ backend: encBackend(true), filePath: file }).setSecret('k', 'v');
  const reopened = createSecretStore({ backend: encBackend(true), filePath: file });
  assert.equal(reopened.getSecret('k'), 'v');
});

test('clearSecret removes the key', () => {
  const store = createSecretStore({ backend: encBackend(true), filePath: tmpFile() });
  store.setSecret('k', 'v');
  store.clearSecret('k');
  assert.equal(store.getSecret('k'), null);
  assert.equal(store.hasSecret('k'), false);
});

test('falls back to base64 (unencrypted) when encryption is unavailable', () => {
  const store = createSecretStore({ backend: encBackend(false), filePath: tmpFile() });
  store.setSecret('k', 'plain');
  assert.equal(store.getSecret('k'), 'plain');
  assert.equal(store.isEncrypted(), false);
});

test('getSecret returns null for a missing key', () => {
  assert.equal(createSecretStore({ backend: encBackend(true), filePath: tmpFile() }).getSecret('nope'), null);
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm test`
Expected: FAIL — `./secret-store.ts` does not exist.

- [ ] **Step 3: Implement** — `src/secret-store.ts`:

```ts
// SigmaVoice — encrypted secret store (ADR-007).
//
// Stores secrets (the OpenRouter API key) encrypted at rest via an injected
// Electron-`safeStorage`-shaped backend. Electron is NOT imported here so this
// module is unit-testable under `node --test` — main.ts injects `safeStorage`.
// When OS encryption is unavailable, degrades to base64 (clearly flagged).

import fs from 'node:fs';
import path from 'node:path';

/** The subset of Electron's `safeStorage` we depend on. */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export interface SecretStore {
  getSecret(name: string): string | null;
  setSecret(name: string, value: string): void;
  hasSecret(name: string): boolean;
  clearSecret(name: string): void;
  /** True when secrets are OS-encrypted; false when using the base64 fallback. */
  isEncrypted(): boolean;
}

// Stored value prefixes: 'enc:' = base64 of safeStorage ciphertext; 'b64:' = base64 plaintext.
export function createSecretStore(opts: { backend: SafeStorageLike; filePath: string }): SecretStore {
  const { backend, filePath } = opts;
  const encrypted = (() => { try { return backend.isEncryptionAvailable(); } catch { return false; } })();
  let data: Record<string, string> = {};

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string') data[k] = v;
      }
    }
  } catch { data = {}; }

  function persist(): void {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, filePath);
    } catch { /* non-fatal */ }
  }

  function encode(plaintext: string): string {
    if (encrypted) {
      try { return `enc:${backend.encryptString(plaintext).toString('base64')}`; } catch { /* fall through */ }
    }
    return `b64:${Buffer.from(plaintext, 'utf8').toString('base64')}`;
  }

  function decode(stored: string): string | null {
    try {
      if (stored.startsWith('enc:')) return backend.decryptString(Buffer.from(stored.slice(4), 'base64'));
      if (stored.startsWith('b64:')) return Buffer.from(stored.slice(4), 'base64').toString('utf8');
    } catch { return null; }
    return null;
  }

  return {
    getSecret: (name) => (name in data ? decode(data[name]) : null),
    setSecret: (name, value) => { data[name] = encode(value); persist(); },
    hasSecret: (name) => name in data,
    clearSecret: (name) => { if (name in data) { delete data[name]; persist(); } },
    isEncrypted: () => encrypted,
  };
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `pnpm test`
Expected: PASS (new tests + all existing).

- [ ] **Step 5: Commit**

```bash
git add src/secret-store.ts src/secret-store.test.ts
git commit -m "feat: encrypted secret store for the OpenRouter key (ADR-007)"
```

---

## Task B2: Config validation + persistence helpers

**Files:**
- Create: `src/cloud-config.ts`
- Test: `src/cloud-config.test.ts`

- [ ] **Step 1: Write failing tests** — `src/cloud-config.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getRemoteSttConfig, setRemoteSttConfig, getTransformConfig, setTransformConfig,
} from './cloud-config.ts';
import type { KvStore } from './kv-store.ts';

function fakeKv(seed?: Record<string, string>): KvStore {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: (k) => (map.has(k) ? map.get(k)! : null), set: (k, v) => { map.set(k, v); } };
}

test('setRemoteSttConfig enabled writes mode + trimmed url/model/key', () => {
  const kv = fakeKv();
  const r = setRemoteSttConfig(kv, { enabled: true, baseUrl: '  http://192.168.1.5:8000/v1 ', model: ' large-v3 ', apiKey: ' k ' });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.transcriptionMode'), 'openai-whisper-api');
  assert.equal(kv.get('voice.stt.openai-whisper-api.baseUrl'), 'http://192.168.1.5:8000/v1');
  assert.equal(kv.get('voice.stt.openai-whisper-api.model'), 'large-v3');
  assert.equal(kv.get('voice.stt.openai-whisper-api.apiKey'), 'k');
});

test('setRemoteSttConfig rejects an enabled config with a bad url', () => {
  const kv = fakeKv();
  const r = setRemoteSttConfig(kv, { enabled: true, baseUrl: 'not-a-url', model: '', apiKey: '' });
  assert.equal(r.ok, false);
  assert.match(r.error!, /url/i);
  assert.equal(kv.get('voice.transcriptionMode'), null); // nothing persisted on reject
});

test('setRemoteSttConfig disabled reverts mode to local (keeps url for next time)', () => {
  const kv = fakeKv({ 'voice.transcriptionMode': 'openai-whisper-api', 'voice.stt.openai-whisper-api.baseUrl': 'http://x/v1' });
  const r = setRemoteSttConfig(kv, { enabled: false, baseUrl: 'http://x/v1', model: '', apiKey: '' });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.transcriptionMode'), 'local');
  assert.equal(kv.get('voice.stt.openai-whisper-api.baseUrl'), 'http://x/v1');
});

test('getRemoteSttConfig reflects persisted values + enabled flag', () => {
  const kv = fakeKv({ 'voice.transcriptionMode': 'openai-whisper-api', 'voice.stt.openai-whisper-api.baseUrl': 'http://x/v1', 'voice.stt.openai-whisper-api.model': 'm' });
  assert.deepEqual(getRemoteSttConfig(kv), { enabled: true, baseUrl: 'http://x/v1', model: 'm' });
});

test('setTransformConfig validates mode + preset and caps the custom prompt', () => {
  const kv = fakeKv();
  const r = setTransformConfig(kv, { mode: 'openrouter', model: 'google/gemini-2.5-flash-lite', preset: 'custom', prompt: 'x'.repeat(5000) });
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.transform.mode'), 'openrouter');
  assert.equal(kv.get('voice.transform.preset'), 'custom');
  assert.equal((kv.get('voice.transform.prompt') ?? '').length, 2000); // capped
});

test('setTransformConfig rejects an unknown mode', () => {
  const r = setTransformConfig(fakeKv(), { mode: 'evil', model: 'm', preset: 'punctuate', prompt: '' });
  assert.equal(r.ok, false);
});

test('getTransformConfig defaults to off + flash-lite + punctuate', () => {
  assert.deepEqual(getTransformConfig(fakeKv()), {
    mode: 'off', model: 'google/gemini-2.5-flash-lite', preset: 'punctuate', prompt: '',
  });
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `pnpm test` → FAIL (`./cloud-config.ts` missing).

- [ ] **Step 3: Implement** — `src/cloud-config.ts`:

```ts
// SigmaVoice — remote-STT + transform config read/validate/persist (ADR-007).
//
// Pure logic over the KV store (no Electron). The OpenRouter API key is NOT here —
// it lives in the encrypted secret-store (src/secret-store.ts). The STT key is a
// per-server token kept in KV alongside the URL (matches the existing voice.stt.* keys).

import type { KvStore } from './kv-store.ts';

const STT_MODE = 'voice.transcriptionMode';
const STT_BASE = 'voice.stt.openai-whisper-api.baseUrl';
const STT_MODEL = 'voice.stt.openai-whisper-api.model';
const STT_KEY = 'voice.stt.openai-whisper-api.apiKey';
const TF_MODE = 'voice.transform.mode';
const TF_MODEL = 'voice.transform.model';
const TF_PRESET = 'voice.transform.preset';
const TF_PROMPT = 'voice.transform.prompt';

const PROMPT_CAP = 2000;
const VALID_PRESETS = new Set(['punctuate', 'fillers', 'email', 'custom']);
const DEFAULT_TF_MODEL = 'google/gemini-2.5-flash-lite';

export interface RemoteSttConfig { enabled: boolean; baseUrl: string; model: string; }
export interface RemoteSttInput { enabled: boolean; baseUrl: string; model: string; apiKey: string; }
export interface TransformConfig { mode: 'off' | 'openrouter'; model: string; preset: string; prompt: string; }
export type SaveResult = { ok: true } | { ok: false; error: string };

function isHttpUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

export function getRemoteSttConfig(kv: KvStore): RemoteSttConfig {
  return {
    enabled: kv.get(STT_MODE) === 'openai-whisper-api',
    baseUrl: kv.get(STT_BASE) ?? '',
    model: kv.get(STT_MODEL) ?? '',
  };
}

export function setRemoteSttConfig(kv: KvStore, input: RemoteSttInput): SaveResult {
  const baseUrl = (input.baseUrl ?? '').trim();
  const model = (input.model ?? '').trim();
  const apiKey = (input.apiKey ?? '').trim();
  if (input.enabled) {
    if (!isHttpUrl(baseUrl)) return { ok: false, error: 'Enter a valid http(s):// endpoint URL.' };
    kv.set(STT_BASE, baseUrl);
    kv.set(STT_MODEL, model);
    kv.set(STT_KEY, apiKey); // may be '' for keyless LAN servers
    kv.set(STT_MODE, 'openai-whisper-api');
  } else {
    // Keep the URL/model so re-enabling is one click; just flip the active mode back to local.
    kv.set(STT_MODE, 'local');
  }
  return { ok: true };
}

export function getTransformConfig(kv: KvStore): TransformConfig {
  const mode = kv.get(TF_MODE) === 'openrouter' ? 'openrouter' : 'off';
  const preset = kv.get(TF_PRESET);
  return {
    mode,
    model: kv.get(TF_MODEL) ?? DEFAULT_TF_MODEL,
    preset: preset && VALID_PRESETS.has(preset) ? preset : 'punctuate',
    prompt: kv.get(TF_PROMPT) ?? '',
  };
}

export function setTransformConfig(
  kv: KvStore,
  input: { mode: string; model: string; preset: string; prompt: string },
): SaveResult {
  if (input.mode !== 'off' && input.mode !== 'openrouter') return { ok: false, error: 'Invalid cleanup mode.' };
  const preset = VALID_PRESETS.has(input.preset) ? input.preset : 'punctuate';
  const model = (input.model ?? '').trim() || DEFAULT_TF_MODEL;
  const prompt = (input.prompt ?? '').slice(0, PROMPT_CAP);
  kv.set(TF_MODE, input.mode);
  kv.set(TF_MODEL, model);
  kv.set(TF_PRESET, preset);
  kv.set(TF_PROMPT, prompt);
  return { ok: true };
}
```

- [ ] **Step 4: Run, verify PASS** → `pnpm test`

- [ ] **Step 5: Commit**

```bash
git add src/cloud-config.ts src/cloud-config.test.ts
git commit -m "feat: remote-STT + transform config helpers with validation (ADR-007)"
```

---

## Task B3: IPC handlers (`src/llm-ipc.ts`)

**Files:** Create `src/llm-ipc.ts` (no unit test — thin Electron glue over the tested B1/B2 logic; verified via typecheck + smoke).

- [ ] **Step 1: Implement** — `src/llm-ipc.ts`:

```ts
// SigmaVoice — Cloud/LLM IPC (ADR-007): OpenRouter key (encrypted) + remote-STT &
// transform config. Mirrors src/model-ipc.ts — ipcMain + deps injected.

import type { IpcMain } from 'electron';
import type { KvStore } from './kv-store';
import type { SecretStore } from './secret-store';
import { getRemoteSttConfig, setRemoteSttConfig, getTransformConfig, setTransformConfig } from './cloud-config';

const OPENROUTER_KEY_ID = 'provider.openrouter.apiKey';

export function registerLlmIpc(
  ipcMain: IpcMain,
  deps: { kv: () => KvStore | null; secrets: () => SecretStore | null },
): void {
  // ── OpenRouter API key (encrypted; never echoed back) ──
  ipcMain.handle('bv:setOpenRouterKey', (_e, key: unknown) => {
    const s = deps.secrets(); if (!s) return { ok: false };
    const k = typeof key === 'string' ? key.trim() : '';
    if (!k) return { ok: false, error: 'Empty key' };
    s.setSecret(OPENROUTER_KEY_ID, k);
    return { ok: true, encrypted: s.isEncrypted() };
  });
  ipcMain.handle('bv:hasOpenRouterKey', () => {
    const s = deps.secrets();
    return { hasKey: !!s?.hasSecret(OPENROUTER_KEY_ID), encrypted: !!s?.isEncrypted() };
  });
  ipcMain.handle('bv:clearOpenRouterKey', () => {
    deps.secrets()?.clearSecret(OPENROUTER_KEY_ID); return { ok: true };
  });

  // ── Remote STT config ──
  ipcMain.handle('bv:getRemoteSttConfig', () => { const kv = deps.kv(); return kv ? getRemoteSttConfig(kv) : null; });
  ipcMain.handle('bv:setRemoteSttConfig', (_e, cfg: any) => {
    const kv = deps.kv(); if (!kv) return { ok: false, error: 'No store' };
    return setRemoteSttConfig(kv, {
      enabled: !!cfg?.enabled, baseUrl: String(cfg?.baseUrl ?? ''),
      model: String(cfg?.model ?? ''), apiKey: String(cfg?.apiKey ?? ''),
    });
  });

  // ── Transform (cleanup) config ──
  ipcMain.handle('bv:getTransformConfig', () => { const kv = deps.kv(); return kv ? getTransformConfig(kv) : null; });
  ipcMain.handle('bv:setTransformConfig', (_e, cfg: any) => {
    const kv = deps.kv(); if (!kv) return { ok: false, error: 'No store' };
    return setTransformConfig(kv, {
      mode: String(cfg?.mode ?? 'off'), model: String(cfg?.model ?? ''),
      preset: String(cfg?.preset ?? 'punctuate'), prompt: String(cfg?.prompt ?? ''),
    });
  });
}
```

- [ ] **Step 2: Typecheck** → `pnpm typecheck` → Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/llm-ipc.ts
git commit -m "feat: Cloud/LLM IPC handlers (OpenRouter key + STT/transform config) (ADR-007)"
```

---

## Task B4: Wire main.ts — secret store, transform dep, IPC, prewarm guard

**Files:** Modify `src/main.ts`

- [ ] **Step 1: Add imports** (with the other electron + local imports, ~16 & ~41):
```ts
import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Notification, safeStorage, Tray } from 'electron';
// ...
import { createSecretStore, type SecretStore, type SafeStorageLike } from './secret-store';
import { registerLlmIpc } from './llm-ipc';
```

- [ ] **Step 2: Add a `secrets` global** (near `let kv` ~52):
```ts
let secrets: SecretStore | null = null;
```

- [ ] **Step 3: Construct the secret store in `whenReady()`** (right after `kv = store;` ~393):
```ts
    // ADR-007 — encrypted secret store for the OpenRouter API key. safeStorage
    // satisfies SafeStorageLike (isEncryptionAvailable/encryptString/decryptString).
    secrets = createSecretStore({
      backend: safeStorage as unknown as SafeStorageLike,
      filePath: path.join(app.getPath('userData'), 'sigmavoice-secrets.json'),
    });
```

- [ ] **Step 4: Inject `transformDeps` into the controller** — in the `buildGlobalCaptureController({...})` options (~417, alongside `clipboard`):
```ts
      clipboard: {
        writeText: (text: string) => clipboard.writeText(text),
      },
      // ADR-007 — OpenRouter cleanup reads the key from the ENCRYPTED secret store.
      transformDeps: { getApiKey: () => secrets?.getSecret('provider.openrouter.apiKey') ?? null },
```

- [ ] **Step 5: Register the new IPC** — inside `registerIpc()`, after `registerModelIpc(...)` (~330):
```ts
  // Cloud/LLM IPC (ADR-007): OpenRouter key + remote-STT + transform config.
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => secrets });
```

- [ ] **Step 6: Guard prewarm to local mode** — `prewarmModel()` should not fire a throwaway local transcribe when remote STT is active (it would needlessly hit the LAN box or just waste a local load). After the `st.state !== 'idle'` guard (~353) add:
```ts
    // Don't prewarm the local engine when a remote STT backend is active.
    if (kv?.get('voice.transcriptionMode') === 'openai-whisper-api') return;
```

- [ ] **Step 7: Typecheck + build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS; `sigma-dist/main.js` emitted.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire secret store + transform dep + Cloud IPC into main (ADR-007)"
```

---

## Task B5: Expose new channels in preload

**Files:** Modify `src/preload.ts`

- [ ] **Step 1: Implement** — add to the `exposeInMainWorld('bridgeVoice', { … })` object:
```ts
  // ADR-007 — Cloud/LLM
  setOpenRouterKey: (key: string) => ipcRenderer.invoke('bv:setOpenRouterKey', key),
  hasOpenRouterKey: () => ipcRenderer.invoke('bv:hasOpenRouterKey'),
  clearOpenRouterKey: () => ipcRenderer.invoke('bv:clearOpenRouterKey'),
  getRemoteSttConfig: () => ipcRenderer.invoke('bv:getRemoteSttConfig'),
  setRemoteSttConfig: (cfg: unknown) => ipcRenderer.invoke('bv:setRemoteSttConfig', cfg),
  getTransformConfig: () => ipcRenderer.invoke('bv:getTransformConfig'),
  setTransformConfig: (cfg: unknown) => ipcRenderer.invoke('bv:setTransformConfig', cfg),
```

- [ ] **Step 2: Typecheck + build** → `pnpm typecheck && pnpm build` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/preload.ts
git commit -m "feat: expose Cloud/LLM bridge channels in preload (ADR-007)"
```

---

## Task B6: Settings UI — "Cloud" rail tab + pane

**Files:** Modify `renderer/settings.html` (no renderer unit tests in this codebase — verify via build + smoke).

- [ ] **Step 1: Add a rail tab** — after the "Test" rail button (`settings.html:83`), add:
```html
      <button class="rail-item" role="tab" aria-selected="false"
              aria-controls="pane-cloud" id="rail-cloud" data-panel="cloud" tabindex="-1">
        <span class="rail-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
            <path d="M6 15h8a3 3 0 0 0 .4-5.97A4.5 4.5 0 0 0 6 8.5 3.25 3.25 0 0 0 6 15z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="rail-label">Cloud</span>
      </button>
```

- [ ] **Step 2: Add the pane** — after the Test `</section>` (`settings.html:323`), before `</main>`:
```html
      <!-- ── Pane: Cloud (ADR-007) ───────────────────────────── -->
      <section class="pane" id="pane-cloud" role="tabpanel" aria-labelledby="rail-cloud">

        <p class="section-header">Remote transcription</p>
        <div class="card">
          <div class="row">
            <div>
              <div class="row-label">Use a remote Whisper server</div>
              <div class="row-sublabel">Send audio to an OpenAI-compatible endpoint (e.g. your own GPU box). Falls back to on-device Whisper if it's unreachable.</div>
            </div>
            <label class="toggle" aria-label="Use a remote Whisper server">
              <input type="checkbox" id="stt-remote-toggle" role="switch" aria-checked="false" />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="stt-remote-fields" hidden>
            <div class="row row-top">
              <div><div class="row-label">Endpoint URL</div><div class="row-sublabel">e.g. http://192.168.1.50:8000/v1</div></div>
              <input type="text" id="stt-url" class="text-input" placeholder="http://host:port/v1" spellcheck="false" />
            </div>
            <div class="row row-top">
              <div><div class="row-label">Model</div><div class="row-sublabel">Server-side id, e.g. Systran/faster-whisper-large-v3</div></div>
              <input type="text" id="stt-model" class="text-input" placeholder="whisper-1" spellcheck="false" />
            </div>
            <div class="row row-top">
              <div><div class="row-label">API key (optional)</div><div class="row-sublabel">Leave blank for a keyless LAN server.</div></div>
              <input type="password" id="stt-key" class="text-input" placeholder="optional" autocomplete="off" />
            </div>
            <p class="row-sublabel cloud-warn">⚠️ Audio leaves this Mac to the address you set.</p>
            <div class="row flex-end"><button id="stt-save-btn" class="btn btn-primary">Save</button></div>
          </div>
        </div>

        <p class="section-header">AI cleanup (OpenRouter)</p>
        <div class="card">
          <div class="row">
            <div>
              <div class="row-label">Clean up transcripts with an LLM</div>
              <div class="row-sublabel">After dictation, rewrite the text with any OpenRouter model. On error, your raw transcript is used.</div>
            </div>
            <label class="toggle" aria-label="Clean up transcripts with an LLM">
              <input type="checkbox" id="tf-toggle" role="switch" aria-checked="false" />
              <span class="toggle-track"></span>
            </label>
          </div>
          <div id="tf-fields" hidden>
            <div class="row row-top">
              <div><div class="row-label">OpenRouter API key</div><div class="row-sublabel" id="tf-key-status">No key set.</div></div>
              <input type="password" id="tf-key" class="text-input" placeholder="sk-or-…" autocomplete="off" />
            </div>
            <div class="row row-top">
              <div><div class="row-label">Model</div><div class="row-sublabel">~$3/mo heavy use on Flash Lite; a free model is available.</div></div>
              <select id="tf-model" class="text-input">
                <option value="google/gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (cheap, default)</option>
                <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (free, rate-limited)</option>
                <option value="openai/gpt-4o-mini">GPT-4o-mini</option>
                <option value="anthropic/claude-sonnet-4.5">Claude Sonnet 4.5 (premium)</option>
              </select>
            </div>
            <div class="row row-top">
              <div><div class="row-label">Transform</div><div class="row-sublabel">What the model should do to your text.</div></div>
              <select id="tf-preset" class="text-input">
                <option value="punctuate">Punctuate &amp; capitalize</option>
                <option value="fillers">Remove filler words</option>
                <option value="email">Make it an email</option>
                <option value="custom">Custom…</option>
              </select>
            </div>
            <div class="row row-top" id="tf-prompt-row" hidden>
              <div><div class="row-label">Custom prompt</div></div>
              <textarea id="tf-prompt" class="text-input" rows="3" placeholder="Describe how to transform the text…"></textarea>
            </div>
            <p class="row-sublabel cloud-warn">⚠️ Transcript text leaves this Mac to OpenRouter.</p>
            <div class="row flex-end"><button id="tf-save-btn" class="btn btn-primary">Save</button></div>
          </div>
        </div>

      </section>
```

- [ ] **Step 2b: Minimal CSS** — append to `renderer/settings.css` (match the token system; values are safe fallbacks):
```css
.text-input { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--hairline, rgba(128,128,128,.3)); background: var(--field-bg, rgba(128,128,128,.08)); color: inherit; min-width: 220px; }
.cloud-warn { color: var(--warn, #b8860b); margin-top: 6px; }
```

- [ ] **Step 3: Build, verify the markup compiles into the bundle** → `pnpm build` (esbuild copies renderer as-is; this just confirms no breakage).

- [ ] **Step 4: Commit**

```bash
git add renderer/settings.html renderer/settings.css
git commit -m "feat(ui): Cloud settings pane — remote STT + OpenRouter cleanup (ADR-007)"
```

---

## Task B7: Settings UI — wire the Cloud pane (`renderer/js/cloud.js`)

**Files:** Create `renderer/js/cloud.js`; modify `renderer/js/settings.js`.

- [ ] **Step 1: Implement** — `renderer/js/cloud.js`:
```js
// SigmaVoice — Cloud pane (ADR-007): remote STT + OpenRouter cleanup config.
import { bv, hasMethod, safeCall } from './settings.js';
import { showToast } from './toast.js';

function $(id) { return document.getElementById(id); }
function show(el, on) { if (el) el.hidden = !on; }

async function loadRemoteStt() {
  const cfg = await safeCall('getRemoteSttConfig');
  const toggle = $('stt-remote-toggle');
  if (cfg && toggle) {
    toggle.checked = !!cfg.enabled; toggle.setAttribute('aria-checked', String(!!cfg.enabled));
    $('stt-url').value = cfg.baseUrl ?? ''; $('stt-model').value = cfg.model ?? '';
    show($('stt-remote-fields'), !!cfg.enabled);
  }
}

async function saveRemoteStt() {
  const res = await safeCall('setRemoteSttConfig', {
    enabled: $('stt-remote-toggle').checked, baseUrl: $('stt-url').value,
    model: $('stt-model').value, apiKey: $('stt-key').value,
  });
  if (res && res.ok === false) showToast(res.error || 'Could not save', 'error');
  else { showToast('Remote transcription saved'); $('stt-key').value = ''; }
}

async function loadTransform() {
  const cfg = await safeCall('getTransformConfig');
  if (cfg) {
    const on = cfg.mode === 'openrouter';
    const toggle = $('tf-toggle');
    if (toggle) { toggle.checked = on; toggle.setAttribute('aria-checked', String(on)); }
    show($('tf-fields'), on);
    $('tf-model').value = cfg.model; $('tf-preset').value = cfg.preset;
    $('tf-prompt').value = cfg.prompt ?? '';
    show($('tf-prompt-row'), cfg.preset === 'custom');
  }
  const keyState = await safeCall('hasOpenRouterKey');
  const status = $('tf-key-status');
  if (status && keyState) {
    status.textContent = keyState.hasKey
      ? (keyState.encrypted ? 'Key set ✓ (encrypted)' : 'Key set ✓ (stored unencrypted — no OS keyring)')
      : 'No key set.';
  }
}

async function saveTransform() {
  const newKey = $('tf-key').value.trim();
  if (newKey) {
    const kr = await safeCall('setOpenRouterKey', newKey);
    if (kr && kr.ok === false) { showToast('Could not store key', 'error'); return; }
    $('tf-key').value = '';
  }
  const res = await safeCall('setTransformConfig', {
    mode: $('tf-toggle').checked ? 'openrouter' : 'off', model: $('tf-model').value,
    preset: $('tf-preset').value, prompt: $('tf-prompt').value,
  });
  if (res && res.ok === false) showToast(res.error || 'Could not save', 'error');
  else showToast('AI cleanup saved');
  loadTransform();
}

export function initCloud() {
  $('stt-remote-toggle')?.addEventListener('change', (e) => show($('stt-remote-fields'), e.target.checked));
  $('stt-save-btn')?.addEventListener('click', saveRemoteStt);
  $('tf-toggle')?.addEventListener('change', (e) => show($('tf-fields'), e.target.checked));
  $('tf-preset')?.addEventListener('change', (e) => show($('tf-prompt-row'), e.target.value === 'custom'));
  $('tf-save-btn')?.addEventListener('click', saveTransform);
}

/** Lazy-load on pane activation (re-reads persisted config). */
export function loadCloud() { void loadRemoteStt(); void loadTransform(); }
```

- [ ] **Step 2: Register in `renderer/js/settings.js`** — three edits:

(a) import (after the `initTest` import ~34):
```js
import { initCloud, loadCloud } from './cloud.js';
```
(b) in `boot()` after `initTest();` (~63):
```js
  initCloud();
```
(c) in `onPaneActivate(panel)` (~53):
```js
  if (panel === 'cloud') loadCloud();
```

- [ ] **Step 3: Typecheck + build** → `pnpm typecheck && pnpm build` → PASS.

- [ ] **Step 4: Commit**

```bash
git add renderer/js/cloud.js renderer/js/settings.js
git commit -m "feat(ui): wire Cloud pane config (remote STT + OpenRouter key/cleanup) (ADR-007)"
```

---

# PHASE C — Integrate

## Task C1: Bump the submodule pin to the engine SHA

**Files:** `sigmalink` submodule pointer (this repo).

- [ ] **Step 1: Push the SigmaLink engine commits** (so CI can fetch them)
```bash
git -C /Users/aisigma/projects/SigmaLink push
```
- [ ] **Step 2: Update the pin in this repo to the SHA recorded in Task A5 Step 4**
```bash
git -C sigmalink fetch origin && git -C sigmalink checkout <ENGINE_SHA>
git add sigmalink
git commit -m "chore(submodule): bump voice-core to <ENGINE_SHA> — remote STT + OpenRouter cleanup (ADR-007)"
```
> If `sigmalink/` is not initialized in this checkout: `git submodule update --init --recursive` first.

## Task C2: Full gate + on-device smoke

- [ ] **Step 1: Gate in this repo (NOT a worktree — CLAUDE.md)**
```bash
pnpm install   # re-link the bumped engine
pnpm typecheck && pnpm test && pnpm build
```
Expected: typecheck clean; all `node:test` pass; `sigma-dist/{main.js,preload.cjs,hud-preload.cjs}` emitted.

- [ ] **Step 2: On-device smoke (manual — none of this is headless-verifiable)**
  - Start the 3060 server (`faster-whisper-server`/Speaches or whisper.cpp `whisper-server`) exposing `/v1/audio/transcriptions`.
  - Settings → Cloud → enable Remote transcription, paste `http://<box-ip>:<port>/v1` + model, Save. Dictate → confirm it transcribes via the box (check the server logs).
  - Stop the box → dictate again → confirm it **falls back to on-device Whisper** + the "used on-device Whisper" toast (requires a local model downloaded).
  - Settings → Cloud → enable AI cleanup, paste an OpenRouter key, pick "Make it an email", Save. Dictate a rough sentence → confirm it's reformatted.
  - Set a bad key OR disable network → dictate → confirm the **raw transcript still pastes** + "AI cleanup failed" toast.
  - Confirm `sigmavoice-secrets.json` under userData contains `enc:`-prefixed ciphertext (not the raw key).

- [ ] **Step 3: Update ROADMAP build-status + mark FE-15/FE-16 done; commit**
```bash
git add docs/03-plan/ROADMAP.md
git commit -m "docs(roadmap): remote STT + OpenRouter cleanup landed (ADR-007 / FE-15/FE-16)"
```

---

## Self-review notes (author)

- **Spec coverage:** Part 1 (configurable URL + key-optional + fallback) → A1/A2; Part 2 (engine + seam) → A3/A4/A5; encrypted key → B1; validation → B2; IPC → B3; main wiring → B4; preload → B5; UI → B6/B7; submodule + smoke → C1/C2. All spec sections mapped.
- **Type consistency:** `transformDeps: { fetchFn?; getApiKey }` is identical in A4 (engine), B4 (injection), and `OpenRouterTransformDeps` (A3). KV keys match the table in every task. `SafeStorageLike` / `SecretStore` names consistent across B1/B3/B4. `setRemoteSttConfig`/`getRemoteSttConfig`/`setTransformConfig`/`getTransformConfig` names match across B2/B3/B7.
- **Framework split honored:** vitest in Phase A; `node:test` in Phase B.
- **Known soft spots for the implementer:** A2 & A4 tests are described against the existing `global-capture.test.ts` harness (read that file first; write concrete assertions, do not commit comment stubs). Renderer CSS tokens (B6 Step 2b) should be reconciled with the real variables in `settings.css`.
