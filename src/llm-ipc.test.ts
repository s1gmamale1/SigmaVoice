import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMain } from 'electron';
import type { KvStore } from './kv-store.ts';
import type { SecretStore } from './secret-store.ts';
import { registerLlmIpc } from './llm-ipc.ts';
import { REMOTE_STT_KEY_ID } from './secret-backed-kv.ts';

function fakeKv(seed?: Record<string, string>): KvStore {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: (k) => (map.has(k) ? map.get(k)! : null), set: (k, v) => { map.set(k, v); } };
}

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, arg: unknown) => unknown>();
  const ipcMain = { handle: (ch: string, fn: (e: unknown, arg: unknown) => unknown) => { handlers.set(ch, fn); } } as unknown as IpcMain;
  return { ipcMain, invoke: (ch: string, arg?: unknown) => handlers.get(ch)!(null, arg) };
}

function fakeSecrets(seed?: Record<string, string>): SecretStore & { map: Map<string, string> } {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    getSecret: (k) => (map.has(k) ? map.get(k)! : null),
    setSecret: (k, v) => { map.set(k, v); },
    hasSecret: (k) => map.has(k),
    clearSecret: (k) => { map.delete(k); },
    isEncrypted: () => true,
  };
}

test('bv:setRemoteSttConfig preserves the stored key when apiKey is omitted', () => {
  const kv = fakeKv();
  const secrets = fakeSecrets({ [REMOTE_STT_KEY_ID]: 'secret' });
  const { ipcMain, invoke } = fakeIpc();
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => secrets });
  const r = invoke('bv:setRemoteSttConfig', { enabled: true, baseUrl: 'http://x/v1', model: 'whisper-large-v3' }) as { ok: boolean };
  assert.equal(r.ok, true);
  assert.equal(secrets.getSecret(REMOTE_STT_KEY_ID), 'secret');
  assert.equal(kv.get(REMOTE_STT_KEY_ID), null);
  assert.equal(kv.get('voice.transcriptionMode'), 'openai-whisper-api');
});

test('bv:setRemoteSttConfig clears the key when apiKey is an explicit empty string', () => {
  const kv = fakeKv();
  const secrets = fakeSecrets({ [REMOTE_STT_KEY_ID]: 'secret' });
  const { ipcMain, invoke } = fakeIpc();
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => secrets });
  invoke('bv:setRemoteSttConfig', { enabled: true, baseUrl: 'http://x/v1', model: 'm', apiKey: '' });
  assert.equal(secrets.getSecret(REMOTE_STT_KEY_ID), null);
  assert.equal(kv.get(REMOTE_STT_KEY_ID), null);
});

test('bv:setRemoteSttConfig stores a supplied key in SecretStore', () => {
  const kv = fakeKv();
  const secrets = fakeSecrets();
  const { ipcMain, invoke } = fakeIpc();
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => secrets });
  const r = invoke('bv:setRemoteSttConfig', { enabled: true, baseUrl: 'http://x/v1', model: 'm', apiKey: ' k ' }) as { ok: boolean };
  assert.equal(r.ok, true);
  assert.equal(secrets.getSecret(REMOTE_STT_KEY_ID), 'k');
  assert.equal(kv.get(REMOTE_STT_KEY_ID), null);
});

test('bv:setRemoteSttConfig does not persist remote mode when supplied key cannot be stored', () => {
  const kv = fakeKv();
  const { ipcMain, invoke } = fakeIpc();
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => null });
  const r = invoke('bv:setRemoteSttConfig', { enabled: true, baseUrl: 'http://x/v1', model: 'm', apiKey: 'k' }) as { ok: boolean; error?: string };
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /Secret store unavailable/);
  assert.equal(kv.get('voice.transcriptionMode'), null);
});
