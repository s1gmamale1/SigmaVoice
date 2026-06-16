import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { IpcMain } from 'electron';
import type { KvStore } from './kv-store.ts';
import { registerLlmIpc } from './llm-ipc.ts';

function fakeKv(seed?: Record<string, string>): KvStore {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: (k) => (map.has(k) ? map.get(k)! : null), set: (k, v) => { map.set(k, v); } };
}

function fakeIpc() {
  const handlers = new Map<string, (e: unknown, arg: unknown) => unknown>();
  const ipcMain = { handle: (ch: string, fn: (e: unknown, arg: unknown) => unknown) => { handlers.set(ch, fn); } } as unknown as IpcMain;
  return { ipcMain, invoke: (ch: string, arg?: unknown) => handlers.get(ch)!(null, arg) };
}

test('bv:setRemoteSttConfig preserves the stored key when apiKey is omitted', () => {
  const kv = fakeKv({ 'voice.stt.openai-whisper-api.apiKey': 'secret' });
  const { ipcMain, invoke } = fakeIpc();
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => null });
  const r = invoke('bv:setRemoteSttConfig', { enabled: true, baseUrl: 'http://x/v1', model: 'whisper-large-v3' }) as { ok: boolean };
  assert.equal(r.ok, true);
  assert.equal(kv.get('voice.stt.openai-whisper-api.apiKey'), 'secret');
  assert.equal(kv.get('voice.transcriptionMode'), 'openai-whisper-api');
});

test('bv:setRemoteSttConfig clears the key when apiKey is an explicit empty string', () => {
  const kv = fakeKv({ 'voice.stt.openai-whisper-api.apiKey': 'secret' });
  const { ipcMain, invoke } = fakeIpc();
  registerLlmIpc(ipcMain, { kv: () => kv, secrets: () => null });
  invoke('bv:setRemoteSttConfig', { enabled: true, baseUrl: 'http://x/v1', model: 'm', apiKey: '' });
  assert.equal(kv.get('voice.stt.openai-whisper-api.apiKey'), '');
});
