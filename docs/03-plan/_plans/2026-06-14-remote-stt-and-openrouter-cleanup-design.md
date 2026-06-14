# Remote STT (self-hosted/LAN) + OpenRouter LLM cleanup · design spec

**Approved-in-principle 2026-06-14 (operator).** Authorized by **ADR-007** (ROADMAP) — opt-in, off by
default. Branch (suggested): `feat/remote-stt-and-llm-cleanup` off `main`. Engine work lands **upstream in
SigmaLink `voice-core`** then a submodule pin bump (ADR-003); app-shell work lands here. Evidence: two
research agents, 2026-06-14 (OpenRouter integration map + cost model) — summarized inline below.

## Goal

Two opt-in, off-by-default capabilities:

1. **Remote STT** — point SigmaVoice at an **OpenAI-compatible** transcription endpoint on the operator's
   own RTX 3060 box (LAN), so dictation transcribes on the GPU (e.g. `large-v3`) instead of the local CPU
   Whisper. Auto-fall back to on-device Whisper if the box is unreachable.
2. **OpenRouter LLM cleanup** — after transcription, optionally run the text through any OpenRouter model
   to fix punctuation/casing/fillers or apply a transform prompt ("make this an email"). On any failure,
   pass the **raw transcript** through unchanged.

Both default **OFF**; both are explicit Settings toggles; neither needs an account (bring-your-own
endpoint URL / API key).

## Key correction (why this is small, not a from-scratch build)

- **Ollama and OpenRouter cannot do STT** — both are LLM (chat) endpoints, no `/audio/transcriptions`.
  Self-hosted Whisper on the 3060 is served by `faster-whisper-server` ("Speaches") or whisper.cpp's
  `whisper-server`, both of which expose the OpenAI-compatible `POST /v1/audio/transcriptions`.
- **BridgeVoice/SigmaLink never actually wired OpenRouter** (verified: inert `ModelTransport='openrouter'`
  enum, zero `git log --grep=openrouter`). We build it fresh — but `voice-core`'s `cloud-stt-engine.ts`
  (real HTTP+Bearer, injectable `fetch`, typed errors) is the exact template to clone.
- `voice-core` **already** has: the OpenAI-compatible STT engine, `voice.transcriptionMode` routing, the
  `encodeWav` PCM→WAV encoder, and a fallback-to-local pattern. The only gaps are a **configurable URL**,
  an **optional API key**, **remote-mode fallback wiring**, and a **new OpenRouter transform engine + seam**.

## Non-goals / deferred

- **Third-party cloud STT** (Groq / OpenAI audio upload) — out of scope per ADR-007 (case b deferred). The
  engine default URL stays `api.openai.com` for SigmaLink's sake, but **SigmaVoice's UI only accepts a
  self-hosted URL** and never silently uploads to a vendor.
- **Streaming (SSE)** for the LLM pass — start non-streaming (matches the whole codebase; nothing to copy).
- **A chat window / conversational UI** — the LLM home is the transcript transform pass only (operator choice).
- **Live audio-level / waveform** (ENG-5), Windows runtime (blocked on W-SV1), wake-word, accounts.
- **Auto-discovery of the LAN box** — the operator pastes the URL.

## Architecture

Engine boundary (CLAUDE.md / ADR-003): `voice-core` + natives are the shared single source of truth — edit
in `/Users/aisigma/projects/SigmaLink/app/packages/voice-core/`, commit in SigmaLink, then
`git -C sigmalink checkout <sha> && git add sigmalink && git commit` here. The submodule is **not checked
out in this worktree** — engine edits happen in the SigmaLink repo. (Ruflo sequential-use caveat applies:
don't run SigmaLink + SigmaVoice agents live at once.)

### A. Engine — Part 1: configurable remote STT  (SigmaLink `voice-core`)

**A1. `cloud-stt-engine.ts` — make the OpenAI engine endpoint-configurable + key-optional.**
Today `buildOpenAiSttEngine` hardcodes `https://api.openai.com/v1/audio/transcriptions`, `model:'whisper-1'`,
and throws `SttKeyMissingError` when no key (`cloud-stt-engine.ts:67-104`).
- Extend `CloudSttEngineDeps` with optional `getBaseUrl?: () => string | null` and
  `getModel?: () => string | null` (alongside the existing `getApiKey`).
- URL = `${baseUrl ?? 'https://api.openai.com/v1'}/audio/transcriptions`; trim a trailing `/v1`/`/` safely.
- `model` = `getModel() ?? 'whisper-1'`.
- **Auth optional:** only send `Authorization: Bearer …` when a key is present. Throw `SttKeyMissingError`
  **only** when there is *neither a key nor a base URL* (i.e. the default-cloud case still requires a key;
  a self-hosted URL does not).
- **Timeout:** wrap `fetchFn` in an `AbortController` (e.g. 30 s) so an offline box fails fast → fallback.
- **Response tolerance:** accept `{ text }` (OpenAI/whisper.cpp/faster-whisper default) and fall back to
  `verbose_json`'s shape if `text` is absent. Keep `segments: []` (servers vary).

**A2. `global-capture.ts` — wire config + add remote-mode fallback-to-local.**
- In `makeCloudDeps` (`global-capture.ts:521-524`) add `getBaseUrl: () => kvGet('voice.stt.openai-whisper-api.baseUrl')`
  and `getModel: () => kvGet('voice.stt.openai-whisper-api.model')`.
- The fallback branch (`global-capture.ts:558-582`) currently rescues only `gemini-cli`. **Generalize it** so
  an `openai-whisper-api` failure (network/timeout/non-OK) also falls back to local Whisper (when a local
  model is downloaded) and emits a toast ("Remote STT unreachable — used on-device Whisper"). A genuine
  `SttKeyMissingError` still surfaces its own toast (no fallback needed).
- No app-shell dep change needed for Part 1 — config is read from KV exactly like the existing keys.

### B. Engine — Part 2: OpenRouter transform  (SigmaLink `voice-core`)

**B1. New `openrouter-llm-engine.ts`** (clone the `cloud-stt-engine.ts` shape):
```ts
export interface OpenRouterTransformDeps {
  fetchFn?: typeof fetch;
  getApiKey: () => string | null;   // injected — key lives encrypted in the app shell, not KV
}
export function buildOpenRouterTransform(deps: OpenRouterTransformDeps) {
  return async function transform(text: string, opts: { model: string; prompt: string }): Promise<string> {
    const apiKey = deps.getApiKey();
    if (!apiKey) throw new LlmKeyMissingError('openrouter');
    const res = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
                 'HTTP-Referer': 'https://sigmavoice.app', 'X-Title': 'SigmaVoice' },
      body: JSON.stringify({ model: opts.model, temperature: 0.2,
        messages: [{ role: 'system', content: opts.prompt }, { role: 'user', content: text }] }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text().catch(()=> '')}`);
    const json = await res.json();
    return (json.choices?.[0]?.message?.content ?? '').trim();
  };
}
```
Add a typed `LlmKeyMissingError`. Keep `fetchFn` injectable for tests. Non-streaming.

**B2. `global-capture.ts` — cleanup seam.** Between `normalizeTranscript` (`:596`) and `setState('routing')`
(`:600`), add:
- A new optional dep on `GlobalCaptureDeps` (mirror `cloudSttEngineDeps` at `:177`):
  `transformDeps?: { fetchFn?: typeof fetch; getApiKey: () => string | null }` (the app shell injects
  `getApiKey` reading from encrypted storage).
- Gate on `kvGet('voice.transform.mode') === 'openrouter'` **and** `transformDeps` present. Read
  `voice.transform.model` (default `google/gemini-2.5-flash-lite`) and `voice.transform.prompt` (resolved
  from a preset id or a custom string).
- Call `buildOpenRouterTransform(...)(finalText, {model, prompt})` inside try/catch; on success replace
  `finalText`, **on any error keep `finalText` (raw passthrough)** + a one-time warn toast. The dictation is
  never lost.

**B3. `index.ts`** — export `buildOpenRouterTransform`, `OpenRouterTransformDeps`, `LlmKeyMissingError`
next to the cloud-STT exports (`index.ts:79-81`).

### C. App shell — encrypted key + IPC  (this repo)

**C1. `src/secret-store.ts` (new).** SigmaVoice can't import SigmaLink's main-process `CredentialStore`
(it only consumes `voice-core`), so add a tiny wrapper over Electron `safeStorage`: `setSecret(name, value)`
→ encrypt → write ciphertext to `<userData>/sigmavoice-secrets.json`; `getSecret(name)` → decrypt;
`hasSecret`/`clearSecret`. Guard `safeStorage.isEncryptionAvailable()` (headless/CI → base64 fallback +
a "not encrypted" flag, mirroring SigmaLink's `storage.ts:41` `b64:` fallback). Key id: `provider.openrouter.apiKey`.

**C2. `src/llm-ipc.ts` (new, mirror `model-ipc.ts`).** Handlers:
- `bv:setOpenRouterKey(key)` / `bv:hasOpenRouterKey()` / `bv:clearOpenRouterKey()` → `secret-store`.
- `bv:getTransformConfig()` / `bv:setTransformConfig({mode,model,preset,prompt})` → KV (validated).
- `bv:getRemoteSttConfig()` / `bv:setRemoteSttConfig({enabled,baseUrl,model,apiKey})` → KV
  (`voice.transcriptionMode`, `voice.stt.openai-whisper-api.{baseUrl,model,apiKey}`); validate the URL is a
  well-formed `http(s)://` host (reject empty when enabling).

**C3. `src/main.ts` — inject the transform key.** In `buildGlobalCaptureController({...})` (`main.ts:395`)
add `transformDeps: { getApiKey: () => getSecret('provider.openrouter.apiKey') }`. Register the new IPC in
`registerIpc()` (`main.ts:451`). Re-`prewarmModel()` semantics unaffected (cloud modes skip prewarm — guard
prewarm to local mode only).

**C4. `src/preload.ts`** — expose the new `bv:*` channels on `window.bridgeVoice`.

**C5. Validation helpers** in `src/settings-data.ts` (or a sibling) — bound + sanitize the transform prompt
(reuse the dictionary `stripControlChars` + length-cap pattern), validate the STT URL, whitelist `mode`/`preset`.

### D. Renderer — Settings UI  (this repo)

New "**Transcription**" + "**Cleanup (AI)**" sections (reuse the card/chip/disabled-until-valid patterns
from Phase 1 + `renderer/js/capture.js`, `dictionary.js`). Add `renderer/js/cloud.js` (one module, <500 lines).
- **Transcription backend:** segmented control **On-device** (default) / **Remote endpoint**. Remote reveals:
  endpoint URL, model name (placeholder `Systran/faster-whisper-large-v3` or `whisper-1`), optional API key,
  a **Test** button (transcribes a short silence buffer or pings the URL). A loud "**audio leaves this Mac to
  the address you set**" note. Off-device ⇒ amber chip.
- **Cleanup (AI):** toggle **Off** (default) / **OpenRouter**. Reveals: API-key field (write-only; shows
  "key set ✓", never echoes it back — it's encrypted), model picker (free-text + a short curated list:
  `google/gemini-2.5-flash-lite`, `meta-llama/llama-3.3-70b-instruct:free`, `openai/gpt-4o-mini`,
  `anthropic/claude-sonnet-4.5`), and a transform preset (`Punctuate & capitalize` / `Remove fillers` /
  `Make it an email` / `Custom…` → prompt textarea). A "text leaves this Mac to OpenRouter" note + the cost
  hint ("~$3/mo at heavy use on Flash Lite; free model available").

## Data flow

```
hotkey ▶ capture (AVAudioEngine PCM) ▶ resampleTo16k
      ▶ STT:  mode=local → on-device Whisper
              mode=openai-whisper-api(+baseUrl) → POST <LAN>/v1/audio/transcriptions  ──(err/timeout)──▶ fallback: on-device Whisper
      ▶ normalizeTranscript (dictionary/macros — local, unchanged)
      ▶ Cleanup: mode=off → passthrough
                 mode=openrouter → POST openrouter.ai/api/v1/chat/completions  ──(any err)──▶ passthrough raw text
      ▶ routeTranscript → clipboard + AX-paste  (unchanged)
```

## Error handling (must-haves)

- Remote STT offline/timeout/non-2xx → **fall back to on-device Whisper**, toast once. Never a silent empty paste.
- Missing STT key when default-cloud (no baseUrl) → `SttKeyMissingError` toast (won't happen in SigmaVoice's
  LAN-only UI, but keep the guard for SigmaLink).
- LLM cleanup any-error (no key, offline, bad JSON, non-2xx, timeout) → **raw transcript passthrough** + warn toast.
- `safeStorage` unavailable → degrade to base64 + surface "key stored unencrypted (no OS keyring)".
- All network calls carry an `AbortController`/`AbortSignal.timeout` (ADR-007: the HTTP analog of ENG-3).

## Testing

- **voice-core (SigmaLink, `node --test`, mock `fetch`):** configurable URL builds the right request; auth
  header present iff key set; `SttKeyMissingError` only when no key *and* no baseUrl; remote-failure → local
  fallback path; `buildOpenRouterTransform` happy path + error→throw (so caller passthrough is exercised);
  response-shape tolerance (`{text}` and choices). Run the **shared voice-core suite** green before pin bump.
- **app shell (this repo, `node --test`):** `secret-store` set/get/clear roundtrip (guard `safeStorage`),
  transform-config + STT-config validation (URL rejects, prompt sanitize/caps), IPC handler smoke.
- **Gate (in this repo, NOT a worktree — CLAUDE.md):** `pnpm typecheck` + `pnpm build` + `pnpm test`.

## Cost (research 2026-06-14, OpenRouter, cleanup ≈ 300 in / 200 out tokens)

| Model | $/1k dictations | Heavy (1k/day) |
|---|---:|---:|
| `meta-llama/llama-3.3-70b-instruct:free` | $0.00* | $0.00* |
| `google/gemini-2.5-flash-lite` (default) | $0.11 | ~$3.30/mo |
| `openai/gpt-4o-mini` | $0.17 | ~$4.95/mo |
| `anthropic/claude-sonnet-4.5` | $3.90 | ~$117/mo |

\*free tier rate-limited (20/min, 1000/day, needs ≥$10 lifetime credit for 1000/day). OpenRouter adds a
**5.5% credit-purchase fee** (no per-token markup). **Recommendation:** default Flash Lite, free Llama as
fallback, premium reserved for rewrite prompts.

## Sequencing

1. **Phase A — engine (SigmaLink `voice-core`):** A1+A2 (remote STT) and B1–B3 (OpenRouter transform) + tests.
   Commit upstream. *(Both products gain the capability — harmless, default-off.)*
2. **Phase B — app shell (this repo):** C1–C5 + D, against the new pin.
3. **Phase C — integrate:** bump submodule pin; run gate; **on-device smoke** — (i) dictate against the
   3060 box and confirm fallback when it's off; (ii) enable OpenRouter cleanup with a real key and confirm a
   "make it an email" transform + passthrough-on-error.

## Risks

- **Two-repo dance** (ADR-003) + submodule not checked out here → engine work in the SigmaLink repo; pin bump
  is the CI source of truth (native-gotchas #7). Sequential ruflo use.
- **Self-hosted response variance** — handle `{text}` and `choices`/verbose shapes defensively.
- **`safeStorage` headless** — base64 fallback + clear messaging; don't hard-fail.
- **No heavy new deps** (posture) — uses global `fetch` + Electron `safeStorage` only. ✓
- **Latency** — a remote round-trip + an optional LLM pass adds seconds; keep cleanup off by default and
  surface a "cleaning…" HUD state if it lands.

## Definition of done

On-device Whisper still works untouched with both features off. With Remote STT on and a reachable LAN URL,
a dictation transcribes via the 3060 and pastes; with the box off, it transparently falls back to local +
toasts. With OpenRouter cleanup on, a dictation is reformatted by the chosen model; with a bad key/offline,
the raw transcript still pastes. The OpenRouter key is stored encrypted (or clearly flagged unencrypted).
`pnpm typecheck` + `pnpm build` + `pnpm test` pass; the submodule pin is bumped and the shared voice-core
suite is green; ADR-007 + this spec are committed.
