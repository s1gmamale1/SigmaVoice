// SigmaVoice — remote-STT + transform config read/validate/persist (ADR-007).
//
// Pure logic over the KV store (no Electron). API keys are NOT here — they live
// in the encrypted secret-store (src/secret-store.ts).

import type { KvStore } from './kv-store';

const STT_MODE = 'voice.transcriptionMode';
const STT_BASE = 'voice.stt.openai-whisper-api.baseUrl';
const STT_MODEL = 'voice.stt.openai-whisper-api.model';
const TF_MODE = 'voice.transform.mode';
const TF_MODEL = 'voice.transform.model';
const TF_PRESET = 'voice.transform.preset';
const TF_PROMPT = 'voice.transform.prompt';

const PROMPT_CAP = 2000;
const VALID_PRESETS = new Set(['punctuate', 'fillers', 'email', 'custom']);
const DEFAULT_TF_MODEL = 'google/gemini-2.5-flash-lite';
const DEFAULT_STT_MODEL = 'whisper-large-v3';

export interface RemoteSttConfig { enabled: boolean; baseUrl: string; model: string; }
export interface RemoteSttInput { enabled: boolean; baseUrl?: string; model?: string; }
export interface TransformConfig { mode: 'off' | 'openrouter'; model: string; preset: string; prompt: string; }
export type SaveResult = { ok: true } | { ok: false; error: string };

function isHttpUrl(s: string): boolean {
  try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== ''; } catch { return false; }
}

export function getRemoteSttConfig(kv: KvStore): RemoteSttConfig {
  return {
    enabled: kv.get(STT_MODE) === 'openai-whisper-api',
    baseUrl: kv.get(STT_BASE) ?? '',
    model: kv.get(STT_MODEL) ?? DEFAULT_STT_MODEL,
  };
}

export function setRemoteSttConfig(kv: KvStore, input: RemoteSttInput): SaveResult {
  const baseUrl = (input.baseUrl ?? '').trim();
  const model = (input.model ?? '').trim();
  if (input.enabled) {
    if (!isHttpUrl(baseUrl)) return { ok: false, error: 'Enter a valid http(s):// endpoint URL.' };
    kv.set(STT_BASE, baseUrl);
    kv.set(STT_MODEL, model);
    kv.set(STT_MODE, 'openai-whisper-api');
  } else {
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
