# BridgeVoice — Competitive Video & Source Analysis (for SigmaVoice planning)

> **Scope.** Feature-mine BridgeMind's **BridgeVoice** dictation app from real video + official
> sources, then map it onto **SigmaVoice** (local-first, internal-use, unsigned, macOS arm64 + Win
> x64, no telemetry/accounts/cloud-by-default, engine via submodule, wake-word OFF).
> **`video-scout`, 2026-05-31.** Evidence is tagged **[OBSERVED]** (frame/transcript/doc + locator)
> vs **[INFER]**. This is planning data — dense and factual, not a chat reply.

---

## A. Sources & method

**Mode used: FULL FRAME pipeline + transcript.** The `claude-video-vision` MCP set up cleanly
(local backend, whisper.cpp, ffmpeg/yt-dlp present). I extracted **frames via Claude vision** (not
the gemini CLI, which the skill flags as broken headless) and pulled **YouTube auto-captions** with
`yt-dlp`. I did NOT watch 4 h of frames — I transcript-located BridgeVoice segments first, then
deep-watched only those windows (per the skill's long-video method).

| # | Source | Type | What I got | Mode |
|---|--------|------|-----------|------|
| 1 | **Primary stream** — `youtube.com/watch?v=0NU7O7u-yfM` "Day 185 – Vibe Coding… ARR $201,192", BridgeMind, 4 h 02 m, uploaded 2026-05-29 | Livestream VOD | Full auto-caption transcript (deduped) + deep-watched frames at the flagged ~2h12m region **and** the settings-UI reveal (~1h47–1h49) | Frames + transcript |
| 2 | **Launch video** — `youtube.com/watch?v=VplNyFNo2oI` "Officially Launching BridgeVoice", BridgeMind, 4 m 15 s, uploaded 2026-03-18 | Product demo | Full transcript + frames of Overview, Settings/Transcription-Mode, model list, widget pill | Frames + transcript |
| 3 | `docs.bridgemind.ai/docs/bridgevoice` | Official docs | Full feature/model/settings spec | Web text |
| 4 | `bridgemind.ai/products/bridgevoice` | Product/marketing page | Claims, stack, pricing | Web text |
| 5 | `bridgemind.ai/changelog` | Release ledger | BridgeVoice Desktop v2.2.50–v2.2.52 (May 2026) | Web text |

**What I could NOT fully verify / access:**
- The **launch video's caption file** hit a `429 Too Many Requests` mid-download; I captured the
  primary English track but not all language variants. The English transcript I used is complete.
- **`bridgevoice.ai`** is an **unrelated** product ("Speak Freely. Understand Instantly." — real-time
  multilingual voice *comms*, not the BridgeMind dictation app). **Excluded** from this analysis.
- I did **not** watch every minute of the 4 h stream; non-BridgeVoice segments (BridgeSpace,
  BridgeMRR, Stripe revenue debugging, chat banter) were transcript-skimmed only.
- **Stack discrepancy (flagged, not resolved):** the product page says BridgeVoice is built with
  "**Tauri 2.0 and Rust**" and "macOS builds are **code-signed and notarized**"; on-screen agent
  text at **[OBSERVED 0NU7O7u-yfM 02:08:28]** independently confirms Tauri+Rust (`push_to_talk.rs`,
  `window.__TAURI__.core.invoke`, bundle id `com.bridgemind.bridgevoice.dev`). I treat Tauri/Rust as
  observed; "signed/notarized" as a marketing claim I could not independently verify from video.
- **Latency claims conflict across sources** (see B) — reported, not reconciled.

---

## B. BridgeVoice feature inventory

Each row: what it does · how it works (as observable) · UX notes · evidence.

### B1. Core capture → transcribe → inject
- **Global push-to-talk + toggle recording, customizable hotkeys.** Hold a key to dictate, or
  toggle hands-free; both modes have user-set global hotkeys. UX: a dedicated **Shortcuts** settings
  page shows "Listener Status: **Installed**", a **Push-to-Talk** row (shown bound to `Mouse 5`, then
  rebound live to `Shift`) with **Change / Clear**, and a **Toggle Recording** row; a capture overlay
  reads "Press and hold your desired key combination…". **[OBSERVED 0NU7O7u-yfM 01:47:47–01:47:50,
  02:15:08]; launch transcript 00:00:29 "hook it up with whatever push-to-talk key you want"; docs.]**
- **On-device (local) transcription via whisper.cpp.** Fully offline, "no audio leaves your machine".
  Marketing: "C++ Core. Powered by whisper.cpp", "hyper-optimized whisper.cpp engine". Apple-Silicon
  GPU accel "≈10× faster". **[product page; docs; launch transcript 00:00:54–01:01]**
- **Cloud transcription via Groq Whisper (Large-v3-Turbo), 100+ languages, auto-detect.**
  User-switchable Local⇄Cloud. The author says he "typically uses the cloud version — the cloud
  version is better." **[OBSERVED 0NU7O7u-yfM 01:44:18 "I do use some local models for BridgeVoice but
  I typically use the cloud version"; launch transcript 01:03–01:09; docs; product page]**
- **Universal text injection into the focused app** via simulated paste (`Cmd+V`/`Ctrl+V`), full
  Unicode. "Your words land in whatever app has focus — editor, terminal, Slack, browser." Demo drops
  a spoken prompt straight into Claude Code. **[launch transcript 00:37–00:42; docs; product page]**
- **Copy-to-clipboard mode (instead of auto-paste)** — a **toggle** ("Copy to clipboard instead of
  pasting"). Newly shipped: the author calls it "a big update" live. Changelog v2.2.52 (2026-05-29):
  "Finished transcripts are placed on the clipboard for manual paste instead of auto-inserted into the
  focused field." **[OBSERVED 0NU7O7u-yfM 01:47:40 (toggle visible) + transcript 01:47 "copy to
  clipboard instead of pasting… now a toggle you can turn on"; changelog]**
- **Latency.** Conflicting claims: docs "sub-500 ms from speech end to text"; product page "<10 ms
  recording latency" + "speech to text in under a second"; video "near-immediate". **[docs; product
  page; launch transcript 00:31]**

### B2. Whisper model management
- **6 local models with in-app download + size + radio-select:** Tiny 75 MB · Base 142 MB (default
  selected) · Small 466 MB · Medium 1500 MB · Large v3 3100 MB · Distil-Large v3 756 MB. Undownloaded
  models show a "**Download required**" pill. **[OBSERVED VplNyFNo2oI 00:00:57, 01:07; docs]**

### B3. Accuracy / formatting layer
- **Custom Dictionary** — maps spoken phrases → exact strings, applied post-transcription via an
  "**Apply dictionary to transcriptions**" toggle. Killer dev use shown: "Bridge Mind API" → literal
  `@bridgemindapi` so an agent CLI auto-references the right repo; "use effect" → `useEffect`. Recent
  Activity rows each have an inline **"Add to Dictionary"** button. **[OBSERVED VplNyFNo2oI 00:00:45
  (Add-to-Dictionary buttons), 00:00:57 (toggle); launch transcript 01:29–02:17; docs; product page]**
- **Custom Instructions (AI prompt-reformatting).** A free-text instruction block that **reshapes raw
  speech into clean, formatted output** using "best-practice prompt techniques" (camelCase vars,
  PascalCase classes, punctuation, "new line"/"open bracket" verbal commands, expand "func"→function,
  strip filler). This is an **LLM cleanup pass on top of transcription**. Docs list "AI text polish
  (coming soon)" for Pro — but the launch video **demonstrates it working**, so by 2026-05 it is live.
  **[OBSERVED launch transcript 02:19–03:01; VplNyFNo2oI description publishes the exact instruction
  text; "Instructions" is a top-level sidebar nav item — VplNyFNo2oI 00:00:45]**

### B4. History & stats
- **Transcription history**, every transcription saved **locally** with timestamp, **word count**,
  **duration**; full-history view; per-row "Add to Dictionary". **[OBSERVED VplNyFNo2oI 00:00:45;
  0NU7O7u-yfM 01:47:57; docs]**
- **Usage stats dashboard ("Overview")** — 4 hero cards: **Total Words, Speaking Time, Sessions, Avg
  Pace (WPM)**. (Launch: 63,651 words / 5h52m / 2,274 / 181 wpm. Stream day-185: 239,301 / 24h1m /
  8,302 / 166 wpm.) **[OBSERVED VplNyFNo2oI 00:00:45; 0NU7O7u-yfM 01:47:55]**

### B5. Capture behavior & device
- **Input-device picker** with Preferred vs "Active now" fallback ("Primary when connected / Fallback
  when missing"). **[OBSERVED VplNyFNo2oI 00:00:57; 0NU7O7u-yfM 01:47:45]**
- **"Mute system audio while listening"** toggle (ducks other audio during dictation).
  **[OBSERVED 0NU7O7u-yfM 01:47:40; 01:47 transcript]**
- **Language selector** (per-mode; Cloud adds Auto-detect). Traditional Chinese w/ Taiwan-standard
  chars added in v2.2.52. **[OBSERVED 0NU7O7u-yfM 01:47:45; changelog]**

### B6. App shell / platform / commerce
- **Cross-platform**: macOS 11+, Windows 10+, Linux (experimental, Ubuntu 20.04+). Built **Tauri 2.0
  + Rust**; `config.json` shared dev↔prod, per-identity auth creds. **[product page; docs; OBSERVED
  0NU7O7u-yfM 02:08:28 on-screen Rust/Tauri internals]**
- **Account / subscription gated.** Pro ($40/mo annual; $50 monthly) unlocks BridgeVoice + Cloud + the
  rest of the suite; **3-day free trial**; sign-in required (Cognito-style auth, token refresh).
  Free tier (per docs) = local-only. **[docs; product page; launch transcript 03:24–03:35;
  changelog "Pro Required" lock + auth-refresh fixes]**
- **What's-new modal** driven by a centralized changelog JSON; public release ledger. **[changelog
  v2.2.51]**
- **Windows mic diagnostics** with a privacy-settings deep link; Windows retains transcript on
  clipboard post-dictation. **[changelog v2.2.50]**

---

## C. UX / visual design language

All **[OBSERVED]** from frames (VplNyFNo2oI 00:00:45 / 00:00:57 / 01:07; 0NU7O7u-yfM 01:47:40–01:48:30).

- **Main window** = a full desktop app (not tray-only): macOS traffic-light chrome; **left sidebar**
  (~120 px) with icon+label nav — **Overview · History · Dictionary · Instructions · Shortcuts ·
  Subscription (Pro crown) · Settings · Changelog**; bottom = user avatar + "Pro Plan".
- **Palette/material:** near-black background (#0a0a0c-ish), **glassy rounded cards** with thin
  borders, generous padding; a single **blue accent** (selected radio = solid blue dot; selected card
  = blue border + faint glow). Restrained, **Apple-grade dark** aesthetic; light type on dark.
- **Settings as big selectable cards.** Transcription Mode = two large cards (**Local** vs **Cloud**)
  each with a one-line description + **capability chips** (Local: `Private`/`Offline`/`English`;
  Cloud: `100+ Languages`/`Fast`/`Accurate`) and a radio. Model list = full-width rows w/ size + radio
  + "Download required" pill. Toggles for Dictionary/Widget/Recording-behavior are iOS-style switches.
- **Overview dashboard:** 4 hero stat cards in a row (icon + big number + label), then a "Recent
  Activity" feed of transcription cards (text + time + word count + per-row "Add to Dictionary") and a
  "View Full History" link. Reads like a fitness/analytics dashboard for your voice.
- **The floating widget ("BridgeVoice pill"):** a small **rounded-rect glass pill** that floats over
  all apps. **Idle** = BridgeVoice hexagon glyph + "BridgeVoice" wordmark. **Recording** = collapses
  to a compact mic/waveform pill (docs: "listening with **7 frequency bands** visualization") + red
  dot; **processing** = spinner. **Double-click to toggle; draggable anywhere.** "Widget Appearance"
  setting toggles **Logo & Text ↔ Logo-only**, and a "Show floating widget on screen" master toggle.
  **[OBSERVED widget pill in virtually every stream frame bottom-left; recording pill VplNyFNo2oI
  00:00:35; appearance toggle 0NU7O7u-yfM 01:47:40; docs description of bands]**
- **Failure state seen in the wild:** a pill reading **"Couldn't switch focus to you…"**
  **[OBSERVED 0NU7O7u-yfM 01:48:12]** — i.e. the paste-target lost focus. Directly validates
  SigmaVoice's focus-preserving-HUD design concern.
- **Onboarding (BridgeSpace shell, adjacent):** "Let's set up your workspace" with recommended vs
  advanced cards — **[OBSERVED 0NU7O7u-yfM 02:15:08]** (this is BridgeSpace, not BridgeVoice; included
  only as a visual-language reference for the wider suite).
- **Brand glyph:** blue/teal **hexagonal "bridge" mark**; consistent across pill, sidebar, dock.

---

## D. Author's remarks & product philosophy

Direct quotes/paraphrases (timestamps cited). The author is the BridgeMind founder, "vibe coding an
app to $1M" in public.

- **Built for himself first ("dogfood").** "I'm not building these products so that they can just not
  be used by anybody. I'm building them so that I can use them first and foremost… these are the tools
  I use to ship every single day." **[VplNyFNo2oI 03:07–03:22]** He claims 63,000+ words dictated
  before launch. **[VplNyFNo2oI 00:15]**
- **Positioning: voice-to-text built specifically for vibe coding** (not generic dictation). "the
  voice-to-text tool built for vibe coding." **[VplNyFNo2oI 00:08]**
- **The Local⇄Cloud switch is a deliberate philosophy, not a fallback.** "Bridge Voice is one of the
  first products to actually offer users the ability to switch between local (on-device, fully private,
  no internet) and cloud (100+ languages)… as a vibe coder… sometimes I want to speak incredibly fast,
  other times I need it to be really accurate." **[VplNyFNo2oI 00:44–01:26]** (In practice he prefers
  cloud — **[0NU7O7u-yfM 01:44:18]**.)
- **Dictionary + Custom Instructions are his "nobody else is doing this" differentiators.**
  Dictionary→`@repo` references for agent CLIs **[VplNyFNo2oI 01:43–02:17]**; Custom Instructions =
  "enhance the way the AI is transcribing my prompts… properly format what I'm saying to the AI with
  best-practice prompt techniques." **[VplNyFNo2oI 02:19–03:01]** This is the strategic core: voice as
  a **prompt-engineering front-end for coding agents**, not just speech→text.
- **Stated roadmap / ideas (with dates):** "AI text polish (coming soon)" and "cross-device sync
  (coming soon)" for Pro **[docs]**; "we're going to make it even better… the best voice-to-text tool
  on the market" **[VplNyFNo2oI 04:01–04:13]**; explicit ask: "let me know if you have any feedback."
  Suite roadmap: BridgeMCP/BridgeMemory, BridgeSpace, **BridgeCode "coming soon"** **[VplNyFNo2oI
  03:41–03:47]**.
- **Live engineering candor on a real macOS bug (the flagged ~2h12m region).** Across **[0NU7O7u-yfM
  01:48:30, 02:07:55, 02:10:16, 02:08:28]** he debugs **push-to-talk not activating the listener
  locally**. The fix-agent's on-screen analysis **[02:08:28]** is unusually revealing:
  *"PTT persisted = 'Shift' (saved correctly, so the key-setting UI works). config.json is shared
  between dev and prod (productName Bridgevoice) but auth credentials are per-identity
  (com.bridgemind.bridgevoice.dev)… I did NOT touch the macOS/Linux **deferred-listener-start gap** →
  `set_pro_subscription` only re-attempts the listener under `#if(target_os="windows")` …a macOS user
  who grants Accessibility or logs in **after launch** stays broken until restart… fixing it needs a
  cross-platform AppHandle stash + a new call path via check_permissions/request_permissions."*
  **Takeaway for us:** their global key-listener has the **same class of macOS Accessibility/
  permission-timing fragility** SigmaVoice fights (Input-Monitoring/Accessibility grants, listener
  lifecycle). A viewer also asks the positioning question: "what's the difference between BridgeVoice
  and the integrated voice setting in Claude Code?" — answer in chat: **"you can use BridgeVoice
  everywhere."** **[0NU7O7u-yfM 02:21:48]**

---

## E. Mapping table → SigmaVoice

Posture conflict = needs cloud-by-default, accounts, telemetry, signing, or heavy deps → **ADR-candidate**.

| BridgeVoice feature | SigmaVoice has it? | Local-first feasibility | Posture conflict? | Priority |
|---|---|---|---|---|
| Global hotkey → on-device Whisper → paste into focused app | **Yes** (whisper.cpp + AX-paste) | n/a (already core) | No | — |
| Push-to-talk + toggle modes, rebindable hotkeys | **Yes** | n/a | No | — |
| Custom dictionary / phrase replacement | **Yes** (dictionary/macros + normalizeTranscript) | n/a | No | — |
| Usage stats (words/time/sessions/WPM) | **Partial** (usage stats exist; add **WPM + Sessions**) | Easy (local KV already there) | No | **P1** |
| Local⇄Cloud **toggle** in one UI | **Partial** (engine has Gemini-CLI path; not surfaced as a clean switch) | Yes, but **cloud stays OFF by default**, opt-in only | **ADR-candidate** (cloud) | **P2** |
| Cloud Whisper, 100+ languages, auto-detect | **Partial** (Gemini-CLI cloud transcribe exists) | Opt-in only; multilingual is the real gap | **ADR-candidate** | P2 |
| **Copy-to-clipboard instead of paste** (toggle) | **Partial** (we clipboard+paste; expose a clipboard-only toggle) | Trivial | No | **P0** |
| **Custom Instructions** (LLM reformat raw speech → clean/formatted prompt) | **No** | Yes **if** run against the already-present local/Gemini path; opt-in | **ADR-candidate** (needs an LLM pass) | **P1** |
| Voice → **`@repo` / agent reference** expansion (dictionary-powered) | **Partial** (dictionary can already do literal→string; document the pattern) | Easy | No | P1 |
| In-app **multi-model download UX** (size + "Download required" + radio) | **Yes** (model-download UX exists; polish to BV's card style) | n/a | No | P1 |
| **Floating always-visible widget pill** (idle/listening/processing states, draggable, 7-band viz) | **No** (we have a focus-preserving recording **HUD**, not a persistent pill) | Yes — extends existing HUD; **must keep focusable:false** | No | **P0** |
| Widget appearance toggle (Logo & Text ↔ Logo) + show/hide | **No** | Easy | No | P2 |
| **Mute system audio while listening** | **No** | Medium (macOS audio ducking via CoreAudio) | No (no heavy dep if native) | P2 |
| Input-device picker (preferred + fallback) | **Partial/unknown** (engine selects mic; expose picker) | Medium | No | P1 |
| Transcription **history** w/ per-row "Add to Dictionary" | **Partial** (stats yes; full searchable history + inline add = gap) | Easy (local KV) | No | **P1** |
| Polished **dashboard "Overview"** (hero stat cards + activity feed) | **Partial** (stats exist; not a designed dashboard) | Easy | No | P2 |
| Settings as **big selectable cards + capability chips** (Apple-grade dark) | **No** (functional settings.html) | Easy (renderer restyle) | No | P1 |
| **What's-new / changelog modal** | **No** | Easy (local JSON, no network needed) | No | P2 |
| Cross-platform incl. **Linux** | **No** (mac arm64 + win x64 only; win blocked W-SV1) | Linux out of scope | **ADR-candidate** (Linux) | P2 |
| **Accounts / Pro subscription / trial gating** | **No** (by design) | n/a | **Hard conflict** — internal/free, no accounts | **Won't-do** (ADR if ever) |
| **Code-signed & notarized** builds | **No** (unsigned/ad-hoc by posture) | n/a | **ADR-candidate** (signing) | P2-if-ever |
| Cross-device sync ("coming soon") | **No** | n/a | **Hard conflict** (cloud/accounts) | **Won't-do** |

---

## F. Top recommendations (ranked)

Highest-value BridgeVoice-inspired moves for SigmaVoice, posture-respecting. Effort S/M/L.

1. **(P0, S) Clipboard-only output toggle.** BV literally just shipped "copy to clipboard instead of
   pasting" as a toggle and the author calls it "a big update." We already do clipboard+paste — expose
   the switch. Wins the focus-loss case ("Couldn't switch focus to you…" pill we observed). *Trivial,
   high daily value, zero posture cost.*
2. **(P0, M) Persistent floating widget pill (extend the HUD, don't replace it).** BV's always-visible
   draggable pill with idle/listening(7-band)/processing states is its signature UX. Build it on our
   existing focus-preserving HUD (**keep `focusable:false` + `showInactive`** — exactly the thing BV's
   focus-error pill warns about). Already on our wishlist ("floating-pill always-visible widget").
   *Biggest perceived-quality upgrade.*
3. **(P1, M) Custom Instructions = optional local "prompt cleanup" pass.** The author's #1 claimed
   differentiator. Run an **opt-in** reformatting pass (camelCase/punctuation/strip-filler/"new line"
   commands) over the transcript. Feasible against our existing engine paths. Default OFF; if it needs
   an LLM, it's an **ADR-candidate** (keep local/opt-in, never cloud-by-default). *Turns dictation into
   a coding-prompt front-end — our actual use case.*
4. **(P1, S) Document + ship dictionary "`@repo`/agent-reference" recipes.** Our dictionary already
   maps spoken→literal; BV's standout is just a *usage pattern* (`"bridge mind api"` → `@bridgemindapi`).
   Ship example entries + docs. *Near-zero effort, mirrors their headline feature.*
5. **(P1, S) WPM + Sessions in stats; build the "Overview" dashboard.** Add Avg-Pace(WPM) and Sessions
   to our local stats and present the 4-card hero dashboard. *Cheap, makes us look as polished as BV.*
6. **(P1, M) Transcription history with per-row "Add to Dictionary".** Searchable local history feed;
   one-click promote a phrase to the dictionary. Pure local KV. *Tightens the dictionary loop.*
7. **(P1, M) Apple-grade dark settings restyle (selectable cards + capability chips).** Reskin
   settings.html to BV's card+chip language (Local vs Cloud cards, model rows w/ size + "Download
   required" pill, iOS toggles). Leverage the `apple-design` skill family. *Perceived quality jump,
   renderer-only.*
8. **(P1, M) Input-device picker (preferred + "active now" fallback).** Expose mic selection in
   settings; common dictation pain point. *Engine likely already selects a device; surface it.*
9. **(P2, M) Local⇄Cloud transcription toggle (opt-in, default Local).** Surface the already-present
   Gemini-CLI cloud path as a clean switch **with multilingual as the real payoff** — but **cloud stays
   OFF by default, explicit opt-in, no account**. **ADR-candidate** because it touches the cloud line.
10. **(P2, S) "Mute system audio while listening" toggle.** Nice polish; native CoreAudio ducking on
    mac (no heavy dep). *Defer; quality-of-life.*
11. **(P2, S) Widget appearance toggle (Logo & Text ↔ Logo-only) + show/hide.** Cheap once the pill
    (rec #2) exists.
12. **(P2, S) Local what's-new / changelog modal.** BV drives it from changelog JSON; ours can be a
    bundled local JSON — **no network, no telemetry**. *Good for an internal tool's release notes.*
13. **(P2, S) Multilingual local models.** BV ships English-only locally and pushes multilingual to
    cloud. If we want offline multilingual, swap to a multilingual whisper.cpp model in our existing
    download UX — **a local-first edge over BV** (they don't offer offline multilingual). *Engine/model
    config; submodule-side.*

**Explicit non-goals (hard posture conflicts):** accounts / Pro subscription / trial gating,
cross-device cloud sync, cloud-by-default, telemetry — all violate SigmaVoice's local-first,
internal, no-accounts posture and should **not** be adopted without an ADR. Code-signing/notarization
and Linux support are likewise ADR-gated reversals of the locked posture.

**Cross-cutting engineering note:** BV's live macOS push-to-talk bug **[0NU7O7u-yfM 02:08:28]** —
listener not (re)started after a *post-launch* Accessibility grant / login, with a Windows-only
re-attempt guard — is the **same class of global-key-listener + Accessibility-timing fragility**
SigmaVoice manages (`node-global-key-listener`, Input-Monitoring/Accessibility). Worth a hardening
pass + the operator live-mic smoke already on the wishlist.
