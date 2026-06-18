import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecretBackedKv, REMOTE_STT_KEY_ID } from './secret-backed-kv.ts';
import type { KvStore } from './kv-store.ts';
import type { SecretStore } from './secret-store.ts';

function fakeKv(seed?: Record<string, string>): KvStore {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: (k) => (map.has(k) ? map.get(k)! : null), set: (k, v) => { map.set(k, v); } };
}

function fakeSecrets(seed?: Record<string, string>): SecretStore {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getSecret: (k) => (map.has(k) ? map.get(k)! : null),
    setSecret: (k, v) => { map.set(k, v); },
    hasSecret: (k) => map.has(k),
    clearSecret: (k) => { map.delete(k); },
    isEncrypted: () => true,
  };
}

test('createSecretBackedKv reads remote STT key from SecretStore', () => {
  const kv = createSecretBackedKv(fakeKv({ [REMOTE_STT_KEY_ID]: 'plain' }), fakeSecrets({ [REMOTE_STT_KEY_ID]: 'secret' }));
  assert.equal(kv.get(REMOTE_STT_KEY_ID), 'secret');
});

test('createSecretBackedKv keeps non-secret keys on the wrapped KV store', () => {
  const kv = createSecretBackedKv(fakeKv({ 'voice.transcriptionMode': 'openai-whisper-api' }), fakeSecrets());
  assert.equal(kv.get('voice.transcriptionMode'), 'openai-whisper-api');
});
