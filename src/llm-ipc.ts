// SigmaVoice — Cloud/LLM IPC (ADR-007): OpenRouter key (encrypted) + remote-STT &
// transform config. Mirrors src/model-ipc.ts — ipcMain + deps injected.

import type { IpcMain } from 'electron';
import type { KvStore } from './kv-store';
import type { SecretStore } from './secret-store';
import { getRemoteSttConfig, setRemoteSttConfig, getTransformConfig, setTransformConfig } from './cloud-config.ts';
import { REMOTE_STT_KEY_ID } from './secret-backed-kv.ts';

const OPENROUTER_KEY_ID = 'provider.openrouter.apiKey';

export function registerLlmIpc(
  ipcMain: IpcMain,
  deps: { kv: () => KvStore | null; secrets: () => SecretStore | null },
): void {
  // ── OpenRouter API key (encrypted; never echoed back) ──
  ipcMain.handle('bv:setOpenRouterKey', (_e, key: unknown) => {
    const s = deps.secrets();
    if (!s) return { ok: false, error: 'Secret store unavailable' };
    const k = typeof key === 'string' ? key.trim() : '';
    if (!k) return { ok: false, error: 'Empty key' };
    try {
      s.setSecret(OPENROUTER_KEY_ID, k);
      return { ok: true, encrypted: s.isEncrypted() };
    } catch (err) {
      // setSecret throws (rather than silently storing plaintext) if OS encryption fails.
      return { ok: false, error: err instanceof Error ? err.message : 'Failed to store key' };
    }
  });
  ipcMain.handle('bv:hasOpenRouterKey', () => {
    const s = deps.secrets();
    return { hasKey: !!s?.hasSecret(OPENROUTER_KEY_ID), encrypted: !!s?.isEncrypted() };
  });
  ipcMain.handle('bv:clearOpenRouterKey', () => {
    deps.secrets()?.clearSecret(OPENROUTER_KEY_ID);
    return { ok: true };
  });

  // ── Remote STT config ──
  ipcMain.handle('bv:getRemoteSttConfig', () => {
    const kv = deps.kv();
    return kv ? getRemoteSttConfig(kv) : null;
  });
  ipcMain.handle('bv:setRemoteSttConfig', (_e, cfg: unknown) => {
    const kv = deps.kv();
    if (!kv) return { ok: false, error: 'No store' };
    const c = (cfg ?? {}) as Record<string, unknown>;
    if (typeof c.apiKey === 'string' && !deps.secrets()) {
      return { ok: false, error: 'Secret store unavailable' };
    }
    const result = setRemoteSttConfig(kv, {
      enabled: !!c.enabled,
      baseUrl: String(c.baseUrl ?? ''),
      model: String(c.model ?? ''),
    });
    if (result.ok && typeof c.apiKey === 'string') {
      const secrets = deps.secrets();
      if (!secrets) return { ok: false, error: 'Secret store unavailable' };
      const key = c.apiKey.trim();
      try {
        if (key) secrets.setSecret(REMOTE_STT_KEY_ID, key);
        else secrets.clearSecret(REMOTE_STT_KEY_ID);
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to store STT key' };
      }
    }
    return result;
  });

  // ── Transform (cleanup) config ──
  ipcMain.handle('bv:getTransformConfig', () => {
    const kv = deps.kv();
    return kv ? getTransformConfig(kv) : null;
  });
  ipcMain.handle('bv:setTransformConfig', (_e, cfg: unknown) => {
    const kv = deps.kv();
    if (!kv) return { ok: false, error: 'No store' };
    const c = (cfg ?? {}) as Record<string, unknown>;
    return setTransformConfig(kv, {
      mode: String(c.mode ?? 'off'),
      model: String(c.model ?? ''),
      preset: String(c.preset ?? 'punctuate'),
      prompt: String(c.prompt ?? ''),
    });
  });
}
