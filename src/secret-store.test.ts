import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSecretStore, type SafeStorageLike } from './secret-store.ts';

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sv-secret-')), 'secrets.json');
}

/** Fake "encrypting" backend: reversible prefix (not real crypto — just proves the path). */
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
